"""PBDB 산지 → 시점마다 화석 점 JSON 하나.

점 하나는 산지(collection) 하나다. 산출(occurrence)은 점을 눌렀을 때 뷰어가
PBDB 에 바로 묻는다 — 백만 건이 넘는 산출을 미리 다 싣지 않으려는 것이다.

좌표는 산지의 현재 좌표를 **그 시점의 나이로** PALEOMAP v19o 판 모델로 돌린 것이다(reconstruct.py, 017).
그 나이에 판을 못 찾으면 PBDB 고좌표(pgm=scotese, 산지 연대의 중간값)를 쓰고 `rotated = 0` 으로 표시한다.

연대가 절 단위로 정해지지 않은 **모호한 연대** 산지("Middle Cambrian", "Late Triassic" …)는
`precise = 0` 으로 표시해 뷰어가 세모로 그린다. 절 이름 여럿으로 정해진 범위("Norian–Rhaetian")는
정해진 기록이다 — intervals.py, devlog 016.
"""
import bisect
import csv
import json

from .common import DERIVED, PLATE_ONLY_FROM_MA, WINDOW_MA, age_key, environment_class, manifest, source_path
from .intervals import is_vague, load_types

FIELDS = ["collection_no", "paleolng", "paleolat", "env", "n_occs", "collection_name",
          "early_interval", "late_interval", "max_ma", "min_ma", "formation", "environment", "cc",
          "precise",     # 1 = 절 단위 이하로 정해진 연대, 0 = 모호한 연대(세·기·대 …)
          "rotated"]     # 1 = 그 시점 나이로 PALEOMAP v19o 로 계산한 좌표, 0 = PBDB 고좌표(연대 중간값)


