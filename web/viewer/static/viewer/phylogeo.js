/* 계통 생물지리와 고지형의 셈 — 지도와 상관없는 순수 함수(tupandactyl 035). map.js 가 부르고, 시험은 web/viewer/jstest/phylogeo.test.js(CI, node).
 *
 * 묶음(pipeline/phylogeo.py → phylogeo/<id>.json)은 연대 나무의 노드마다 나이·부모·끝 이름과 범위 확률을 담는다.
 * - top: 노드에서의 범위(가지 꼭대기 = 갈라지기 직전) — BioGeoBEARS 의 ML_marginal_prob_each_state_at_branch_top_AT_node
 * - bottom: 부모에서 갈라진 직후 이 가지가 받은 범위 — …_at_branch_bottom_below_node. 분기 사건(이주·분단·건너뛰기 종분화)은
 *   부모의 top 과 자식의 bottom 사이에 있다
 *
 * - lineagesAt: 나이 t 를 지나는 가지들 — 부모 나이 > t ≥ 노드 나이. 가지 위의 범위는 **t 에 가까운 쪽 끝**의 확률이다
 *   (t 가 가지의 아래 절반이면 bottom, 위 절반이면 top). 가지 가운데의 변화(분산·소멸)는 노드 확률만으로는 시점을 모른다 —
 *   생물지리 확률 지도화(BSM)가 그것을 주지만 아직 싣지 않았다(검토 문서 §4)
 * - areaMarginals: 범위 확률 → 지역마다 "그 지역에 있었을" 확률(그 지역을 품은 범위들의 합)
 * - splitsNear: 나이 창 [lo, hi] 안에서 갈라진 노드와 두 딸 가지의 범위 — 지도에 화살표로
 * - cladeLabel: 노드 아래 끝 이름들의 요약("Dolichopoda 외 22")
 * - sphericalCentroid·convexHull: 지역 지점(그 나이로 돌린)의 가운데와 껍질
 * - contours: 격자의 등고선(마칭 스퀘어) — 지형 격자(terrain/*.webp, 1/4°)에서 고지형 등고선을 그린다
 */
