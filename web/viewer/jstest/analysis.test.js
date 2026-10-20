// 분포 분석의 셈 시험(koprifossillab 044) — `node web/viewer/jstest/analysis.test.js`
// 시점 몫의 보기는 파이프라인 시험과 같은 파일(pipeline/tests/share_cases.json)이다 — 정의가 두 곳에서 어긋나지 않게
var path = require("path");
var A = require("../static/viewer/analysis.js");
var cases = require(path.join(__dirname, "../../../pipeline/tests/share_cases.json"));
var fail = 0;
function check(ok, what) { if (!ok) { fail += 1; console.log("✗ " + what); } }
function near(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-6); }

cases.cases.forEach(function (c) {
  var got = A.share(c[0], c[1], c[2], c[3]);
  check(near(got, c[4]), "share(" + c.slice(0, 4).join(", ") + ") 기대 " + c[4] + " 얻음 " + got);
});
// 5 Myr 시점 창에서 몫의 합 = 1
cases.sum.forEach(function (c) {
  var total = 0;
  for (var a = 0; a <= 540; a += 5) total += A.share(c[0], c[1], Math.max(0, a - 2.5), a + 2.5);
  check(near(total, 1), "몫의 합 " + c.join("–") + " = " + total);
});

// 가중 분위수 — 가중치가 같으면 보통 분위수(가운데), 무거운 값 쪽으로 끌린다
check(A.weightedQuantile([1, 2, 3], [1, 1, 1], 0.5) === 2, "가중 중앙값 1,2,3");
check(A.weightedQuantile([0, 10], [1, 3], 0.5) > 5, "무거운 쪽으로");
check(A.weightedQuantile([5], [0.2], 0.25) === 5, "값 하나");
check(A.weightedQuantile([1, 2], [0, 0], 0.5) === null, "가중치 0");

// 몬테카를로 — 씨앗이 같으면 같은 띠, 범위가 창 하나 안이면 띠가 그 수 하나, 평균은 몫의 기대값 둘레
var windows = [], a;
for (a = 0; a <= 100; a += 5) windows.push([Math.max(0, a - 2.5), a + 2.5]);
var groups = [{ old: 51, young: 49, n: 3 }, { old: 72.2, young: 56, n: 10 }];
var m1 = A.monteCarlo(groups, windows, 200, 7), m2 = A.monteCarlo(groups, windows, 200, 7);
check(JSON.stringify(m1) === JSON.stringify(m2), "같은 씨앗 같은 띠");
check(m1[10].lo === 3 && m1[10].hi === 3, "50 Ma 창 안의 산지 — 띠 3–3");
check(m1[12].lo === 0 && m1[12].hi === 10, "60 Ma — 넓은 산지가 들 수도 안 들 수도");
var hits = 0, r = A.rng(1);
for (var k = 0; k < 20000; k++) { var age = 56 + 16.2 * r(); if (age >= 57.5 && age <= 62.5) hits += 1; }
check(near(hits / 20000, A.share(72.2, 56, 57.5, 62.5), 0.02), "뽑기의 평균 ≈ 몫 " + hits / 20000);

if (fail) { console.log(fail + " 개 틀림"); process.exit(1); }
console.log("분석 셈 시험 통과");
