// 높이 도드라지게의 셈 시험(tupandactyl 037) — `node web/viewer/jstest/relief.test.js`
var R = require("../static/viewer/relief.js");
var fail = 0;
function check(ok, what) { if (!ok) { fail += 1; console.log("✗ " + what); } }

// 격자 만들기 — 0 행이 북위 90°, deg 간격
function grid(w, h, deg, f) {
  var z = new Float32Array(w * h);
  for (var r = 0; r < h; r++) for (var c = 0; c < w; c++) z[r * w + c] = f(r, c);
  return { z: z, w: w, h: h, deg: deg };
}

// 평지는 음영 0
var flat = grid(40, 21, 1, function () { return 100; });
var hs = R.hillshade(flat, 10);
check(Math.abs(hs[10 * 40 + 20]) < 1e-6, "평지는 0");

// 북서에서 빛이 오면 서쪽을 향한 비탈은 볕(+), 동쪽을 향한 비탈은 그늘(−)
var westUp = grid(40, 21, 1, function (r, c) { return 4000 - c * 100; });
var eastUp = grid(40, 21, 1, function (r, c) { return c * 100; });
check(R.hillshade(westUp, 10)[10 * 40 + 20] < 0, "서쪽이 높은(동쪽을 향한) 비탈은 북서 빛에 그늘");
check(R.hillshade(eastUp, 10)[10 * 40 + 20] > 0, "동쪽이 높은(서쪽을 향한) 비탈은 볕");
// 과장이 클수록 더 진하다
check(Math.abs(R.hillshade(eastUp, 20)[10 * 40 + 20]) > Math.abs(R.hillshade(eastUp, 2)[10 * 40 + 20]), "과장");

// 남북으로 뻗은 산줄기(열 20 이 꼭대기, 2000 m, 끝으로 갈수록 낮아진다) — 능선이 이어져 한 줄로
var range = grid(60, 41, 0.25, function (r, c) {
  return Math.max(0, 2000 - Math.abs(c - 20) * 300 - Math.max(0, Math.abs(r - 20) - 8) * 150);
});
var segs = R.ridges(range);
check(segs.length > 10, "산줄기가 토막으로 이어진다 (" + segs.length + ")");
check(segs.every(function (s) { return Math.abs(s[1] - 20) <= 1 && Math.abs(s[3] - 20) <= 1; }), "능선은 꼭대기 열에");
check(segs.every(function (s) { return s[5] >= 400; }), "솟은 높이를 함께 낸다");

// 높고 평평한 고원(4000 m, 작은 물결 30 m)은 산줄기가 아니다 — 둘레보다 솟지 않았다
var plateau = grid(60, 41, 0.25, function (r, c) { return 4000 + 30 * Math.sin(r) * Math.cos(c * 1.7); });
check(R.ridges(plateau).length === 0, "고원 위 잔물결은 뺀다");

// 외딴 봉우리 하나(덩이가 작다)는 뺀다
var peak = grid(60, 41, 0.25, function (r, c) { return (r - 20) * (r - 20) + (c - 30) * (c - 30) <= 1 ? 3000 : 0; });
check(R.ridges(peak).length === 0, "외딴 봉우리는 뺀다");

if (fail) { console.log(fail + " 실패"); process.exit(1); }
console.log("relief: 모두 통과");
