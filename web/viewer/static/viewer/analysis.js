/* 분포 분석의 셈 — 지도와 상관없는 순수 함수(koprifossillab P01). map.js 가 부르고, 시험은 web/viewer/jstest/analysis.test.js(CI, node).
 *
 * - share: 산지(산출)가 한 시점에 속할 몫 = 연대 범위가 시점 창과 겹친 길이 ÷ 범위 길이(균등분포의 기대값, P01 §5.1).
 *   정의는 pipeline/common.py 의 frame_share 와 같고, 두 시험이 같은 보기(pipeline/tests/share_cases.json)를 쓴다
 * - weightedQuantile: 몫으로 가중한 분위수(고위도 곡선)
 * - monteCarlo: 산지마다 범위 안에서 나이를 균등하게 뽑아 시점에 넣기를 되풀이 — 시점마다 수의 띠. 한 산지의 산출은 같은 나이를 함께 쓴다
 *   (산출마다 따로 뽑으면 한 산지의 기록이 여러 시점에 흩어져 분산을 낮게 잡는다). 씨앗을 고정해 늘 같은 띠가 나온다
 * - identMarks: PBDB 산출(show=ident)의 동정 표지 — g 속 불확실·s 종 불확실·h 속까지 동정 안 됨·n 새 이름(koprifossillab 045).
 *   규칙은 pipeline/quality.py(index.json rules.quality), 보기는 pipeline/tests/quality_cases.json
 * - straddles: 연대 범위가 양쪽으로 넘는 대멸종 경계(koprifossillab 046) — quality.straddles 와 같다
 */
(function (root) {
  "use strict";

  // 연대 범위 [young, old] 가 창 [lo, hi] 와 겹친 몫. 범위 길이가 0 이면 그 나이가 창 안에 들 때 1
  function share(old, young, lo, hi) {
    old = +old; young = +young;
    if (old < young) { var t = old; old = young; young = t; }
    var span = old - young;
    if (!(span > 1e-9)) return lo <= old && old <= hi ? 1 : 0;
    var overlap = Math.min(old, hi) - Math.max(young, lo);
    return overlap > 0 ? Math.min(1, overlap / span) : 0;
  }

  // 값과 가중치로 분위수 p(0~1). 가중치 합이 0 이면 null. 정렬한 누적 가중치의 가운데 점 사이를 선으로 잇는다
  function weightedQuantile(values, weights, p) {
    var items = [];
    for (var i = 0; i < values.length; i++) if (weights[i] > 0 && values[i] != null) items.push([+values[i], +weights[i]]);
    if (!items.length) return null;
    items.sort(function (a, b) { return a[0] - b[0]; });
    var total = 0;
    items.forEach(function (it) { total += it[1]; });
    var target = p * total, acc = 0, prev = null;
    for (var k = 0; k < items.length; k++) {
      var mid = acc + items[k][1] / 2;          // 이 값이 차지하는 무게의 가운데
      if (target <= mid) {
        if (!prev) return items[k][0];
        return prev[0] + (items[k][0] - prev[0]) * (target - prev[1]) / (mid - prev[1]);
      }
      prev = [items[k][0], mid];
      acc += items[k][1];
    }
    return items[items.length - 1][0];
  }

  // 씨앗이 있는 난수(mulberry32) — 브라우저마다 같은 띠
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // groups: [{ old, young, n }] — 산지 하나(그 산지의 산출 n 건). windows: [[lo, hi], …] 시점 창(겹쳐도 된다 — 최근 절 시점).
  // 돌려주는 것: 시점마다 { lo, hi }(되풀이한 수의 2.5·97.5 % 분위)
  function monteCarlo(groups, windows, runs, seed) {
    var buckets = {};               // 1 Myr 칸 → 그 칸에 걸친 창들
    windows.forEach(function (w, j) {
      for (var k = Math.floor(w[0]); k <= Math.floor(w[1]); k++) (buckets[k] = buckets[k] || []).push(j);
    });
    var random = rng(seed), samples = windows.map(function () { return []; });
    for (var r = 0; r < runs; r++) {
      var counts = new Array(windows.length).fill(0);
      for (var g = 0; g < groups.length; g++) {
        var it = groups[g], old = +it.old, young = +it.young;
        if (old < young) { var t = old; old = young; young = t; }
        var age = young + (old - young) * random();
        (buckets[Math.floor(age)] || []).forEach(function (j) {
          if (windows[j][0] <= age && age <= windows[j][1]) counts[j] += it.n;
        });
      }
      counts.forEach(function (c, j) { samples[j].push(c); });
    }
    return samples.map(function (list) {
      list.sort(function (a, b) { return a - b; });
      var q = function (p) { return list[Math.min(list.length - 1, Math.max(0, Math.round((list.length - 1) * p)))]; };
      return { lo: q(0.025), hi: q(0.975) };
    });
  }

  function identMarks(rec, rules) {
    var out = "", reso = function (k) { return String(rec[k] || "").trim(); };
    var has = function (list, v) { return (list || []).indexOf(v) >= 0; };
    if (has(rules.uncertain_reso, reso("primary_reso")) || has(rules.uncertain_reso, reso("subgenus_reso"))) out += "g";
    if (has(rules.uncertain_species_reso, reso("species_reso"))) out += "s";
    var rank = reso("identified_rank");
    if (rank && !has(rules.genus_or_below, rank)) out += "h";
    if (["primary_reso", "subgenus_reso", "species_reso"].some(function (k) { return has(rules.new_reso, reso(k)); })) out += "n";
    return out;
  }

  // boundaries: [{ id, old, young }](점 사건은 old = young). 범위가 그 경계를 허용(rules.boundary_tolerance_ma)보다 더 양쪽으로 넘으면
  function straddles(old, young, boundaries, rules) {
    old = +old; young = +young;
    if (old < young) { var t = old; old = young; young = t; }
    var tol = rules.boundary_tolerance_ma;
    return boundaries.filter(function (b) { return young < b.young - tol && old > b.old + tol; }).map(function (b) { return b.id; });
  }

  root.WegenerAnalysis = { share: share, weightedQuantile: weightedQuantile, rng: rng, monteCarlo: monteCarlo, identMarks: identMarks,
                           straddles: straddles };
  if (typeof module !== "undefined") module.exports = root.WegenerAnalysis;
})(typeof window !== "undefined" ? window : globalThis);
