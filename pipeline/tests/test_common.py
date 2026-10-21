"""파이프라인 규칙 시험. 네트워크도 원본 자료도 없이 돈다.

    python -m unittest discover -s pipeline/tests -t .
"""
import unittest

import json
from pathlib import Path

from pipeline.common import WINDOW_MA, age_key, belongs, environment_class, frame_share, parse_dem_name, period
from pipeline.fossils import assign
from pipeline.intervals import QUATERNARY, is_vague, types_from


class DemNameTest(unittest.TestCase):
    def test_plain_and_fractional_ages(self):
        self.assertEqual(parse_dem_name("Map88_PALEOMAP_1deg_Cambrian_Precambrian boundary_540Ma.nc"),
                         (540.0, "Cambrian Precambrian boundary"))
        self.assertEqual(parse_dem_name("Map48_PALEOMAP_1deg_Middle_Devonian_385.2Ma.nc"),
                         (385.2, "Middle Devonian"))

    def test_unknown_name(self):
        self.assertIsNone(parse_dem_name("License.txt"))

    def test_age_key_keeps_fractions_apart(self):
        self.assertEqual(age_key(385.2), "3852")
        self.assertEqual(age_key(385), "3850")
        self.assertEqual(age_key(0), "0000")


class PeriodTest(unittest.TestCase):
    def test_boundaries_go_to_younger_period(self):
        self.assertEqual(period(66.0)["ko"], "고진기")
        self.assertEqual(period(66.1)["ko"], "백악기")

    def test_ends(self):
        self.assertEqual(period(0)["en"], "Quaternary")
        self.assertEqual(period(540)["ko"], "에디아카라기")


class BinningTest(unittest.TestCase):
    def test_window_and_span(self):
        self.assertTrue(belongs(252, 248, 250))
        self.assertTrue(belongs(247.5, 247.5, 250))        # 창 끝은 넣는다
        self.assertFalse(belongs(247.4, 247.4, 250))
        self.assertTrue(belongs(270, 251, 260))            # 19 Myr — 범위가 창과 겹친다
        self.assertTrue(belongs(248, 252, 250))            # 뒤집혀 적힌 것도 받는다

    def test_no_span_limit(self):
        # 015 — 연대 범위의 상한이 없다. 후기 트라이아스기(237–201.4)는 걸친 모든 시점에 오른다
        self.assertTrue(belongs(237, 201.4, 205))
        self.assertTrue(belongs(237, 201.4, 235))
        self.assertFalse(belongs(237, 201.4, 240))         # 창(237.5–242.5)과 안 겹친다
        self.assertTrue(belongs(538.8, 251.902, 400))      # 고생대 — 넓어도 오른다(넓은 연대로 표시)


class VagueTest(unittest.TestCase):
    """모호한 연대 — 절 단위로 정해지지 않은 PBDB 시대 이름(016). 길이가 아니라 이름의 등급으로 가른다."""

    TYPES = {"Norian": "age", "Rhaetian": "age", "Aptian": "age", "Albian": "age", "Lacian": "subage",
             "Ivorian": "age", "Late Triassic": "epoch", "Middle Cambrian": "epoch", "Paleozoic": "era",
             "Cretaceous": "period", "Early Pleistocene": "subepoch", "Pennsylvanian": "epoch"}

    def vague(self, early, late=""):
        return is_vague(early, late, self.TYPES)

    def test_defined_ranges_are_not_vague(self):
        self.assertFalse(self.vague("Norian"))                 # 노릭절 하나(21.6 Myr)
        self.assertFalse(self.vague("Norian", "Rhaetian"))     # 절 둘로 정해진 범위 — 연구자가 바로잡은 것
        self.assertFalse(self.vague("Aptian", "Albian"))
        self.assertFalse(self.vague("Lacian"))                 # 아절
        self.assertFalse(self.vague("Ivorian"))                # 지역 절

    def test_quaternary_names_are_not_vague(self):
        # 제4기 안의 세·기 이름은 정해진 기록(tupandactyl 008). 신생대의 다른 세는 그대로 모호하다
        records = [{"interval_name": "Early Pleistocene", "type": "subepoch", "b_age": 2.58},
                   {"interval_name": "Pleistocene", "type": "epoch", "b_age": 2.58},
                   {"interval_name": "Quaternary", "type": "period", "b_age": 2.58},
                   {"interval_name": "Holocene", "type": "epoch", "b_age": 0.0117},
                   {"interval_name": "Holocene", "type": "age", "b_age": 0.0117},
                   {"interval_name": "Late Pliocene", "type": "subepoch", "b_age": 3.6},
                   {"interval_name": "Miocene", "type": "epoch", "b_age": 23.04},
                   {"interval_name": "Neogene", "type": "period", "b_age": 23.04}]
        types = types_from(records, q_base=2.58)
        for name in ("Early Pleistocene", "Pleistocene", "Quaternary", "Holocene"):
            self.assertFalse(is_vague(name, "", types), name)
        self.assertEqual(types["Pleistocene"], QUATERNARY)
        for name in ("Late Pliocene", "Miocene", "Neogene"):
            self.assertTrue(is_vague(name, "", types), name)
        self.assertTrue(is_vague("Pleistocene", "Late Pliocene", types))   # 둘 가운데 하나라도 모호하면

    def test_epochs_periods_eras_are_vague(self):
        self.assertTrue(self.vague("Middle Cambrian"))
        self.assertTrue(self.vague("Late Triassic"))
        self.assertTrue(self.vague("Paleozoic"))
        self.assertTrue(self.vague("Cretaceous"))
        self.assertTrue(self.vague("Pennsylvanian"))

    def test_one_vague_end_makes_it_vague(self):
        self.assertTrue(self.vague("Norian", "Late Triassic"))

    def test_unknown_name_counts_as_defined(self):
        self.assertFalse(self.vague("Revueltian"))


