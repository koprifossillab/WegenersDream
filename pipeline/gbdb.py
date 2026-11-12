"""GBDB(Geobiodiversity Database) 단면 자료 → 시점마다 채집 점, 단면마다 층 차례(tupandactyl 036).

GBDB 는 NIGPAS(중국과학원 남경지질고생물연구소)가 2006 년부터 쌓은 **단면 중심** 데이터베이스다 — 단면 → 층 단위 → 채집 → 산출.
PBDB 에 거의 없는 **한 단면 안의 위아래 차례**가 남아 있고, 중국 자료가 두껍다(지도 점의 94 %). 원본은 Zenodo 의 2020-11 정적 사본
(CC BY 4.0, `sources/gbdb.json`)이다. 사이트의 API 는 문서가 없는 화면용이라 쓰지 않는다(docs/계통생물지리_검토.md 의 GBDB 절).

- **점 하나는 채집 하나**(단면·층 단위·채집 번호). 같은 층 단위에 채집 번호가 없으면 그 층 단위가 하나의 채집이다
- **나이는 층 단위의 `early_age`·`late_age`(Ma)** — 사본의 화석 행 57 만 가운데 32.6 만은 나이가 비어 있어 뺀다(세기만 한다)
- **좌표는 현재 좌표를 시점 나이로 PALEOMAP v19o 로 돌린다**(CLAUDE.md "판 모델을 하나로"). GBDB 화면의 "ancient" 좌표는 판 모델을
  밝히지 않아 쓰지 않는다. 그 나이에 판이 없으면 그 시점에서 뺀다(PBDB 처럼 대신 쓸 고좌표가 없다)
- **PBDB 와 겹침** — 같은 화석을 두 번 세지 않으려고, 10 km 안·연대가 겹치는 PBDB 산지 가운데 이 채집의 속 절반 이상을 가진 것이
  있으면 그 산지 번호를 `dup` 에 적는다. 지도에는 속 빈 네모로 그리고, 셈에 더할 때는 뺀다(뷰어)
- 연대의 모호함은 PBDB 와 같은 규칙(intervals.py) — 층 단위의 시대 이름이 세·기 같은 넓은 등급이면 `precise = 0`

    python -m pipeline gbdb      GBDB 만 굽고 지금 index.json 에 붙인다 (2 분 남짓 — 엑셀 1 GB 를 흘려 읽는다)
"""
import bisect
import json
import math
from collections import defaultdict

from .common import DERIVED, WINDOW_MA, age_key, manifest, source_path

FIELDS = ["id", "paleolng", "paleolat", "section", "n_taxa", "dup", "max_ma", "min_ma", "precise", "lng", "lat"]
BUCKETS = 100           # 단면 파일 수 — 단면 번호 % 100. 누른 단면 하나를 읽으려고 전부를 받지 않게
DUP_KM = 10.0
DUP_SHARE = 0.5
DUP_SLACK_MA = 1.0      # 연대 겹침의 여유 — 두 데이터베이스가 같은 층을 다른 표로 매긴 차이


def number(value):
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def signed(value, direction, negative):
    """GBDB 는 도(度)를 양수로 두고 방향 칸(North/South, East/West)을 따로 적기도 한다."""
    v = number(value)
    if v is None:
        return None
    return -abs(v) if (direction or "").strip().lower().startswith(negative) else v


def labels(get):
    """층 단위의 시대 이름 (이른 쪽, 늦은 쪽) — 절 이름이 있으면 절, 없으면 세, 그것도 없으면 기."""
    for early, late in (("early_interval", "intage_min"), ("intage_max", "intage_min"), ("epoch_max", "epoch_min")):
        if get(early) or get(late):
            return get(early) or get(late), get(late) if get(early) else ""
    period = get("period_max")
    if period:
        part = get("emlperiod_max")
        return (f"{part} {period}" if part else period), ""
    return "", ""


def taxon_name(genus, species):
    genus = (genus or "").strip()
    species = (species or "").strip()
    return f"{genus} {species}".strip() if genus else ""


