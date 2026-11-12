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


class AssignTest(unittest.TestCase):
    def test_overlap_rule(self):
        c = {"max_ma": 254.17, "min_ma": 252.17}
        binned = gbdb.assign([c], [245, 250, 255, 260])
        self.assertEqual([a for a, items in binned.items() if items], [250, 255])


if __name__ == "__main__":
    unittest.main()
