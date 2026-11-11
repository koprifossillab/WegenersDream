// 계통 생물지리·고지형 등고선의 셈 시험(tupandactyl 035) — `node web/viewer/jstest/phylogeo.test.js`
var P = require("../static/viewer/phylogeo.js");
var fail = 0;
function check(ok, what) { if (!ok) { fail += 1; console.log("✗ " + what); } }
function near(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-6); }

// 작은 나무: 뿌리(100 Ma, AB) → 노드 2(60 Ma, A) → 끝 a·b(0), 노드 2 의 짝 끝 c(0, B)
var bundle = { areas: { A: {}, B: {} }, nodes: [
  { id: 1, parent: null, age: 100, top: { AB: 0.7, A: 0.3 } },
  { id: 2, parent: 1, age: 60, top: { A: 0.9, AB: 0.1 }, bottom: { A: 0.8, B: 0.2 } },
  { id: 3, parent: 1, age: 0, tip: "Gen_c", top: { B: 1 }, bottom: { B: 0.6, AB: 0.4 } },
  { id: 4, parent: 2, age: 0, tip: "Gen_a", top: { A: 1 }, bottom: { A: 1 } },
  { id: 5, parent: 2, age: 0, tip: "Gen_b", top: { A: 1 }, bottom: { A: 0.4, AB: 0.6 } } ] };
var T = P.prepare(bundle);

// 90 Ma: 가지 1→2(60~100)와 1→3(0~100)이 지난다. 1→2 는 아래 절반(부모 쪽)이라 bottom
var at90 = P.lineagesAt(T, 90);
check(at90.length === 2, "90 Ma 가지 수 " + at90.length);
var l2 = at90.filter(function (l) { return l.node.id === 2; })[0];
check(l2 && l2.end === "bottom" && l2.probs.A === 0.8, "90 Ma 노드 2 가지는 bottom");
// 65 Ma: 1→2 의 위 절반 → top
var l2b = P.lineagesAt(T, 65).filter(function (l) { return l.node.id === 2; })[0];
check(l2b && l2b.end === "top" && l2b.probs.A === 0.9, "65 Ma 노드 2 가지는 top");
// 30 Ma: 세 가지(3·4·5)
check(P.lineagesAt(T, 30).length === 3, "30 Ma 가지 셋");
// 뿌리보다 오래되면 뿌리 가지 하나
var stem = P.lineagesAt(T, 105);
check(stem.length === 1 && stem[0].stem, "뿌리 가지");

// 지역 주변 확률
var m = P.areaMarginals({ AB: 0.7, A: 0.3, _: 0 }, T.codes);
check(near(m.A, 1) && near(m.B, 0.7), "주변 확률 A=1, B=0.7");
check(P.best({ A: 0.3, AB: 0.7 }).range === "AB", "가장 그럴듯한 범위");

// 분기: 50~70 Ma 창에 노드 2
var sp = P.splitsNear(T, 50, 70);
check(sp.length === 1 && sp[0].node.id === 2 && sp[0].kids.length === 2, "분기 노드 2");
check(sp[0].kids.some(function (k) { return k.to.range === "AB"; }), "딸 가지 bottom 의 범위");

// 끝 이름 요약
var lab = P.cladeLabel(T, 1);
check(lab.tips === 3 && lab.genera.length === 1 && lab.genera[0] === "Gen", "끝 요약");
check(P.cladeLabel(T, 4) === "Gen a", "끝 하나는 이름");

// 구면 가운데 — 날짜변경선을 걸친 두 점은 180° 둘레
var c = P.sphericalCentroid([[0, 179], [0, -179]]);
check(near(Math.abs(c[1]), 180, 1e-6) && near(c[0], 0), "날짜변경선 가운데 " + c);
// 볼록 껍질 — 네모의 가운데 점은 빠진다
var hull = P.convexHull([[0, 0], [0, 10], [10, 10], [10, 0], [5, 5]]);
check(hull.length === 4, "껍질 꼭짓점 넷 " + hull.length);
// 날짜변경선을 걸친 껍질도 좁게
var hull2 = P.convexHull([[0, 178], [0, -178], [5, 179], [-5, -179]]);
check(hull2.every(function (p) { return Math.abs(Math.abs(p[1]) - 180) < 5; }), "날짜변경선 껍질");

// 등고선 — 가운데가 솟은 5 × 5 격자, 0.5 등고선은 닫힌 고리 하나
var z = new Float32Array(25); z[12] = 1;
var lines = P.contours(z, 5, 5, 0.5);
check(lines.length === 1, "고리 하나 " + lines.length);
var ring = lines[0];
check(near(ring[0][0], ring[ring.length - 1][0]) && near(ring[0][1], ring[ring.length - 1][1]), "닫힌 고리");
check(ring.every(function (p) { return Math.abs(p[0] - 2) <= 0.5 + 1e-9 && Math.abs(p[1] - 2) <= 0.5 + 1e-9; }), "고리는 봉우리 둘레 반 칸");
// 평평하면 없다
check(P.contours(new Float32Array(9), 3, 3, 0.5).length === 0, "평평");

// 지형 격자 풀기 — R·G 16 비트, unit 10, offset 12000
var rgba = new Uint8ClampedArray([4, 176, 0, 255]);   // (4<<8|176)=1200 → 1200×10−12000 = 0
check(P.decodeTerrain(rgba, 1, 1, 12000, 10).z[0] === 0, "해발 0");

if (fail) { console.log(fail + " 개 실패"); process.exit(1); }
console.log("계통 생물지리·등고선 시험 통과");
