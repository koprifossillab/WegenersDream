"""엑셀(.xlsx) 시트를 한 줄씩 읽는다 — 표준 라이브러리만(tupandactyl 036).

GBDB 의 Zenodo 사본(2020)은 엑셀로만 나온다. openpyxl 을 파이프라인에 들이지 않으려고(웹 이미지 원칙과 같은 까닭 — 의존을 늘리지
않는다) xlsx 의 XML 을 바로 흘려 읽는다. 시트 XML 이 1 GB 를 넘어 통째로 펴지 않고 `iterparse` 로 줄마다 버린다.

다루는 것: 공유 문자열(t="s"), 인라인 문자열(t="inlineStr"), 숫자·불·수식 결과(<v>). 날짜 서식은 숫자 그대로 낸다(GBDB 에는 없다).
빈 칸은 ""(줄 안에서 건너뛴 칸도 채운다).
"""
import re
import zipfile
from xml.etree.ElementTree import iterparse

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
_REF = re.compile(r"([A-Z]+)")


def column_index(ref):
    """"A1" → 0, "BT7" → 71."""
    letters = _REF.match(ref).group(1)
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def _text(el):
    """<si>·<is> 아래의 글(서식 조각 <r><t> 여럿을 잇는다)."""
    return "".join(t.text or "" for t in el.iter(NS + "t"))


def shared_strings(book):
    if "xl/sharedStrings.xml" not in book.namelist():
        return []
    out = []
    with book.open("xl/sharedStrings.xml") as handle:
        for event, el in iterparse(handle):
            if el.tag == NS + "si":
                out.append(_text(el))
                el.clear()
    return out


def sheet_paths(book):
    """{시트 이름: zip 안의 경로} — workbook.xml 과 그 rels 로."""
    from xml.etree.ElementTree import fromstring
    rels = fromstring(book.read("xl/_rels/workbook.xml.rels"))
    target = {r.get("Id"): r.get("Target") for r in rels}
    wb = fromstring(book.read("xl/workbook.xml"))
    out = {}
    for s in wb.iter(NS + "sheet"):
        t = target[s.get(REL + "id")].lstrip("/")
        out[s.get("name")] = t if t.startswith("xl/") else "xl/" + t
    return out


def rows(path, sheet=None):
    """시트(이름, 없으면 첫 시트)의 줄을 글의 목록으로 낸다. 첫 줄(머리)도 낸다."""
    with zipfile.ZipFile(path) as book:
        strings = shared_strings(book)
        paths = sheet_paths(book)
        name = paths[sheet] if sheet else next(iter(paths.values()))
        with book.open(name) as handle:
            for event, el in iterparse(handle):
                if el.tag != NS + "row":
                    continue
                line = []
                for c in el.iter(NS + "c"):
                    k = column_index(c.get("r")) if c.get("r") else len(line)
                    while len(line) < k:
                        line.append("")
                    kind = c.get("t")
                    if kind == "inlineStr":
                        is_ = c.find(NS + "is")
                        line.append(_text(is_) if is_ is not None else "")
                        continue
                    v = c.find(NS + "v")
                    value = v.text if v is not None and v.text is not None else ""
                    if kind == "s" and value != "":
                        value = strings[int(value)]
                    line.append(value)
                el.clear()
                yield line
