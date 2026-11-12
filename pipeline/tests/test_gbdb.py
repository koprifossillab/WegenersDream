"""GBDB 읽기 규칙과 엑셀 읽개(tupandactyl 036) — numpy·pygplates 없이 돈다."""
import io
import tempfile
import unittest
import zipfile
from pathlib import Path

from pipeline import gbdb, xlsx

NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'


def tiny_xlsx(rows, path):
    """공유 문자열 + 빈 칸을 건너뛴 줄이 든 가장 작은 xlsx."""
    strings = []
    def sref(v):
        if v not in strings:
            strings.append(v)
        return strings.index(v)
    body = []
    for r, row in enumerate(rows, 1):
        cells = []
        for c, v in enumerate(row):
            if v == "":
                continue                                    # 빈 칸은 적지 않는다(엑셀도 그렇다)
            ref = chr(65 + c) + str(r)
            if isinstance(v, (int, float)):
                cells.append(f'<c r="{ref}"><v>{v}</v></c>')
            else:
                cells.append(f'<c r="{ref}" t="s"><v>{sref(v)}</v></c>')
        body.append(f'<row r="{r}">{"".join(cells)}</row>')
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("xl/workbook.xml", f'<workbook {NS} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
                   '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>')
        z.writestr("xl/_rels/workbook.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                   '<Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>')
        z.writestr("xl/sharedStrings.xml", f'<sst {NS}>' + "".join(f"<si><t>{s}</t></si>" for s in strings) + "</sst>")
        z.writestr("xl/worksheets/sheet1.xml", f'<worksheet {NS}><sheetData>{"".join(body)}</sheetData></worksheet>')


HEAD = ["sectionID", "SectionName", "Country", "LatitudeDecimal", "LatitudeDirection", "LongitudeDecimal", "LongitudeDirection",
        "Formation_name", "early_interval", "early_age", "late_age", "unit_id", "CollectionNo", "genusname", "speciesname"]


class XlsxTest(unittest.TestCase):
    def test_column_index(self):
        self.assertEqual(xlsx.column_index("A1"), 0)
        self.assertEqual(xlsx.column_index("Z9"), 25)
        self.assertEqual(xlsx.column_index("BT7"), 71)

    def test_rows_fill_skipped_cells(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "t.xlsx"
            tiny_xlsx([["a", "b", "c"], ["x", "", 3.5]], p)
            self.assertEqual(list(xlsx.rows(p)), [["a", "b", "c"], ["x", "", "3.5"]])


class ReadTest(unittest.TestCase):
    def read(self, rows):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "t.xlsx"
            tiny_xlsx([HEAD] + rows, p)
            return gbdb.read(p, {"Changhsingian": "age", "Lopingian": "epoch"})

    def test_collections_and_dropped_rows(self):
        sections, colls, stats = self.read([
            [4, "Meishan", "China", 31.1, "North", 119.7, "East", "Changxing", "Changhsingian", 254.17, 252.17, 10, "2.2", "Tapashanites", "costatus"],
            [4, "Meishan", "China", 31.1, "North", 119.7, "East", "Changxing", "Changhsingian", 254.17, 252.17, 10, "2.2", "Liroceras", ""],
            [4, "Meishan", "China", 31.1, "North", 119.7, "East", "Changxing", "", "", "", 11, "3", "Hindeodus", ""],   # 나이 없음
            [5, "Somewhere", "Chile", 33.0, "South", 70.0, "West", "X", "Lopingian", 259.5, 251.9, 1, "", "Foo", ""],
        ])
        self.assertEqual(len(colls), 2)
        meishan = colls[0]
        self.assertEqual(meishan["taxa"], ["Tapashanites costatus", "Liroceras"])
        self.assertEqual(meishan["precise"], 1)
        self.assertEqual(stats["no_age_occ"], 1)
        chile = colls[1]
        self.assertEqual((chile["lat"], chile["lng"]), (-33.0, -70.0))     # 방향 칸으로 부호
        self.assertEqual(chile["precise"], 0)                              # 세(epoch) 이름은 모호한 연대
        self.assertEqual(set(sections), {4, 5})


class DuplicateTest(unittest.TestCase):
    def coll(self, genera, lat=31.1, lng=119.7, mx=254.0, mn=252.0):
        return {"genera": set(genera), "lat": lat, "lng": lng, "max_ma": mx, "min_ma": mn}

    def test_rule(self):
        index = gbdb.PbdbIndex({
            1: (31.12, 119.71, 254.2, 251.9, {"A", "B"}),          # 2 km 안, 연대 겹침
            2: (31.9, 119.7, 254.2, 251.9, {"A", "B", "C"}),       # 89 km — 멀다
            3: (31.1, 119.7, 240.0, 237.0, {"A", "B", "C"}),       # 연대가 안 겹친다
        })
        self.assertEqual(gbdb.duplicate_of(self.coll(["A", "B", "C"]), index), 1)    # 2/3 ≥ 절반
        self.assertIsNone(gbdb.duplicate_of(self.coll(["A", "X", "Y"]), index))      # 1/3
        self.assertIsNone(gbdb.duplicate_of(self.coll([]), index))

    def test_km(self):
        self.assertAlmostEqual(gbdb.km_between(0, 0, 0, 1), 111.2, places=0)


class SearchFieldsTest(unittest.TestCase):
    def test_taxon_lfts(self):
        class Table:
            names = {"Claraia": 100, "Claraia stachei": 105, "Ophiceras": 200}
            def lft(self, name):
                return self.names.get(name)
        # 종이 나무에 있으면 종, 없으면 속. 같은 lft 는 하나로
        self.assertEqual(gbdb.taxon_lfts(["Claraia stachei", "Claraia wangi", "Claraia", "Ophiceras", "Nothing"], Table()),
                         [105, 100, 200])

    def test_country_names(self):
        self.assertEqual(gbdb.pbdb_code(gbdb.NAME_TO_ISO["england"]), "UK")     # PBDB 는 영국을 UK 로
        self.assertEqual(gbdb.NAME_TO_ISO["rapla county"], "EE")


class NameOnlyTest(unittest.TestCase):
    """PBDB 산출이 없는 이름(사본 이름표에 없다)도 분류 나무로 lft 를 얻고, 뷰어가 찾을 이름표에 오른다(tupandactyl 039)."""
    def table(self):
        with tempfile.TemporaryDirectory() as d:
            folder = Path(d)
            (folder / "c.json").write_text('{"Claraia": [[1, 100, 120, "genus", 50, "Claraia"]]}', encoding="utf-8")
            accepted = {1: (100, 120, "Claraia", "genus", 50), 2: (300, 300, "Ampullatocephalina", "genus", 0),
                        3: (290, 310, "Ampullatocephalinae", "subfamily", 0), 4: (400, 400, "Nothing", "genus", 0)}
            names = {"Claraia": {1}, "Ampullatocephalina": {2}, "Ampullatocephalinae": {3}, "Nothing": {4}, "Ampullatocephalus": {2}}
            t = gbdb.TaxonTable(folder, (accepted, names))
            t.table("Claraia"); t.table("Ampullatocephalina"); t.table("Nothing")      # 읽어 둔다(임시 폴더가 사라지기 전에)
            return t

    def test_lft_falls_back_to_taxonomy(self):
        t = self.table()
        self.assertEqual(t.lft("Claraia"), 100)
        self.assertEqual(t.lft("Ampullatocephalina"), 300)
        self.assertEqual(t.lft("Ampullatocephalus"), 300)          # 동의어도

    def test_name_only_table(self):
        out = gbdb.name_only_taxa(self.table(), {300: 6, 100: 2})
        self.assertEqual(out["Ampullatocephalina"], [[2, 300, 300, "genus", 6, "Ampullatocephalina"]])
        self.assertEqual(out["Ampullatocephalinae"][0][4], 6)        # 위 분류군도(산출이 없는 아과)
        self.assertNotIn("Claraia", out)                              # 사본 이름표에 있는 것은 넣지 않는다
        self.assertNotIn("Nothing", out)                              # GBDB 산출을 품지 않은 것도


class AssignTest(unittest.TestCase):
    def test_overlap_rule(self):
        c = {"max_ma": 254.17, "min_ma": 252.17}
        binned = gbdb.assign([c], [245, 250, 255, 260])
        self.assertEqual([a for a, items in binned.items() if items], [250, 255])


if __name__ == "__main__":
    unittest.main()