def read(path, types=None):
    """단면 시트 → (sections, collections, stats).

    sections: {단면 번호: {name, country, province, lat, lng, units: {층 단위 번호: 층}}}
    collections: [{id, section, unit, coll, lat, lng, max_ma, min_ma, precise, genera(set), taxa(list)}]
    층: {order(시트에서 처음 나온 차례), unit_no, formation, group, lithology, thickness, max_ma, min_ma, label, colls: [채집 id]}
    """
    from . import xlsx
    types = types or {}
    from .intervals import VAGUE_TYPES
    stats = defaultdict(int)
    sections, by_key, collections = {}, {}, []
    rows = xlsx.rows(path)
    head = next(rows)
    ix = {}
    for k, name in enumerate(head):
        ix.setdefault(name, k)                      # 같은 이름이 두 번 있는 칸(unit_lithology1A, ref_title)은 앞의 것
    for order, line in enumerate(rows):
        get = lambda name: (line[ix[name]].strip() if ix.get(name) is not None and ix[name] < len(line) else "")
        stats["rows"] += 1
        genus = get("genusname")
        lat = signed(get("LatitudeDecimal"), get("LatitudeDirection"), "s")
        lng = signed(get("LongitudeDecimal"), get("LongitudeDirection"), "w")
        old, young = number(get("early_age")), number(get("late_age"))
        if genus:
            stats["occurrences"] += 1
        if lat is None or lng is None or not (-90 <= lat <= 90 and -180 <= lng <= 180):
            stats["no_coords" + ("_occ" if genus else "")] += 1
            continue
        if old is None or young is None:
            stats["no_age" + ("_occ" if genus else "")] += 1
            continue
        if old < young:
            old, young = young, old
        sid = int(number(get("sectionID")) or 0)
        sec = sections.get(sid)
        if sec is None:
            sec = sections[sid] = {"name": get("SectionName"), "country": get("Country"), "province": get("Province"),
                                   "lat": round(lat, 4), "lng": round(lng, 4), "units": {}}
        uid = get("unit_id")
        early, late = labels(get)
        unit = sec["units"].get(uid)
        if unit is None:
            thick = number(get("Thickness"))
            unit = sec["units"][uid] = {
                "order": order, "unit_no": get("unit_no"), "formation": get("Formation_name"), "group": get("group_"),
                "lithology": " ".join(x for x in (get("unit_color1A"), get("unit_lithology1A"), get("unit_mainlithologyA")) if x),
                "thickness": [get("ThicknessSign"), thick, get("ThicknessUnit")] if thick is not None else None,
                "max_ma": old, "min_ma": young, "label": " – ".join(x for x in (early, late) if x), "colls": []}
        if not genus:
            continue
        stats["dated_occurrences"] += 1
        key = (sid, uid, get("CollectionNo"))
        c = by_key.get(key)
        if c is None:
            precise = bool(early) and not any(types.get(n) in VAGUE_TYPES for n in (early, late) if n)
            if not get("early_interval") and not get("intage_max") and not get("intage_min"):
                precise = False                     # 절 이름 없이 세·기로만 매긴 층
            c = by_key[key] = {"id": len(collections) + 1, "section": sid, "unit": uid, "coll": get("CollectionNo"),
                               "lat": lat, "lng": lng, "max_ma": old, "min_ma": young, "precise": 1 if precise else 0,
                               "genera": set(), "taxa": [], "refs": set(), "groups": set()}
            collections.append(c)
            unit["colls"].append(c["id"])
        c["genera"].add(genus)
        name = taxon_name(genus, get("speciesname"))
        if name not in c["taxa"]:
            c["taxa"].append(name)
        if get("FossilGroup"):
            c["groups"].add(get("FossilGroup"))
        ref = (get("ref_FirstAuthorLastName") or get("refFirstAuthor"), get("ref_PublicationYear"), get("ref_Title"))
        if any(ref):
            c["refs"].add(ref)
    # 화석이 한 건도 없는 단면은 뺀다 — 이 층은 화석 지도다
    keep = {c["section"] for c in collections}
    sections = {k: v for k, v in sections.items() if k in keep}
    stats["sections"] = len(sections)
    stats["collections"] = len(collections)
    return sections, collections, dict(stats)


