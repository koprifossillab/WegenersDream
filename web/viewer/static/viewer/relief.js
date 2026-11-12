/* 높이 도드라지게(tupandactyl 037) — PaleoDEM 지형 격자에서 음영 기복과 산줄기(대동여지도식)를 셈한다.
 *
 * 순수 함수만 둔다(그리기는 map.js). 격자는 phylogeo.decodeTerrain 의 꼴 { z, w, h, deg } — 0 행이 북위 90°, 0 열이 서경 180°.
 *
 * - hillshade: 빛을 북서(315°)·서(270°)·북(0°)에서 비춘 셋의 가중 평균(여러 방향 음영 — 한 방향이면 빛과 나란한 산맥이 사라진다).
 *   평지의 밝기를 0 으로 둔 차이(−1 ~ +1)를 낸다 — 지도 위에 검게(그늘)·희게(볕) 겹치려고
 * - ridges: 대동여지도가 산을 낱낱의 봉우리가 아니라 **이어진 산줄기**로, 큰 산줄기일수록 굵게 그린 방식. 칸이 네 방향(동서·남북·두 대각) 가운데
 *   하나에서 양옆보다 높으면(단면의 꼭대기) 능선 칸이고, 이웃한 능선 칸끼리 잇는다. 굵기는 높이로
 */