def number(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def read_collections(path):
    """(max_ma, min_ma, 행, 현재 경도, 현재 위도) 를 낸다. 연대나 좌표가 없는 것은 세기만 하고 버린다.

    시점마다 현재 좌표를 돌려 쓰고(017), PBDB 고좌표는 그 나이에 판을 못 찾을 때만 쓴다. PBDB 가 고좌표를 못 준
    산지는 016 까지처럼 뺀다 — 좌표 보정이 지도에 오르는 산지 집합까지 바꾸지 않게 한다.
    """
    stats = {"records": 0, "no_age": 0, "vague": 0, "no_coords": 0, "no_pbdb_paleo": 0, "environments": {}}
    rows = []
    types = load_types()
    with open(path, newline="", encoding="utf-8", errors="replace") as handle:
        for record in csv.DictReader(handle):
            stats["records"] += 1
            old, young = number(record.get("max_ma")), number(record.get("min_ma"))
            if old is None or young is None:
                stats["no_age"] += 1
                continue
            if old < young:
                old, young = young, old
            lng, lat = number(record.get("lng")), number(record.get("lat"))
            if lng is None or lat is None:
                stats["no_coords"] += 1
                continue
            plng, plat = number(record.get("paleolng")), number(record.get("paleolat"))
            if plng is None or plat is None:
                # 판 복원만 있는 시점(에디아카라기, 019)에 걸칠 수 있는 산지는 남긴다 — 그 시점에서만, 판으로 돌렸을 때만 쓴다
                if old + WINDOW_MA < PLATE_ONLY_FROM_MA:
                    stats["no_pbdb_paleo"] += 1
                    continue
            environment = (record.get("environment") or "").strip()
            stats["environments"][environment] = stats["environments"].get(environment, 0) + 1
            early = (record.get("early_interval") or "").strip()
            late = (record.get("late_interval") or "").strip()
            precise = not is_vague(early, late, types)
            stats["vague"] += not precise
            rows.append((old, young, [
                int(record["collection_no"]),
                round(plng, 2) if plng is not None else None,     # PBDB 고좌표 — build 가 시점마다 바꿔 쓴다
                round(plat, 2) if plat is not None else None,
                environment_class(environment), int(number(record.get("n_occs")) or 0),
                (record.get("collection_name") or "").strip(),
                (record.get("early_interval") or "").strip(),
                (record.get("late_interval") or "").strip(),
                old, young,
                (record.get("formation") or "").strip(),
                environment,
                (record.get("cc") or "").strip(),       # PBDB 국가 코드(GB 는 UK, 대양은 O1~O7)
                1 if precise else 0,
                0,                                      # rotated — 시점마다 build 가 채운다
            ], lng, lat))
    return rows, stats


def assign(rows, ages):
    """시점마다 그 무렵 산지(read_collections 의 항목 그대로). 연대 범위가 여러 시점의 창에 걸치면 그 시점 모두에 오른다.

    common.belongs 와 같은 규칙이다(범위 [young, old] 가 [age−창, age+창] 과 겹친다).
    """
    ages = sorted(ages)
    binned = {age: [] for age in ages}
    for item in rows:
        old, young = item[0], item[1]
        start = bisect.bisect_left(ages, young - WINDOW_MA)
        for age in ages[start:]:
            if age > old + WINDOW_MA:
                break
            binned[age].append(item)
    return binned


def build(ages, keep=None):
    """keep(dict)을 주면 산지마다 칸과 시점 좌표를 채운다 — 산출 사본의 조각(occurrences.py, koprifossillab 050)이 쓴다."""
    query = manifest("pbdb")["query"]
    path = source_path(query["path"])
    if not path.exists():
        raise SystemExit(f"{path} 가 없다 — 먼저 `python -m pipeline fetch`")
    receipt_path = path.parent / "receipt.json"
    receipt = json.loads(receipt_path.read_text(encoding="utf-8")) if receipt_path.exists() else {}

    rows, stats = read_collections(path)
    out = DERIVED / "fossils"
    out.mkdir(parents=True, exist_ok=True)
    entries = []
    # numpy·pygplates 는 여기서만 부른다 — assign 등 규칙은 표준 라이브러리만으로 시험한다(CI)
    from .reconstruct import Reconstructor
    rebuilder = Reconstructor()
    stats.update(rotated=0, pbdb_fallback=0)
    for age, items in assign(rows, ages).items():
        name = f"fossils/{age_key(age)}.json"
        # 시점마다 현재 좌표를 그 나이로 돌린다(017). 행은 시점마다 좌표가 다르므로 복사한다.
        lons = [item[3] for item in items]
        lats = [item[4] for item in items]
        rlon, rlat, ok = rebuilder.rotate(lons, lats, age)
        members = []
        for item, x, y, rotated in zip(items, rlon, rlat, ok):
            if item[2][1] is None and (age < PLATE_ONLY_FROM_MA or not rotated):
                continue                                  # PBDB 고좌표가 없는 산지는 판 복원만 있는 시점에서, 돌렸을 때만(019)
            row = list(item[2])
            if rotated:
                row[1], row[2], row[-1] = round(float(x), 2), round(float(y), 2), 1
                stats["rotated"] += 1
            else:
                stats["pbdb_fallback"] += 1               # 그 나이에 판이 없다 — PBDB 고좌표(중간값)
            members.append(row)
            if keep is not None:
                c = keep.get(row[0])
                if c is None:
                    c = keep[row[0]] = {"max_ma": row[8], "min_ma": row[9], "early": row[6], "late": row[7], "environment": row[11],
                                        "cc": row[12], "formation": row[10], "precise": row[13], "lng": item[3], "lat": item[4],
                                        "frames": []}
                c["frames"].append([age, row[2], row[1], row[-1]])
        members.sort(key=lambda row: row[0])
        payload = {"age": age, "window_ma": WINDOW_MA, "fields": FIELDS, "rows": members}
        (DERIVED / name).write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
                                    encoding="utf-8")
        counts = {k: sum(1 for r in members if r[3] == k) for k in "mto"}
        vague = sum(1 for r in members if not r[-2])
        fallback = sum(1 for r in members if not r[-1])
        entries.append({"age": age, "file": name, "count": len(members), "vague": vague,
                        "pbdb_fallback": fallback, "by_env": counts})
        print(f"  화석 {age:6.1f} Ma  {len(members):6d} 산지 (모호한 연대 {vague}, PBDB 좌표 {fallback}, "
              f"해양 {counts['m']}, 육상 {counts['t']})")
    stats["used"] = len(rows)
    return entries, {"stats": stats, "receipt": receipt}