class EmsianTest(unittest.TestCase):
    def test_emsian_reaches_400(self):
        # 에므스절(410.62–393.47, 17 Myr)은 중간값 402 라 옛 규칙으로는 400 Ma 가 비었다
        self.assertTrue(belongs(410.62, 393.47, 400))

    def test_assign_matches_belongs(self):
        rows = [(252.5, 252.5, ["a"]), (250, 250, ["b"]), (410.62, 393.47, ["emsian"])]
        ages = [255, 250, 245, 415, 410, 405, 400, 395, 390]
        binned = {age: [item[2] for item in items] for age, items in assign(rows, ages).items()}
        self.assertEqual(binned[255], [["a"]])
        self.assertEqual(binned[250], [["a"], ["b"]])
        self.assertEqual(binned[245], [])
        self.assertEqual([a for a in ages if ["emsian"] in binned[a]], [410, 405, 400, 395])
        for old, young, row in rows:
            for age in ages:
                self.assertEqual(row in binned[age], belongs(old, young, age), (row, age))


class EnvironmentTest(unittest.TestCase):
    def test_classes(self):
        self.assertEqual(environment_class("offshore shelf"), "m")
        self.assertEqual(environment_class('"floodplain"'), "t")
        self.assertEqual(environment_class("estuary/bay"), "t")    # 연구자의 판단(devlog 003)
        self.assertEqual(environment_class("lagoonal"), "m")
        self.assertEqual(environment_class(""), "o")


if __name__ == "__main__":
    unittest.main()


class FrameShareTest(unittest.TestCase):
    """시점 몫(koprifossillab 044) — 보기는 뷰어의 analysis.js 시험과 같은 파일이다."""
    cases = json.loads((Path(__file__).parent / "share_cases.json").read_text(encoding="utf-8"))

    def test_cases(self):
        for old, young, lo, hi, want in self.cases["cases"]:
            self.assertAlmostEqual(frame_share(old, young, lo, hi), want, places=6, msg=(old, young, lo, hi))

    def test_sums_to_one_on_the_5myr_grid(self):
        # 0~540 Ma 의 5 Myr 시점 창은 빈틈없이 이어진다(0 Ma 창은 0 에서 잘린다)
        for old, young in self.cases["sum"]:
            total = sum(frame_share(old, young, max(0.0, a - WINDOW_MA), a + WINDOW_MA) for a in range(0, 545, 5))
            self.assertAlmostEqual(total, 1.0, places=6, msg=(old, young))


class QualityTest(unittest.TestCase):
    """동정 표지(koprifossillab 045) — 보기는 뷰어의 analysis.js 시험과 같은 파일이다."""

    def test_cases(self):
        from pipeline.quality import marks
        cases = json.loads((Path(__file__).parent / "quality_cases.json").read_text(encoding="utf-8"))["cases"]
        for record, want in cases:
            self.assertEqual("".join(sorted(marks(record))), "".join(sorted(want)), msg=record["identified_name"])

    def test_rules_in_cases_match(self):
        # JS 시험(analysis.test.js)은 보기 파일의 rules 로 매긴다 — 그것이 QUALITY 와 같아야 두 쪽이 같은 규칙을 시험한다
        from pipeline.quality import QUALITY
        cases = json.loads((Path(__file__).parent / "quality_cases.json").read_text(encoding="utf-8"))
        self.assertEqual(cases["rules"], QUALITY)

    def test_straddles(self):
        # 대멸종 경계를 걸친 범위(koprifossillab 046) — 경계에서 끝나는 범위(Maastrichtian 72.2–66)는 걸치지 않는다
        from pipeline.quality import straddles
        cases = json.loads((Path(__file__).parent / "quality_cases.json").read_text(encoding="utf-8"))
        for old, young, want in cases["straddle"]:
            self.assertEqual(straddles(old, young, cases["boundaries"]), want, msg=(old, young))


class LocalityKeyTest(unittest.TestCase):
    """고유 산지-시간 열쇠(koprifossillab 047) — 보기는 뷰어의 analysis.js 시험과 같은 파일이다."""

    def test_cases(self):
        from pipeline.common import ANALYSIS, locality_key
        cases = json.loads((Path(__file__).parent / "locality_cases.json").read_text(encoding="utf-8"))
        self.assertEqual(cases["decimals"], ANALYSIS["locality_decimals"])
        for lat, lng, formation, old, young, want in cases["cases"]:
            self.assertEqual(locality_key(lat, lng, formation, old, young), want)