(function (root) {
  "use strict";
  var DEG_M = 111194.9;            // 1° 의 길이(m)

  function hillshade(g, exag) {
    var w = g.w, h = g.h, z = g.z, out = new Float32Array(w * h), e = exag || 1;
    var dy = g.deg * DEG_M;
    var lights = [[315, 0.5], [270, 0.25], [0, 0.25]], alt = 45 * Math.PI / 180;
    var L = lights.map(function (l) {
      var az = l[0] * Math.PI / 180;
      return [Math.cos(alt) * Math.sin(az), Math.cos(alt) * Math.cos(az), Math.sin(alt), l[1]];
    });
    var flat = Math.sin(alt);
    for (var r = 0; r < h; r++) {
      var lat = 90 - r * g.deg, dx = Math.max(dy * Math.cos(lat * Math.PI / 180), dy * 0.05);
      var rn = Math.max(0, r - 1), rs = Math.min(h - 1, r + 1);
      for (var c = 0; c < w; c++) {
        var cw = (c - 1 + w) % w, ce = (c + 1) % w;
        var gx = (z[r * w + ce] - z[r * w + cw]) / (2 * dx) * e;           // 동쪽으로 오르막
        var gy = (z[rn * w + c] - z[rs * w + c]) / ((rs - rn || 1) * dy) * e;   // 북쪽으로 오르막
        var n = Math.sqrt(gx * gx + gy * gy + 1), s = 0;
        for (var k = 0; k < L.length; k++) s += L[k][3] * (-gx * L[k][0] - gy * L[k][1] + L[k][2]) / n;
        out[r * w + c] = s - flat;
      }
    }
    return out;
  }

  // 능선 칸 — 3×3 평균으로 고른 높이에서
  //  1) 한 방향이라도 단면의 꼭대기(양옆보다 높고 그 평균보다 minRise 이상)
  //  2) 둘레(반지름 radius 칸)의 가장 낮은 곳보다 minProm 이상 솟았다 — 고원 위의 잔물결은 높아도 산줄기가 아니다(티베트가 검게 덮였다)
  //  3) 이웃끼리 이은 덩이가 minCells 칸 이상 — 외딴 점·짧은 조각은 뺀다(대동여지도는 줄기만 그린다)
  // prom(솟은 높이)을 함께 낸다 — 굵기는 절대 높이가 아니라 솟은 높이로 준다
  function ridgeMask(g, opt) {
    opt = opt || {};
    var minElev = opt.minElev == null ? 300 : opt.minElev, minRise = opt.minRise == null ? 30 : opt.minRise;
    var minProm = opt.minProm == null ? 400 : opt.minProm, radius = opt.radius || 4, minCells = opt.minCells || 6;
    var w = g.w, h = g.h, z = g.z, sm = new Float32Array(w * h), m = new Uint8Array(w * h), prom = new Float32Array(w * h);
    var r, c, i, j;
    for (r = 0; r < h; r++) for (c = 0; c < w; c++) {
      var s = 0, n = 0;
      for (i = -1; i <= 1; i++) {
        var rr = r + i;
        if (rr < 0 || rr >= h) continue;
        for (j = -1; j <= 1; j++) { s += Math.max(0, z[rr * w + (c + j + w) % w]); n += 1; }   // 바다는 해수면으로 — 해안이 해저보다 솟아 산줄기로 잡히지 않게
      }
      sm[r * w + c] = s / n;
    }
    // 둘레의 가장 낮은 곳 — 가로로 한 번, 세로로 한 번(정사각 창의 최솟값)
    var rowMin = new Float32Array(w * h), low = new Float32Array(w * h);
    for (r = 0; r < h; r++) for (c = 0; c < w; c++) {
      var mn = Infinity;
      for (j = -radius; j <= radius; j++) mn = Math.min(mn, sm[r * w + (c + j + w) % w]);
      rowMin[r * w + c] = mn;
    }
    for (r = 0; r < h; r++) for (c = 0; c < w; c++) {
      mn = Infinity;
      for (i = Math.max(0, r - radius); i <= Math.min(h - 1, r + radius); i++) mn = Math.min(mn, rowMin[i * w + c]);
      low[r * w + c] = mn;
    }
    var axes = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (r = 1; r < h - 1; r++) for (c = 0; c < w; c++) {
      var k = r * w + c, v = sm[k];
      prom[k] = v - low[k];
      if (v < minElev || prom[k] < minProm) continue;
      // 가장 크게 굽은 방향에서 꼭대기여야 한다 — 산줄기 끝·비탈의 대각이 꼭대기로 잡히지 않게(굽음이 가장 큰 방향은 줄기를 가로지른다)
      // 굽음이 거의 같은 방향이 여럿이면(1 m 안) 모두에서 꼭대기여야 한다
      var bends = [], tops = [], best = -Infinity, a;
      for (a = 0; a < 4; a++) {
        var dr = axes[a][0], dc = axes[a][1];
        var p = sm[(r - dr) * w + (c - dc + w) % w], q = sm[(r + dr) * w + (c + dc + w) % w];
        bends.push(v - (p + q) / 2); tops.push(v > p && v > q);
        best = Math.max(best, bends[a]);
      }
      var ok = best >= minRise;
      for (a = 0; a < 4 && ok; a++) if (bends[a] >= best - 1 && !tops[a]) ok = false;
      if (ok) m[k] = 1;
    }
    // 덩이 크기로 거른다(8 이웃)
    var seen = new Uint8Array(w * h), stack = [], comp = [];
    for (var start = 0; start < w * h; start++) {
      if (!m[start] || seen[start]) continue;
      stack.length = 0; comp.length = 0; stack.push(start); seen[start] = 1;
      while (stack.length) {
        var cur = stack.pop(); comp.push(cur);
        var cr = Math.floor(cur / w), cc = cur % w;
        for (i = -1; i <= 1; i++) for (j = -1; j <= 1; j++) {
          var nr = cr + i;
          if (nr < 0 || nr >= h || (!i && !j)) continue;
          var nk = nr * w + (cc + j + w) % w;
          if (m[nk] && !seen[nk]) { seen[nk] = 1; stack.push(nk); }
        }
      }
      if (comp.length < minCells) comp.forEach(function (x) { m[x] = 0; });
    }
    return { mask: m, smooth: sm, prom: prom };
  }

  // 이웃한 능선 칸을 잇는 토막 [r1, c1, r2, c2, 높이, 솟은 높이] — 오른쪽·아래·두 아래 대각만 보아 한 번씩. 경도 이음매는 잇지 않는다
  function ridges(g, opt) {
    var rm = ridgeMask(g, opt), m = rm.mask, sm = rm.smooth, pr = rm.prom;
    var w = g.w, h = g.h, out = [], nb = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (var r = 0; r < h; r++) for (var c = 0; c < w; c++) {
      if (!m[r * w + c]) continue;
      for (var k = 0; k < nb.length; k++) {
        var r2 = r + nb[k][0], c2 = c + nb[k][1];
        if (r2 >= h || c2 < 0 || c2 >= w || !m[r2 * w + c2]) continue;
        // 대각은 곧은 이웃이 이미 이어 주면 건너뛴다 — 세모가 겹쳐 굵어지지 않게
        if (k >= 2 && (m[r * w + c2] || m[r2 * w + c])) continue;
        out.push([r, c, r2, c2, Math.min(sm[r * w + c], sm[r2 * w + c2]), Math.min(pr[r * w + c], pr[r2 * w + c2])]);
      }
    }
    return out;
  }

  var api = { hillshade: hillshade, ridgeMask: ridgeMask, ridges: ridges };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.WegenerRelief = api;
})(this);
