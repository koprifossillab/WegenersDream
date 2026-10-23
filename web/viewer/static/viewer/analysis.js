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
 * - localityKey: 고유 산지-시간의 열쇠(koprifossillab 047) — common.locality_key 와 같다(보기 pipeline/tests/locality_cases.json)
 * - gridCell: 등면적 격자 칸(Equal Earth, rules.analysis.grid_km) — common.grid_cell 과 같다(koprifossillab 053, 보기 pipeline/tests/grid_cases.json)
 * - coverageRarefy: 표본 범위 표준화 풍부도(Chao et al. 2014, incidence) — common.coverage_rarefy 와 같다(koprifossillab 054, 보기 pipeline/tests/coverage_cases.json)
 * - outliers: 시공간 외톨이 시험(koprifossillab 055) — CoordinateCleaner cf_outl 을 따른 것. 무리(속)마다 기록들 사이의 시간 차(범위 안의 무작위
 *   나이)와 거리(오늘날 좌표, 현의 길이) 평균을 각각 그 무리의 최댓값으로 나눠 더하고, q75 + mltpl × IQR 을 넘으면 외톨이. replicates 번 되풀이해
 *   flag_thresh 넘게 걸리면 표시. 정리(cleaning) 단계에서 빼는 것이 관행이다
 * - equalEarthInverse·cellRing·splitAtSeam: 격자 칸을 지도에 그리기(koprifossillab 058) — 칸의 네 변을 나눠 역투영한 경위도 고리, 지도의
 *   이음매(경도 seam)에서 둘로 자른다
 * - zipStore: 재현 묶음(koprifossillab 048)의 zip — 압축 없이(STORE) 담는다. 글자 파일 몇 개라 라이브러리를 들이지 않는다
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

  // 좌표(소수 decimals 자리)·지층 이름(끝의 Formation·Fm 과 대소문자를 가리지 않는다)·연대 범위
  function localityKey(lat, lng, formation, old, young, decimals) {
    old = +old; young = +young;
    if (old < young) { var t = old; old = young; young = t; }
    var form = String(formation || "").toLowerCase().replace(/\s+(formation|fm\.?)$/, "").trim();
    return [(+lat).toFixed(decimals), (+lng).toFixed(decimals), form, String(old), String(young)].join("|");
  }

  // Equal Earth(Šavrič et al. 2018), 구면 근사 — 파이프라인 common.equal_earth 와 같은 상수
  var EE = [1.340264, -0.081106, 0.000893, 0.003796], EARTH_KM = 6371.0088;
  function equalEarth(lat, lng) {
    var m = Math.sqrt(3) / 2, theta = Math.asin(m * Math.sin(lat * Math.PI / 180)), t2 = theta * theta, t6 = Math.pow(theta, 6);
    var x = EARTH_KM * (lng * Math.PI / 180) * Math.cos(theta) / (m * (EE[0] + 3 * EE[1] * t2 + t6 * (7 * EE[2] + 9 * EE[3] * t2)));
    var y = EARTH_KM * theta * (EE[0] + EE[1] * t2 + t6 * (EE[2] + EE[3] * t2));
    return [x, y];
  }
  // Equal Earth 역투영 — θ 를 뉴턴법으로(Šavrič et al. 2018). 투영 밖의 x 는 경도 ±180 으로 자른다
  function equalEarthInverse(x, y) {
    var m = Math.sqrt(3) / 2, yy = y / EARTH_KM, theta = yy, tmax = Math.asin(m);
    for (var i = 0; i < 12; i++) {
      var t2 = theta * theta, t6 = Math.pow(theta, 6);
      var fy = theta * (EE[0] + EE[1] * t2 + t6 * (EE[2] + EE[3] * t2)) - yy;
      var fp = EE[0] + 3 * EE[1] * t2 + t6 * (7 * EE[2] + 9 * EE[3] * t2);
      var d = fy / fp;
      theta -= d;
      if (Math.abs(d) < 1e-12) break;
    }
    theta = Math.max(-tmax, Math.min(tmax, theta));
    var t2b = theta * theta, t6b = Math.pow(theta, 6);
    var lng = m * (x / EARTH_KM) * (EE[0] + 3 * EE[1] * t2b + t6b * (7 * EE[2] + 9 * EE[3] * t2b)) / Math.cos(theta) * 180 / Math.PI;
    var lat = Math.asin(Math.max(-1, Math.min(1, Math.sin(theta) / m))) * 180 / Math.PI;
    return [lat, Math.max(-180, Math.min(180, lng))];
  }
  // 칸 "열:행" 의 경위도 고리 — 변마다 n 개로 나눠 역투영한다(몰바이데에서 굽은 칸이 맞게)
  function cellRing(key, km, n) {
    var p = String(key).split(":"), i = +p[0], j = +p[1], out = [];
    n = n || 4;
    var corners = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1], [i, j]];
    for (var c = 0; c < 4; c++) {
      for (var s = 0; s < n; s++) {
        var u = corners[c][0] + (corners[c + 1][0] - corners[c][0]) * s / n, v = corners[c][1] + (corners[c + 1][1] - corners[c][1]) * s / n;
        out.push(equalEarthInverse(u * km, v * km));
      }
    }
    return out;
  }
  // 고리를 지도의 이음매(경도 seam, 예: 몰바이데 가운데 경선 + 180)에서 잘라 조각 고리들로. 경도를 이음매 왼쪽 360° 구간에 펴고,
  // 이음매를 넘는 조각은 360 을 빼 반대편으로 옮긴다(Sutherland–Hodgman 세로선 자르기)
  function splitAtSeam(ring, seam) {
    var lo = seam - 360, pts = ring.map(function (p) {
      var x = p[1]; while (x > seam) x -= 360; while (x < lo) x += 360; return [p[0], x];
    });
    // 칸은 작다 — 경도가 180 넘게 벌어지면 이음매에 걸친 것이다. 첫 점 쪽으로 이어 붙인다
    var base = pts[0][1];
    pts = pts.map(function (p) { var x = p[1]; if (x - base > 180) x -= 360; else if (base - x > 180) x += 360; return [p[0], x]; });
    var clip = function (keepLeft) {
      var out = [], inside = function (p) { return keepLeft ? p[1] <= seam : p[1] >= seam; };
      for (var k = 0; k < pts.length; k++) {
        var a = pts[k], b = pts[(k + 1) % pts.length], ia = inside(a), ib = inside(b);
        if (ia) out.push(a);
        if (ia !== ib) { var t = (seam - a[1]) / (b[1] - a[1]); out.push([a[0] + (b[0] - a[0]) * t, seam]); }
      }
      return out;
    };
    var right = clip(false);
    if (right.length < 3) return [pts];
    var left = clip(true);
    return (left.length >= 3 ? [left] : []).concat([right.map(function (p) { return [p[0], p[1] === seam ? lo : p[1] - 360]; })]);
  }
  function gridCell(lat, lng, km) {
    var p = equalEarth(+lat, +lng);
    return Math.floor(p[0] / km) + ":" + Math.floor(p[1] / km);
  }

  // C(T − y, t) / C(T, t)
  function missRatio(T, y, t) {
    if (t > T - y) return 0;
    var r = 1;
    for (var j = 0; j < y; j++) r *= (T - t - j) / (T - j);
    return r;
  }
  function coverageRarefy(incidence, T, quorum, maxExtrapolation) {
    var ys = incidence.filter(function (y) { return y > 0; }), sObs = ys.length;
    if (T < 1 || !sObs) return { s: null, coverage: null, t: null };
    var U = 0, q1 = 0, q2 = 0;
    ys.forEach(function (y) { U += y; if (y === 1) q1 += 1; if (y === 2) q2 += 1; });
    var a;
    if (q1 === 0) a = 0;
    else if (q2 > 0) a = (T - 1) * q1 / ((T - 1) * q1 + 2 * q2);
    else a = (q1 > 1 || T > 1) ? (T - 1) * (q1 - 1) / ((T - 1) * (q1 - 1) + 2) : 0;
    var covObs = 1 - q1 / U * a;
    if (covObs >= quorum) {
      if (covObs === quorum) return { s: sObs, coverage: covObs, t: T };
      // 문턱을 넘는 첫 표본 수를 이분 탐색으로 — 하나씩 보면 표본이 수만인 시점에서 느리다
      var at = function (t) {
        if (t <= 0) return [0, 0];
        if (t >= T) return [covObs, sObs];
        var c = 1, st = 0;
        for (var i = 0; i < ys.length; i++) { c -= ys[i] / U * missRatio(T - 1, ys[i], t); st += 1 - missRatio(T, ys[i], t); }
        return [c, st];
      };
      var lo = 1, hi = T;
      while (lo < hi) { var mid = Math.floor((lo + hi) / 2); if (at(mid)[0] >= quorum) hi = mid; else lo = mid + 1; }
      var cur = at(lo), prev = at(lo - 1), k = cur[0] > prev[0] ? (quorum - prev[0]) / (cur[0] - prev[0]) : 1;
      return { s: prev[1] + (cur[1] - prev[1]) * k, coverage: covObs, t: lo - 1 + k };
    }
    if (q1 === 0 || a <= 0 || a >= 1) return { s: null, coverage: covObs, t: null };
    var tStar = Math.log((1 - quorum) * U / q1) / Math.log(a) - 1;
    if (tStar > (maxExtrapolation - 1) * T) return { s: null, coverage: covObs, t: null };
    var q0 = (T - 1) / T * (q2 > 0 ? q1 * q1 / (2 * q2) : q1 * (q1 - 1) / 2);
    var sExt = sObs + (q0 > 0 ? q0 * (1 - Math.pow(1 - q1 / (T * q0 + q1), tStar)) : 0);
    return { s: sExt, coverage: covObs, t: T + tStar };
  }

  // records: [{ old, young, lat, lng, group }] → 외톨이인가(true/false) 배열. opts: rules.analysis.outlier
  function outliers(records, opts, seed) {
    var out = records.map(function () { return false; }), random = rng(seed || 1), groups = {};
    records.forEach(function (r, i) { if (r.group != null && r.lat != null && r.lng != null) (groups[r.group] = groups[r.group] || []).push(i); });
    var quant = function (sorted, p) {
      var k = (sorted.length - 1) * p, lo = Math.floor(k), hi = Math.ceil(k);
      return sorted[lo] + (sorted[hi] - sorted[lo]) * (k - lo);
    };
    Object.keys(groups).forEach(function (g) {
      var idx = groups[g], n = idx.length;
      if (n < opts.size_thresh) return;
      // 오늘날 좌표의 단위 벡터 — 거리는 현의 길이(대권 거리와 같은 차례)
      var xyz = idx.map(function (i) {
        var la = records[i].lat * Math.PI / 180, lo = records[i].lng * Math.PI / 180;
        return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
      });
      var ref = idx.map(function (_, k) { return k; });
      if (n > opts.max_reference) {              // 큰 무리는 기준을 뽑아 견준다
        for (var s = ref.length - 1; s > 0; s--) { var j = Math.floor(random() * (s + 1)), t = ref[s]; ref[s] = ref[j]; ref[j] = t; }
        ref = ref.slice(0, opts.max_reference);
      }
      var hits = new Array(n).fill(0);
      for (var rep = 0; rep < opts.replicates; rep++) {
        var ages = idx.map(function (i) { var r = records[i], a = Math.min(r.old, r.young), b = Math.max(r.old, r.young); return a + (b - a) * random(); });
        var dt = new Array(n), dg = new Array(n), mt = 0, mg = 0;
        for (var a = 0; a < n; a++) {
          var st = 0, sg = 0;
          for (var q = 0; q < ref.length; q++) {
            var b = ref[q];
            st += Math.abs(ages[a] - ages[b]);
            var dx = xyz[a][0] - xyz[b][0], dy = xyz[a][1] - xyz[b][1], dz = xyz[a][2] - xyz[b][2];
            sg += Math.sqrt(dx * dx + dy * dy + dz * dz);
          }
          dt[a] = st / ref.length; dg[a] = sg / ref.length;
          if (dt[a] > mt) mt = dt[a];
          if (dg[a] > mg) mg = dg[a];
        }
        var sum = dt.map(function (v, k) { return (mt ? v / mt : 0) + (mg ? dg[k] / mg : 0); });
        var sorted = sum.slice().sort(function (p, r) { return p - r; });
        var q1 = quant(sorted, 0.25), q3 = quant(sorted, 0.75), cut = q3 + opts.mltpl * (q3 - q1);
        sum.forEach(function (v, k) { if (v > cut) hits[k] += 1; });
      }
      hits.forEach(function (h, k) { if (h / opts.replicates > opts.flag_thresh) out[idx[k]] = true; });
    });
    return out;
  }

  var CRC_TABLE = null;
  function crc32(bytes) {
    if (!CRC_TABLE) {
      CRC_TABLE = new Uint32Array(256);
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        CRC_TABLE[n] = c >>> 0;
      }
    }
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }
  function utf8(text) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text);
    return new Uint8Array(Buffer.from(text, "utf8"));      // node 의 옛 판
  }
  // files: [{ name, text }] → zip 의 바이트. 이름은 UTF-8(일반 목적 비트 11), 시각은 date(없으면 1980-01-01)
  function zipStore(files, date) {
    var d = date || new Date(1980, 0, 1);
    var dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    var dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    var chunks = [], central = [], offset = 0;
    var u16 = function (v) { return [v & 0xFF, (v >>> 8) & 0xFF]; };
    var u32 = function (v) { return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]; };
    files.forEach(function (f) {
      var name = utf8(f.name), data = utf8(f.text), crc = crc32(data);
      var common = [].concat(u16(20), u16(0x0800), u16(0), u16(dosTime), u16(dosDate), u32(crc), u32(data.length), u32(data.length),
                             u16(name.length), u16(0));
      var local = new Uint8Array([0x50, 0x4B, 0x03, 0x04].concat(common));
      chunks.push(local, name, data);
      central.push(new Uint8Array([0x50, 0x4B, 0x01, 0x02].concat(u16(20), common, u16(0), u16(0), u16(0), u32(0), u32(offset))), name);
      offset += local.length + name.length + data.length;
    });
    var size = central.reduce(function (a, c) { return a + c.length; }, 0);
    var end = new Uint8Array([0x50, 0x4B, 0x05, 0x06].concat(u16(0), u16(0), u16(files.length), u16(files.length), u32(size), u32(offset), u16(0)));
    var all = chunks.concat(central, [end]), total = all.reduce(function (a, c) { return a + c.length; }, 0);
    var out = new Uint8Array(total), at = 0;
    all.forEach(function (c) { out.set(c, at); at += c.length; });
    return out;
  }

  root.WegenerAnalysis = { share: share, weightedQuantile: weightedQuantile, rng: rng, monteCarlo: monteCarlo, identMarks: identMarks,
                           straddles: straddles, localityKey: localityKey, crc32: crc32, zipStore: zipStore,
                           equalEarth: equalEarth, equalEarthInverse: equalEarthInverse, cellRing: cellRing, splitAtSeam: splitAtSeam,
                           gridCell: gridCell, coverageRarefy: coverageRarefy, outliers: outliers };
  if (typeof module !== "undefined") module.exports = root.WegenerAnalysis;
})(typeof window !== "undefined" ? window : globalThis);
