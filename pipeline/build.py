"""세 가공물을 만들고, 뷰어가 처음 읽는 목록(index.json)으로 묶는다.

시점은 PaleoDEM 이 정한다(109 장). 해안선은 81 시점뿐이라 시점마다 가장 가까운
해안선을 붙이되, 10 Myr 보다 멀면 붙이지 않는다 — 먼 시대의 해안선을 긋느니 없다고
말하는 편이 낫다. 어느 나이의 해안선을 그었는지는 목록에 적어 화면에 띄운다.

목록에는 층서표(timescale.py)와 퇴적 환경 나무(environments.py)도 싣는다. 뷰어는 둘을
따로 들고 있지 않고 여기서 받아 그린다 — 이름·경계·색을 고칠 자리가 한 곳이다.
"""
import json
from datetime import datetime, timezone

from . import climate, coastlines, countries, fossils, lithology, relief, terrain
from .common import ANALYSIS, DERIVED, EDIACARAN_AGE, PLATE_ONLY_FROM_MA, WINDOW_MA, manifest, period, source_path
from .environments import classify, tree_for_index
from .intervals import VAGUE_TYPES, load_types, vague_names
from .quality import QUALITY
from .timescale import containing, units
from .events import events_for_index

COASTLINE_REACH_MA = 10.0
SCHEMA = 2


def nearest(entries, age, reach):
    best = min(entries, key=lambda e: abs(e["age"] - age), default=None)
    if best is None or abs(best["age"] - age) > reach:
        return None
    return best


def cite(name):
    spec = manifest(name)
    return {"id": spec["id"], "title": spec["title"], "citation": spec["citation"],
            "license": spec["license"]["name"], "license_url": spec["license"]["url"]}


def previous_reliefs():
    """지난 목록의 배경 항목 — 배경은 그대로 두고 나머지만 다시 만들 때(--no-relief)."""
    index = json.loads((DERIVED / "index.json").read_text(encoding="utf-8"))
    out = []
    for f in index["frames"]:
        files = f.get("relief_files") or {"2048": f["relief"]}
        missing = [p for p in files.values() if not (DERIVED / p).is_file()]
        if missing:
            raise SystemExit(f"배경 그림이 없다({missing[0]}) — --no-relief 없이 돌린다")
        out.append({"age": f["age"], "label": f["label"], "file": f["relief"], "files": files,
                    "grid": f.get("grid", "1deg"), "land_fraction": f["land_fraction"]})
    return out


def previous_terrains():
    """지난 목록의 지형 칸(wetherilli 016) — --no-relief 에서 지형도 그대로 둔다. 파일이 없는 시점은 뺀다
    (옛 목록이면 지형 없이 나가고, `python -m pipeline terrain` 으로 붙인다)."""
    index = json.loads((DERIVED / "index.json").read_text(encoding="utf-8"))
    return {f["age"]: f["terrain"] for f in index["frames"]
            if f.get("terrain") and (DERIVED / f["terrain"]["file"]).is_file()}


def frame_entry(entry, terrain, coast, border, temp, found):
    """index.json 의 시점 하나. 에디아카라기 시점(ediacaran.attach)도 이것으로 만든다."""
    age = entry["age"]
    return {
        "age": age,
        "label": entry["label"],
        "period": period(age),
        "units": [u["id"] for u in containing(age, units())],
        "relief": entry["file"],
        "relief_files": entry["files"],
        "grid": entry["grid"],
        "land_fraction": entry["land_fraction"],
        "terrain": terrain,
        "coastline": {"age": coast["age"], "file": coast["file"]} if coast else None,
        "borders": border,
        "climate": temp,
        "fossils": {"file": found.get("file"), "count": found.get("count", 0),
                    "vague": found.get("vague", 0), "pbdb_fallback": found.get("pbdb_fallback", 0),
                    "by_env": found.get("by_env", {})},
    }