# ── PBDB 와 겹침 ─────────────────────────────────────────────────────
def km_between(lat1, lng1, lat2, lng2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371.0088 * math.asin(min(1.0, math.sqrt(a)))


class PbdbIndex:
    """PBDB 산지(위도, 경도, max, min, 속 집합)를 0.1° 칸으로 찾는다."""
    STEP = 0.1

    def __init__(self, colls):
        self.colls = colls                      # {collection_no: (lat, lng, max, min, genera)}
        self.cells = defaultdict(list)
        for no, c in colls.items():
            self.cells[self._cell(c[0], c[1])].append(no)

    def _cell(self, lat, lng):
        return (math.floor(lat / self.STEP), math.floor(lng / self.STEP))

    def near(self, lat, lng, km):
        a, b = self._cell(lat, lng)
        reach = int(math.ceil(km / 11.0)) + 1     # 0.1° 위도 ≈ 11 km
        wide = int(math.ceil(reach / max(0.05, math.cos(math.radians(lat)))))
        for i in range(-reach, reach + 1):
            for j in range(-wide, wide + 1):
                for no in self.cells.get((a + i, b + j), ()):
                    c = self.colls[no]
                    if km_between(lat, lng, c[0], c[1]) <= km:
                        yield no, c


def duplicate_of(coll, index, km=DUP_KM, share=DUP_SHARE, slack=DUP_SLACK_MA):
    """이 채집과 같은 기록으로 보이는 PBDB 산지 번호(없으면 None). 속을 가장 많이 나누는 것."""
    best, best_share = None, 0.0
    genera = coll["genera"]
    if not genera:
        return None
    for no, (lat, lng, mx, mn, pgen) in index.near(coll["lat"], coll["lng"], km):
        if mx < coll["min_ma"] - slack or mn > coll["max_ma"] + slack:
            continue
        s = len(genera & pgen) / len(genera)
        if s > best_share or (s == best_share and best is not None and no < best):
            best, best_share = no, s
    return best if best_share >= share else None


def pbdb_collections(chunk_dir):
    """산출 사본의 조각(occurrences.py)에서 PBDB 산지의 좌표·연대·속. 사본이 없으면 {}."""
    out = {}
    genera = defaultdict(set)
    for path in sorted(chunk_dir.glob("*.json")):
        d = json.loads(path.read_text(encoding="utf-8"))
        f, cf = d["fields"], d["coll_fields"]
        gi, ci = f.index("genus"), f.index("collection_no")
        li, xi, ni = cf.index("locality"), cf.index("max_ma"), cf.index("min_ma")
        for k, c in d["colls"].items():
            lat, lng = (float(v) for v in c[li].split("|")[:2])
            out[int(k)] = (lat, lng, float(c[xi]), float(c[ni]))
        for r in d["rows"]:
            if r[gi]:
                genera[r[ci]].add(r[gi])
    return {no: c + (genera.get(no, set()),) for no, c in out.items()}


# ── 시점에 나누기 ────────────────────────────────────────────────────
def assign(collections, ages):
    """시점마다 그 무렵 채집 — fossils.assign 과 같은 규칙(연대 범위가 시점 창과 겹친다)."""
    ages = sorted(ages)
    binned = {age: [] for age in ages}
    for c in collections:
        start = bisect.bisect_left(ages, c["min_ma"] - WINDOW_MA)
        for age in ages[start:]:
            if age > c["max_ma"] + WINDOW_MA:
                break
            binned[age].append(c)
    return binned


def section_payload(sid, sec, by_id):
    """단면 하나 — 층을 위(젊은 것)에서 아래로. 같은 나이의 층은 시트의 차례를 거꾸로(시트는 아래에서 위로 적는다)."""
    units = sorted(sec["units"].items(), key=lambda kv: (kv[1]["min_ma"], kv[1]["max_ma"], -kv[1]["order"]))
    out = []
    for uid, u in units:
        colls = []
        for cid in u["colls"]:
            c = by_id[cid]
            colls.append({"id": cid, "no": c["coll"], "taxa": c["taxa"], "groups": sorted(c["groups"]), "dup": c.get("dup"),
                          "refs": [list(r) for r in sorted(c["refs"])]})
        out.append({"unit": uid, "no": u["unit_no"], "formation": u["formation"], "group": u["group"], "lithology": u["lithology"],
                    "thickness": u["thickness"], "max_ma": u["max_ma"], "min_ma": u["min_ma"], "label": u["label"], "colls": colls})
    return {"id": sid, "name": sec["name"], "country": sec["country"], "province": sec["province"],
            "lat": sec["lat"], "lng": sec["lng"], "units": out}


def build(ages):
    """index.json 의 `gbdb` 칸. 원본이 없으면 None(뷰어는 층을 숨긴다)."""
    spec = manifest("gbdb")
    path = source_path(spec["sheet"])
    if not path.exists():
        print(f"  {spec['sheet']} 가 없어 건너뛴다 — `python -m pipeline fetch`")
        return None
    try:
        from .intervals import load_types
        types = load_types()
    except SystemExit:
        types = {}
    sections, collections, stats = read(path, types)
    print(f"  단면 {stats['sections']} · 채집 {stats['collections']} · 나이 있는 산출 {stats.get('dated_occurrences', 0)}"
          f" (나이 없는 산출 {stats.get('no_age_occ', 0)} 뺌)")

    pbdb = pbdb_collections(DERIVED / "occs" / "chunk")
    stats["pbdb_compared"] = len(pbdb)
    if pbdb:
        index = PbdbIndex(pbdb)
        for c in collections:
            c["dup"] = duplicate_of(c, index)
        stats["dup"] = sum(1 for c in collections if c["dup"])
        print(f"  PBDB 와 겹침: 채집 {stats['dup']} / {len(collections)} (PBDB 산지 {len(pbdb)} 과 견줌)")
    else:
        print("  PBDB 산출 사본이 없어 겹침을 못 셌다 — 모두 겹치지 않는 것으로 둔다")
        for c in collections:
            c["dup"] = None

    out = DERIVED / "gbdb"
    (out / "sections").mkdir(parents=True, exist_ok=True)
    by_id = {c["id"]: c for c in collections}
    buckets = defaultdict(dict)
    for sid, sec in sections.items():
        buckets[sid % BUCKETS][str(sid)] = section_payload(sid, sec, by_id)
    for b in range(BUCKETS):
        (out / "sections" / f"{b:02d}.json").write_text(json.dumps(buckets.get(b, {}), ensure_ascii=False, separators=(",", ":")),
                                                         encoding="utf-8")

    from .reconstruct import Reconstructor
    rebuilder = Reconstructor()
    frames = {}
    stats["unplaced"] = 0
    for age, items in assign(collections, ages).items():
        if not items:
            continue
        lon, lat, ok = rebuilder.rotate([c["lng"] for c in items], [c["lat"] for c in items], age)
        rows = []
        for c, x, y, good in zip(items, lon, lat, ok):
            if not good:
                stats["unplaced"] += 1
                continue
            rows.append([c["id"], round(float(x), 2), round(float(y), 2), c["section"], len(c["taxa"]), c["dup"],
                         c["max_ma"], c["min_ma"], c["precise"], round(c["lng"], 3), round(c["lat"], 3)])
        if not rows:
            continue
        name = f"gbdb/{age_key(age)}.json"
        (DERIVED / name).write_text(json.dumps({"age": age, "window_ma": WINDOW_MA, "fields": FIELDS, "rows": rows},
                                               ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        frames[age_key(age)] = {"file": name, "count": len(rows), "dup": sum(1 for r in rows if r[5])}
    print(f"  시점 {len(frames)} 장 (판이 없어 뺀 채집·시점 {stats['unplaced']})")
    return {"snapshot": spec["snapshot"], "record": spec["record"], "citation": spec["citation"],
            "license": spec["license"]["name"], "fields": FIELDS, "frames": frames,
            "sections": "gbdb/sections/{b}.json", "buckets": BUCKETS,
            "dup_rule": {"km": DUP_KM, "share": DUP_SHARE, "slack_ma": DUP_SLACK_MA}, "stats": stats}


def attach():
    """GBDB 만 굽고 지금 index.json 에 붙인다."""
    from .build import cite
    path = DERIVED / "index.json"
    index = json.loads(path.read_text(encoding="utf-8"))
    index["gbdb"] = build([f["age"] for f in index["frames"]])
    sources = [s for s in index.get("sources", []) if s.get("id") != "gbdb"]
    if index["gbdb"]:
        sources.append(cite("gbdb"))
    index["sources"] = sources
    path.write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"GBDB -> {path}")