class OccurrenceChunkTest(unittest.TestCase):
    """산출 사본의 조각(koprifossillab 050) — 나무 순서로 자른 조각이 빈틈·겹침 없이 모든 산출을 담고, 분류군의 [lft, rgt] 가 한 구간이다."""

    def test_chunks_cover_tree_order(self):
        import tempfile
        from pipeline.occurrences import subtree_counts, write_chunks
        colls = {c: {"max_ma": 10, "min_ma": 5, "early": "", "late": "", "environment": "", "cc": "", "formation": "",
                     "precise": 1, "locality": "", "frames": [[5.0, 1.0, 2.0, 1], [10.0, 1.5, 2.5, 1]]} for c in range(1, 6)}
        # 나무: 1(lft 1–10) ⊃ 2(2–4), 3(5–9) ⊃ 4(6–6)
        accepted = {1: (1, 10, "A", "order", 0), 2: (2, 4, "B", "family", 0), 3: (5, 9, "C", "family", 0), 4: (6, 6, "D", "genus", 0)}
        rows = sorted([(t[0], [k, 1 + k % 5, acc, t[0], t[2], t[3], "", t[2], "", 0])
                       for k, (acc, t) in enumerate([(a, accepted[a]) for a in (2, 2, 3, 4, 4, 4, 1)])], key=lambda x: (x[0], x[1][0]))
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            chunks = write_chunks(rows, colls, out, target_bytes=150)       # 작게 — 여러 조각으로
            self.assertGreater(len(chunks), 1)
            got = []
            for c in chunks:
                payload = json.loads((out / c["file"].removeprefix("occs/")).read_text(encoding="utf-8"))
                got += payload["rows"]
                self.assertTrue(all(str(r[1]) in payload["colls"] for r in payload["rows"]))   # 산지 칸이 그 조각에 있다
            self.assertEqual([r[0] for r in got], [r[0] for _, r in rows])
            self.assertEqual([c["lft_lo"] for c in chunks], sorted(c["lft_lo"] for c in chunks))
        counts = subtree_counts(rows, accepted)
        self.assertEqual(counts, {1: 7, 2: 2, 3: 4, 4: 3})


class GridCellTest(unittest.TestCase):
    """등면적 격자 칸(koprifossillab 053) — 보기는 뷰어의 analysis.js 시험과 같은 파일이다."""

    def test_cases(self):
        from pipeline.common import ANALYSIS, grid_cell
        cases = json.loads((Path(__file__).parent / "grid_cases.json").read_text(encoding="utf-8"))
        self.assertEqual(cases["grid_km"], ANALYSIS["grid_km"])
        for lat, lng, want in cases["cases"]:
            self.assertEqual(grid_cell(lat, lng), want, msg=(lat, lng))

    def test_equal_area(self):
        # 같은 넓이 — 적도와 고위도의 칸 하나가 덮는 위도·경도 폭은 다르지만, 투영 좌표의 넓이 비는 지구 넓이 비와 같다
        from pipeline.common import EARTH_KM, equal_earth
        x0, y0 = equal_earth(0, 0)
        x1, y1 = equal_earth(10, 10)
        x2, y2 = equal_earth(60, 0)
        x3, y3 = equal_earth(70, 10)
        import math
        band = lambda a, b: 2 * math.pi * EARTH_KM ** 2 * (math.sin(math.radians(b)) - math.sin(math.radians(a))) * 10 / 360
        self.assertAlmostEqual(abs((x1 - x0) * (y1 - y0)) / band(0, 10), 1, delta=0.03)   # 경도선은 굽어 사각형 넓이와 조금 다르다
        self.assertGreater(y2, 0)


class CoverageTest(unittest.TestCase):
    """표본 범위 표준화(koprifossillab 054) — 보기는 뷰어의 analysis.js 시험과 같은 파일이다."""

    def test_cases(self):
        from pipeline.common import ANALYSIS, coverage_rarefy
        cases = json.loads((Path(__file__).parent / "coverage_cases.json").read_text(encoding="utf-8"))
        self.assertEqual(cases["max_extrapolation"], ANALYSIS["coverage_max_extrapolation"])
        for T, ys, q, want, cov in cases["cases"]:
            got = coverage_rarefy(ys, T, q)
            if want is None:
                self.assertIsNone(got["s"], msg=(T, q))
            else:
                self.assertAlmostEqual(got["s"], want, places=5, msg=(T, q))

    def test_properties(self):
        from pipeline.common import coverage_rarefy
        ys, T = [5, 3, 2, 2, 1, 1, 1, 1], 10
        lo, hi = coverage_rarefy(ys, T, 0.4)["s"], coverage_rarefy(ys, T, 0.7)["s"]
        self.assertLess(lo, hi)                               # 문턱이 높으면 더 많이 센다
        self.assertLessEqual(coverage_rarefy(ys, T, 0.5)["s"], len(ys))   # 관찰 범위 안이면 관찰 수보다 크지 않다