(function (root) {
  "use strict";

  // 지역 색 — 9 지역까지. dataviz 검사기(밝기·채도·색각이상 ΔE·정상시 ΔE)를 통과한 순서다. 대비가 낮은 셋(C·D·E)은
  // 지도에서 늘 지역 글자를 함께 적어 색만으로 읽지 않게 한다
  var AREA_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948", "#7d3fa8"];

  function prepare(bundle) {
    var byId = {}, kids = {};
    bundle.nodes.forEach(function (n) { byId[n.id] = n; kids[n.id] = []; });
    bundle.nodes.forEach(function (n) { if (n.parent != null) kids[n.parent].push(n.id); });
    var codes = Object.keys(bundle.areas);
    var color = {};
    codes.forEach(function (c, i) { color[c] = AREA_COLORS[i % AREA_COLORS.length]; });
    var rootNode = bundle.nodes.filter(function (n) { return n.parent == null; })[0];
    return { bundle: bundle, byId: byId, kids: kids, codes: codes, color: color, root: rootNode };
  }

  function lineagesAt(P, t) {
    var out = [];
    P.bundle.nodes.forEach(function (n) {
      if (n.parent == null) return;
      var pa = P.byId[n.parent].age;
      if (!(pa > t && t >= n.age - 1e-9)) return;
      var nearBottom = (pa - t) < (t - n.age);
      out.push({ node: n, probs: (nearBottom ? n.bottom : n.top) || n.top, end: nearBottom ? "bottom" : "top" });
    });
    // 뿌리보다 오래된 시점 — 뿌리 노드 하나(뿌리 가지)
    if (!out.length && P.root && t >= P.root.age) out.push({ node: P.root, probs: P.root.top, end: "top", stem: true });
    return out;
  }

  function areaMarginals(probs, codes) {
    var m = {};
    codes.forEach(function (c) { m[c] = 0; });
    Object.keys(probs || {}).forEach(function (range) {
      if (range === "_") return;
      for (var i = 0; i < range.length; i++) if (m[range[i]] !== undefined) m[range[i]] += probs[range];
    });
    return m;
  }

  function best(probs) {
    var k = null, v = -1;
    Object.keys(probs || {}).forEach(function (r) { if (r !== "_" && probs[r] > v) { v = probs[r]; k = r; } });
    return { range: k, p: v < 0 ? 0 : v };
  }

  function splitsNear(P, lo, hi) {
    var out = [];
    P.bundle.nodes.forEach(function (n) {
      if (P.kids[n.id].length < 2 || n.age < lo || n.age > hi) return;
      out.push({ node: n, from: best(n.top), kids: P.kids[n.id].map(function (k) { var c = P.byId[k]; return { node: c, to: best(c.bottom || c.top) }; }) });
    });
    return out;
  }

  function tipsUnder(P, id, acc) {
    acc = acc || [];
    var n = P.byId[id];
    if (n.tip) acc.push(n.tip);
    P.kids[id].forEach(function (k) { tipsUnder(P, k, acc); });
    return acc;
  }

  function cladeLabel(P, id) {
    var tips = tipsUnder(P, id).map(function (s) { return s.replace(/_/g, " "); });
    if (tips.length === 1) return tips[0];
    var genera = {};
    tips.forEach(function (s) { var g = s.split(" ")[0]; genera[g] = (genera[g] || 0) + 1; });
    var names = Object.keys(genera).sort(function (a, b) { return genera[b] - genera[a] || (a < b ? -1 : 1); });
    return { genera: names, tips: tips.length };
  }

  // 지점들의 구면 평균 — [[위도, 경도] …] → [위도, 경도]
  function sphericalCentroid(points) {
    var x = 0, y = 0, z = 0, d = Math.PI / 180;
    points.forEach(function (p) {
      var la = p[0] * d, lo = p[1] * d;
      x += Math.cos(la) * Math.cos(lo); y += Math.cos(la) * Math.sin(lo); z += Math.sin(la);
    });
    var r = Math.sqrt(x * x + y * y + z * z);
    if (!points.length || r < 1e-12) return null;
    return [Math.asin(z / r) / d, Math.atan2(y, x) / d];
  }

  // 평면(경도, 위도)의 볼록 껍질 — 지역은 좁아 평면으로 충분하다. 경도는 가운데에 맞춰 펴서 날짜변경선을 넘지 않게 한다
  function convexHull(points) {
    if (points.length < 3) return points.slice();
    var c = sphericalCentroid(points), lon0 = c ? c[1] : 0;
    var pts = points.map(function (p) { var l = p[1] - lon0; l = ((l + 540) % 360) - 180; return [l, p[0]]; })
      .sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    function cross(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
    var lower = [], upper = [];
    pts.forEach(function (p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); });
    pts.slice().reverse().forEach(function (p) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); });
    return lower.slice(0, -1).concat(upper.slice(0, -1)).map(function (p) { return [p[1], p[0] + lon0]; });
  }

  // 마칭 스퀘어 — z: 행 북→남, 열 서→동인 Float32Array(w × h). 값이 level 을 넘는 쪽과 아닌 쪽의 경계를 선분으로 찾아 이어 붙인다.
  // 돌려주는 것은 [[행, 열] …] 꼴(소수) 선들의 목록. 격자 칸 안의 두 대각 모서리가 같은 쪽인 안장(5·10)은 칸 가운데 값으로 가른다
  function contours(z, w, h, level) {
    var segs = [];
    function v(r, c) { return z[r * w + c]; }
    function lerp(a, b) { return (level - a) / (b - a); }
    for (var r = 0; r < h - 1; r++) {
      for (var c = 0; c < w - 1; c++) {
        var a = v(r, c), b = v(r, c + 1), d = v(r + 1, c), e = v(r + 1, c + 1);   // a 왼위 b 오른위 d 왼아래 e 오른아래
        var k = (a > level ? 8 : 0) | (b > level ? 4 : 0) | (e > level ? 2 : 0) | (d > level ? 1 : 0);
        if (k === 0 || k === 15) continue;
        var top = [r, c + lerp(a, b)], right = [r + lerp(b, e), c + 1], bottom = [r + 1, c + lerp(d, e)], left = [r + lerp(a, d), c];
        switch (k) {
          case 1: case 14: segs.push([left, bottom]); break;
          case 2: case 13: segs.push([bottom, right]); break;
          case 3: case 12: segs.push([left, right]); break;
          case 4: case 11: segs.push([top, right]); break;
          case 6: case 9: segs.push([top, bottom]); break;
          case 7: case 8: segs.push([left, top]); break;
          case 5: case 10:
            var mid = (a + b + d + e) / 4 > level;
            if ((k === 5) === mid) { segs.push([left, top]); segs.push([bottom, right]); }
            else { segs.push([left, bottom]); segs.push([top, right]); }
            break;
        }
      }
    }
    return join(segs);
  }

  // 선분을 끝점으로 이어 긴 선으로 — 점 수와 그리기 횟수를 줄인다
  function join(segs) {
    function key(p) { return Math.round(p[0] * 1e4) + ":" + Math.round(p[1] * 1e4); }
    var ends = {}, used = new Array(segs.length), lines = [];
    segs.forEach(function (s, i) { [0, 1].forEach(function (j) { var k = key(s[j]); (ends[k] = ends[k] || []).push(i); }); });
    function take(p, skip) {
      var list = ends[key(p)] || [];
      for (var i = 0; i < list.length; i++) if (!used[list[i]] && list[i] !== skip) return list[i];
      return -1;
    }
    for (var i = 0; i < segs.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      var line = [segs[i][0], segs[i][1]];
      [1, 0].forEach(function (side) {
        var guard = segs.length;
        while (guard-- > 0) {
          var tip = side ? line[line.length - 1] : line[0], j = take(tip, -1);
          if (j < 0) break;
          used[j] = true;
          var s = segs[j], next = key(s[0]) === key(tip) ? s[1] : s[0];
          if (side) line.push(next); else line.unshift(next);
        }
      });
      lines.push(line);
    }
    return lines;
  }

  // 지형 격자 그림(R·G 에 (해발 + offset) / unit 의 16 비트, terrain.py)을 해발(m)로. step 칸마다 하나씩 줄여 읽는다
  function decodeTerrain(rgba, w, h, offset, unit, step) {
    step = step || 1;
    var ow = Math.floor((w - 1) / step) + 1, oh = Math.floor((h - 1) / step) + 1, out = new Float32Array(ow * oh);
    for (var r = 0; r < oh; r++) for (var c = 0; c < ow; c++) {
      var i = ((r * step) * w + c * step) * 4;
      out[r * ow + c] = ((rgba[i] << 8) | rgba[i + 1]) * unit - offset;
    }
    return { z: out, w: ow, h: oh };
  }

  var api = { AREA_COLORS: AREA_COLORS, prepare: prepare, lineagesAt: lineagesAt, areaMarginals: areaMarginals, best: best,
              splitsNear: splitsNear, tipsUnder: tipsUnder, cladeLabel: cladeLabel, sphericalCentroid: sphericalCentroid,
              convexHull: convexHull, contours: contours, decodeTerrain: decodeTerrain };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WegenerPhylo = api;
})(this);
