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

// 동정 표지(koprifossillab 045) — 보기와 규칙은 pipeline/tests/quality_cases.json(파이썬 시험이 규칙이 quality.py 와 같은지 본다)
var quality = require(path.join(__dirname, "../../../pipeline/tests/quality_cases.json"));
quality.cases.forEach(function (c) {
  var got = A.identMarks(c[0], quality.rules).split("").sort().join(""), want = c[1].split("").sort().join("");
  check(got === want, "identMarks " + c[0].identified_name + " 기대 " + want + " 얻음 " + got);
});

// 대멸종 경계를 걸친 범위(koprifossillab 046)
quality.straddle.forEach(function (c) {
  var got = A.straddles(c[0], c[1], quality.boundaries, quality.rules).join(",");
  check(got === c[2].join(","), "straddles " + c[0] + "–" + c[1] + " 기대 " + c[2] + " 얻음 " + got);
});

// 고유 산지-시간 열쇠(koprifossillab 047) — 보기는 pipeline/tests/locality_cases.json
var loc = require(path.join(__dirname, "../../../pipeline/tests/locality_cases.json"));
loc.cases.forEach(function (c) {
  var got = A.localityKey(c[0], c[1], c[2], c[3], c[4], loc.decimals);
  check(got === c[5], "localityKey 기대 " + c[5] + " 얻음 " + got);
});

// 재현 묶음의 zip(koprifossillab 048) — CRC32, zip 의 머리와 끝
check(A.crc32(new Uint8Array(Buffer.from("hello", "utf8"))) === 0x3610a686, "crc32(hello)");
var z = A.zipStore([{ name: "a.txt", text: "가나다" }, { name: "b/c.json", text: "{}" }], new Date(2026, 9, 20, 12, 0, 0));
check(z[0] === 0x50 && z[1] === 0x4B && z[2] === 3 && z[3] === 4, "zip 처음은 PK 03 04");
var e = z.length - 22;
check(z[e] === 0x50 && z[e + 1] === 0x4B && z[e + 2] === 5 && z[e + 3] === 6 && z[e + 10] === 2, "zip 끝 — 파일 둘");

// 등면적 격자 칸(koprifossillab 053) — 보기는 pipeline/tests/grid_cases.json
var grid = require(path.join(__dirname, "../../../pipeline/tests/grid_cases.json"));
grid.cases.forEach(function (c) {
  var got = A.gridCell(c[0], c[1], grid.grid_km);
  check(got === c[2], "gridCell " + c[0] + "," + c[1] + " 기대 " + c[2] + " 얻음 " + got);
});

// 표본 범위 표준화(koprifossillab 054) — 보기는 pipeline/tests/coverage_cases.json
var cov = require(path.join(__dirname, "../../../pipeline/tests/coverage_cases.json"));
cov.cases.forEach(function (c) {
  var got = A.coverageRarefy(c[1], c[0], c[2], cov.max_extrapolation).s;
  check(c[3] === null ? got === null : got !== null && near(got, c[3], 1e-5), "coverageRarefy T=" + c[0] + " q=" + c[2] + " 기대 " + c[3] + " 얻음 " + got);
});

// 시공간 외톨이(koprifossillab 055) — 한 자리·한 때에 모인 기록 사이의 먼 기록 하나만 걸린다
var opts = { mltpl: 5, replicates: 5, flag_thresh: 0.5, size_thresh: 10, max_reference: 2000 };
var recs = [], r2 = A.rng(3);
for (var k2 = 0; k2 < 40; k2++) recs.push({ old: 72 + r2(), young: 70 + r2(), lat: 45 + r2() * 4, lng: -105 + r2() * 4, group: "T" });
recs.push({ old: 60, young: 56, lat: -40, lng: 20, group: "T" });                 // 다른 대륙·신생대
var flags = A.outliers(recs, opts, 9);
check(flags[40] === true, "먼 기록이 걸린다");
check(flags.slice(0, 40).every(function (v) { return !v; }), "모인 기록은 걸리지 않는다");
check(A.outliers(recs.slice(0, 5).concat([recs[40]]), opts, 9).every(function (v) { return !v; }), "6 건 무리는 시험하지 않는다");

// 칸 그리기(koprifossillab 056) — 역투영이 투영을 되돌리고, 칸 고리의 점이 그 칸에 든다, 이음매에서 둘로 잘린다
[[0, 0], [45, 90], [-60, -120], [80, 10], [-33.9, 151.2]].forEach(function (p) {
  var xy = A.equalEarth(p[0], p[1]), back = A.equalEarthInverse(xy[0], xy[1]);
  check(near(back[0], p[0], 1e-6) && near(back[1], p[1], 1e-6), "역투영 " + p + " → " + back);
});
var ring = A.cellRing("10:20", 200, 4);
check(ring.length === 16, "칸 고리 16 점");
var mid = ring.reduce(function (s, p) { return [s[0] + p[0] / ring.length, s[1] + p[1] / ring.length]; }, [0, 0]);
check(A.gridCell(mid[0], mid[1], 200) === "10:20", "고리의 가운데가 그 칸");
var edge = [[0, 179], [0, -179], [2, -179], [2, 179]];
var parts = A.splitAtSeam(edge, 180);
check(parts.length === 2, "날짜변경선에 걸친 칸은 둘로 " + parts.length);
check(A.splitAtSeam([[0, 10], [0, 12], [2, 12], [2, 10]], 180).length === 1, "걸치지 않으면 하나");

if (fail) { console.log(fail + " 개 틀림"); process.exit(1); }
console.log("분석 셈 시험 통과");