def build(skip_relief=False):
    DERIVED.mkdir(parents=True, exist_ok=True)
    print("배경(PaleoDEM)" + (" — 지난 것을 그대로 쓴다" if skip_relief else ""))
    reliefs = previous_reliefs() if skip_relief else relief.build()
    if not any(e["age"] == EDIACARAN_AGE for e in reliefs):
        from . import ediacaran                   # 에디아카라기 — 판 복원만으로 그린 배경(019)
        reliefs = [ediacaran.relief_entry()] + reliefs
    # 지형(지구본의 높이, wetherilli 016)은 배경과 같은 격자에서 굽는다(5 분 남짓). --no-relief 면 지난 것을 둔다
    print("지형(PaleoDEM → 지구본 높이)" + (" — 지난 것을 그대로 쓴다" if skip_relief else ""))
    terrains = previous_terrains() if skip_relief else terrain.build()
    print("해안선(PaleoCoastlines)")
    coasts = coastlines.build()
    print("화석(PBDB)")
    kept = {}
    fossil_entries, fossil_meta = fossils.build([e["age"] for e in reliefs], keep=kept)
    print("산출 사본(PBDB occurrences) — 분포 분석의 조각")
    from . import occurrences             # koprifossillab 050 — 사본이 없으면 건너뛴다
    occs_meta = occurrences.build(kept, [e["age"] for e in reliefs], fossil_meta.get("receipt") or {})
    del kept
    by_age = {e["age"]: e for e in fossil_entries}
    print("국경(Natural Earth → PALEOMAP)")
    border_entries, country_names = countries.build([e["age"] for e in reliefs])
    borders = {e["age"]: e["file"] for e in border_entries}
    print("고기후(Scotese 2021 지표 기온)")
    temps = climate.build([e["age"] for e in reliefs])
    # 최근의 절 기온(PaleoClim, tupandactyl 010) — climate/pc_*.png·recent.json. 뷰어는 index.json 이 아니라 recent.json 을
    # 따로 읽는다. 바뀌지 않는 원본이라 --no-relief 면 있는 것을 그대로 두고 없을 때만 굽는다(koprifossillab 033).
    # 전에는 `pipeline paleoclim` 으로만 구워 가공 폴더에 없고 운영 폴더에만 있었다
    if skip_relief and (DERIVED / "climate" / "recent.json").is_file():
        print("최근 절 기온(PaleoClim) — 지난 것을 그대로 쓴다")
    else:
        print("최근 절 기온(PaleoClim)")
        from . import paleoclim         # numpy·tifffile — 규칙 시험(CI)이 build 를 부르지 않아도 여기서만 부른다
        paleoclim.build()

    # 한글 → 학명 찾기 표(tupandactyl 021) — 이름표(fetch)가 있을 때만. node 가 없으면 건너뛴다(뷰어는 관용 표기만 받는다)
    from . import taxa_ko
    try:
        found_ko = taxa_ko.build() if source_path(manifest("pbdb")["taxa"]["path"]).exists() else None
    except SystemExit as err:
        print(f"  한글 찾기 표 건너뜀 — {err}")
        found_ko = None

    frames = []
    for entry in reliefs:
        age = entry["age"]
        plate_only = age >= PLATE_ONLY_FROM_MA          # 에디아카라기(019) — 해안선·기온·지형이 없다. 가까운 것을 끌어오지 않는다
        coast = None if plate_only else nearest(coasts, age, COASTLINE_REACH_MA)
        frames.append(frame_entry(entry, terrain=None if plate_only else terrains.get(age), coast=coast,
                                  border=borders.get(age), temp=None if plate_only else temps.get(age),
                                  found=by_age.get(age, {})))

    scale = units()
    env_counts = fossil_meta["stats"].pop("environments")
    unlisted = sorted(t for t in env_counts if classify(t)[1] == "o-unlisted")
    if unlisted:
        print(f"  환경 나무에 없는 PBDB 용어 {len(unlisted)} 개: {unlisted} — environments.py 에 넣는다")
    index = {
        "schema": SCHEMA,
        "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "frames": sorted(frames, key=lambda f: f["age"]),
        # 채집지를 시점에 올리는 규칙. 뷰어의 분류군 찾기가 같은 값으로 거른다(두 곳에 적지 않는다).
        # vague_intervals — 모호한 등급(세·기·대 …)의 PBDB 시대 이름. 뷰어가 PBDB 에 바로 물은 결과를 같은 규칙으로 가른다(016)
        "rules": {"window_ma": WINDOW_MA, "vague_types": list(VAGUE_TYPES),
                  "vague_intervals": vague_names(load_types()),
                  "analysis": ANALYSIS,
                  "quality": QUALITY},       # 동정 품질 표지(koprifossillab 045) — quality.py 한 곳     # 분포 분석의 셈(koprifossillab P01·044) — 몫의 정의·몬테카를로
        "timescale": {"names": "국제지질연대층서표 한글판 v2023/04", "boundaries": "ICS v2024/12",
                      "units": scale},
        "environments": tree_for_index(env_counts),
        "taxa_ko": found_ko,                    # 한글 → 학명 찾기 표(tupandactyl 021)
        "lithology": lithology.for_index(),     # 암상 용어의 한글(tupandactyl 020) — lithology.py 한 곳
        "events": events_for_index(),           # 대멸종·전 지구 사건(tupandactyl 016) — events.py 한 곳
        "countries": countries.country_list(country_names),
        "pbdb": fossil_meta,
        "occurrences": occs_meta,               # 산출 사본의 조각 목록(koprifossillab 050) — 없으면 null, 뷰어는 PBDB 에 바로 묻는다
        "sources": [cite("paleodem"), cite("paleocoastlines"), cite("paleotemp"), cite("pbdb"), cite("countries")],
    }
    (DERIVED / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n",
                                        encoding="utf-8")
    print(f"목록: {len(frames)} 시점 -> {DERIVED / 'index.json'}")
    return index
