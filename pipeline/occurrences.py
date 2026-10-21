"""PBDB 산출의 사본 → 분포 분석의 정적 조각(koprifossillab P01 §3, 050).

브라우저가 분류군 하나의 **모든 산출**을 PBDB 의 20,000·5,000 건 한도 없이, 지도와 **같은 좌표 틀**(산지를 시점마다 v19o 로 돌린 것)로 세게
하려는 것이다. 서버 질의 없이 정적 파일로 — 연구소 밖의 공개판(GitHub Pages)에서도 돈다(연구자, P01 §11.4).

- **분류 나무 순서**: 산출을 그 채택 분류군의 `lft`(PBDB 의 나무 번호) 순으로 늘어놓으면, 어떤 분류군이든 그 아래의 모든 산출(PBDB 의
  `base_name` 과 같은 것)이 `[lft, rgt]` 의 **한 구간**이 된다. 그 순서로 1 MB 남짓의 조각으로 자르고, 목록에 조각마다 `lft` 의 처음·끝을 적는다.
  브라우저는 구간에 걸친 조각만 받는다
- **산지 칸은 조각 안에 산지마다 한 번** — 연대·환경·국가·지층·`precise`, 고유 산지-시간 열쇠(현재 좌표로, 047), **시점마다의 좌표**
  `[나이, 위도, 경도, rotated]`. 시점 파일은 시점마다라 한 분류군의 산지를 모으려면 110 개를 다 받아야 해서, 조각에 사본을 둔다
- 지도에 오르지 않는 산지(PBDB 고좌표가 없다 — 016)의 산출은 뺀다. 지도의 산지 집합과 같게
- **이름표**: 이름(동의어 포함) → 채택 분류군의 번호·`lft`·`rgt`·계급·산출 수. 첫 글자마다 파일 하나(taxa_ko 와 같은 꼴). `lft` 는 PBDB 가
  나무를 다시 세우면 바뀌므로 **같은 때 받은 나무**의 것만 쓴다(fetch 가 함께 받는다, 049)
- **큰 분류군의 요약**: 산출이 `ANALYSIS.summary_min_occs`(50,000, 연구자) 넘는 분류군은 시점마다의 수를 여기서 미리 센다 — 산출 수·시점 몫·
  몬테카를로 95%·속 수의 기대값·고위도 분위. 거르기(퇴적기원·나라·품질)는 요약에 들지 않는다(연구자가 받아들였다)
"""
import bisect
import csv
import json
import shutil
from collections import defaultdict

from .common import ANALYSIS, DERIVED, WINDOW_MA, coverage_rarefy, locality_key, manifest, source_path
from .quality import marks

OCC_FIELDS = ["occurrence_no", "collection_no", "accepted_no", "lft", "name", "rank", "genus", "identified_name", "marks",
              "reference_no"]
COLL_FIELDS = ["max_ma", "min_ma", "early_interval", "late_interval", "environment", "cc", "formation", "precise", "locality",
               "frames"]      # frames: [[나이, 위도, 경도, rotated], …]


def number(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def read_taxonomy(path):
    """채택 분류군 번호(orig_no) → (lft, rgt, 이름, 계급, n_occs), 그리고 이름 → [채택 번호…](동의어 포함)."""
    accepted, names = {}, defaultdict(set)
    with open(path, newline="", encoding="utf-8", errors="replace") as handle:
        for r in csv.DictReader(handle):
            orig, acc = r.get("orig_no"), r.get("accepted_no")
            if not orig or not acc:
                continue
            if orig == acc:
                lft, rgt = number(r.get("lft")), number(r.get("rgt"))
                if lft is None or rgt is None:
                    continue
                accepted[int(acc)] = (int(lft), int(rgt), r.get("accepted_name") or r.get("taxon_name") or "",
                                      r.get("accepted_rank") or r.get("taxon_rank") or "", int(number(r.get("n_occs")) or 0))
            name = (r.get("taxon_name") or "").strip()
            if name:
                names[name].add(int(acc))
    return accepted, names


def read_occurrences(path, accepted, colls, stats):
    """(lft, 행) 목록 — 지도에 오르는 산지의, 나무에 자리가 있는 산출만."""
    out = []
    with open(path, newline="", encoding="utf-8", errors="replace") as handle:
        for r in csv.DictReader(handle):
            stats["records"] += 1
            cno = int(number(r.get("collection_no")) or 0)
            if cno not in colls:
                stats["no_collection"] += 1
                continue
            acc = int(number(r.get("accepted_no")) or 0)
            taxon = accepted.get(acc)
            if not taxon:
                stats["no_taxon"] += 1
                continue
            lft = taxon[0]
            out.append((lft, [int(r["occurrence_no"]), cno, acc, lft,
                              r.get("accepted_name") or r.get("identified_name") or "",
                              r.get("accepted_rank") or "", r.get("genus") or "", r.get("identified_name") or "",
                              "".join(sorted(marks(r))), int(number(r.get("reference_no")) or 0)]))
    out.sort(key=lambda item: (item[0], item[1][0]))
    return out


def coll_row(c):
    return [c["max_ma"], c["min_ma"], c["early"], c["late"], c["environment"], c["cc"], c["formation"], c["precise"],
            c["locality"], c["frames"]]


def write_chunks(rows, colls, out, target_bytes):
    """나무 순서의 산출을 target_bytes 남짓으로 잘라 쓴다. 목록 [{file, lft_lo, lft_hi, n}]."""
    chunks, start = [], 0
    (out / "chunk").mkdir(parents=True, exist_ok=True)
    while start < len(rows):
        size, end, used = 0, start, set()
        while end < len(rows) and (size < target_bytes or end == start):
            row = rows[end][1]
            size += 60 + len(row[4]) + len(row[7])                      # 산출 한 행의 어림
            if row[1] not in used:
                used.add(row[1])
                size += 80 + 26 * len(colls[row[1]]["frames"])          # 산지 칸과 시점 좌표의 어림
            end += 1
        part = rows[start:end]
        name = f"chunk/{len(chunks):04d}.json"
        payload = {"fields": OCC_FIELDS, "coll_fields": COLL_FIELDS, "rows": [r for _, r in part],
                   "colls": {str(c): coll_row(colls[c]) for c in sorted(used)}}
        (out / name).write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        chunks.append({"file": "occs/" + name, "lft_lo": part[0][0], "lft_hi": part[-1][0], "n": len(part)})
        start = end
    return chunks


def write_names(names, accepted, counts, out):
    """이름 → [[채택 번호, lft, rgt, 계급, 사본의 산출 수, 채택 이름], …] 를 첫 글자마다. 사본에 산출이 있는 분류군만."""
    shards = defaultdict(dict)
    for name, accs in names.items():
        entries = []
        for acc in sorted(accs):
            t = accepted.get(acc)
            n = counts.get(acc, 0)
            if t and n:
                entries.append([acc, t[0], t[1], t[3], n, t[2]])
        if entries:
            key = name[0].lower() if name[0].isalpha() and name[0].isascii() else "_"
            shards[key][name] = entries
    (out / "taxa").mkdir(parents=True, exist_ok=True)
    for key, table in shards.items():
        (out / "taxa" / f"{key}.json").write_text(json.dumps(table, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return sorted(shards)


REF_SHARD = 1000      # 참고문헌 조각 — reference_no // 1000 마다 한 파일


def write_references(path, used, out):
    """재현 묶음의 문헌 목록(koprifossillab 051) — 사본의 산출이 쓰는 문헌만, reference_no 천 단위마다 한 파일."""
    shards = defaultdict(dict)
    with open(path, newline="", encoding="utf-8", errors="replace") as handle:
        for r in csv.DictReader(handle):
            no = int(number(r.get("reference_no")) or 0)
            if no in used:
                shards[no // REF_SHARD][str(no)] = [(r.get("formatted") or "").strip(), (r.get("doi") or "").strip()]
    (out / "refs").mkdir(parents=True, exist_ok=True)
    for key, table in shards.items():
        (out / "refs" / f"{key}.json").write_text(json.dumps(table, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return len(shards)


def subtree_counts(rows, accepted):
    """채택 분류군마다 그 아래(자신 포함)의 사본 산출 수 — lft 로 정렬된 행에서 [lft, rgt] 구간의 길이."""
    lfts = [lft for lft, _ in rows]
    return {acc: bisect.bisect_right(lfts, t[1]) - bisect.bisect_left(lfts, t[0]) for acc, t in accepted.items()}


def summarize(part, colls, ages, rules=ANALYSIS):
    """큰 분류군 하나의 시점마다 수 — 산출 수(겹침)·시점 몫·몬테카를로 95%·속 수의 기대값·고위도 분위(몫 가중)."""
    import numpy as np
    ages = sorted(a for a in ages if a <= 540)
    lo = np.array([max(0.0, a - WINDOW_MA) for a in ages])
    hi = np.array([a + WINDOW_MA for a in ages])
    old = np.array([colls[r[1]]["max_ma"] for r in part])
    young = np.array([colls[r[1]]["min_ma"] for r in part])
    span = old - young
    genus_ids = {}
    genus = np.array([genus_ids.setdefault(r[6], len(genus_ids)) if r[6] else -1 for r in part])
    frames = []
    for j, age in enumerate(ages):
        inside = (old >= lo[j]) & (young <= hi[j])
        if not inside.any():
            continue
        overlap = np.clip(np.minimum(old, hi[j]) - np.maximum(young, lo[j]), 0, None)
        w = np.where(span > 1e-9, overlap / np.where(span > 1e-9, span, 1), (old >= lo[j]) & (old <= hi[j]))
        w = np.where(inside, np.minimum(w, 1.0), 0.0)
        # 속 수의 기대값 — 속마다 1 − Π(1 − w)
        g = genus[inside & (genus >= 0)]
        wg = w[inside & (genus >= 0)]
        with np.errstate(divide="ignore"):
            logs = np.bincount(g, weights=np.log1p(-np.minimum(wg, 1.0)), minlength=len(genus_ids)) if len(g) else np.zeros(0)
        present = np.unique(g)
        genera = float((1.0 - np.exp(logs[present])).sum()) if len(present) else 0.0
        # 고위도 — 그 시점의 산지 좌표, 몫 가중 분위수
        idx = np.nonzero(inside)[0]
        lats, weights = [], []
        for k in idx:
            pos = colls[part[k][1]]["at"].get(age)
            if pos is not None and w[k] > 0:
                lats.append(pos[0])
                weights.append(w[k])
        frame = {"age": age, "n": int(inside.sum()), "share": round(float(w.sum()), 3), "genera": round(genera, 2)}
        if lats:
            order = np.argsort(lats)
            lv, wv = np.array(lats)[order], np.array(weights)[order]
            cum = np.cumsum(wv) - wv / 2
            q = lambda p: float(np.interp(p * wv.sum(), cum, lv))
            frame.update(lat_q1=round(q(.25), 2), lat_med=round(q(.5), 2), lat_q3=round(q(.75), 2))
        frames.append(frame)
    # 몬테카를로 — 산지마다 한 나이(그 산지의 산출은 함께), 시점 창에 넣어 산출 수를 센다
    by_coll = defaultdict(int)
    for r in part:
        by_coll[r[1]] += 1
    cnos = list(by_coll)
    c_old = np.array([colls[c]["max_ma"] for c in cnos])
    c_young = np.array([colls[c]["min_ma"] for c in cnos])
    c_n = np.array([by_coll[c] for c in cnos], dtype=float)
    rng = np.random.default_rng(rules["mc_seed"])
    edges = np.concatenate([lo[:1], hi])                    # 5 Myr 시점 창은 이어져 있다(0 Ma 창만 0 에서 잘린다)
    runs = np.zeros((rules["mc_runs"], len(ages)))
    for k in range(rules["mc_runs"]):
        drawn = c_young + (c_old - c_young) * rng.random(len(cnos))
        bins = np.searchsorted(edges, drawn, side="right") - 1
        ok = (bins >= 0) & (bins < len(ages))
        runs[k] = np.bincount(bins[ok], weights=c_n[ok], minlength=len(ages))
    band_lo, band_hi = np.percentile(runs, 2.5, axis=0), np.percentile(runs, 97.5, axis=0)
    at = {age: j for j, age in enumerate(ages)}
    for frame in frames:
        j = at[frame["age"]]
        frame.update(mc_lo=int(round(band_lo[j])), mc_hi=int(round(band_hi[j])))
    # 표본 범위 표준화 속 수(koprifossillab 054) — 산지가 표본, 연대 범위의 반 넘게가 그 창에 든 산지만, 문턱마다
    genera_of = defaultdict(set)
    for r in part:
        if r[6]:
            genera_of[r[1]].add(r[6])
    # 산지마다 연대 범위의 가운데가 든 시점 하나(palaeoverse bin_time 의 "mid") — 모호한 연대는 뺀다(054)
    by_frame = defaultdict(list)
    for c, gs in genera_of.items():
        if not colls[c]["precise"]:
            continue
        mid = (colls[c]["max_ma"] + colls[c]["min_ma"]) / 2
        j = int(np.searchsorted(hi, mid, side="right"))
        if j < len(ages) and lo[j] <= mid:
            by_frame[ages[j]].append(gs)
    for frame in frames:
        members = by_frame.get(frame["age"], [])
        inc, T = defaultdict(int), len(members)
        for gs in members:
            for g in gs:
                inc[g] += 1
        if not T:
            continue
        ys = list(inc.values())
        out = {"obs": len(ys), "T": T}
        for q in rules["coverage_quorums"]:
            r = coverage_rarefy(ys, T, q)
            out["q" + str(round(q * 100))] = None if r["s"] is None else round(r["s"], 2)
            out["cov"] = None if r["coverage"] is None else round(r["coverage"], 3)
        frame["sqs"] = out
    return frames


def build(kept, ages, receipt):
    """kept: fossils.build 가 채운 산지(번호 → 칸과 시점 좌표). index.json 에 붙일 칸을 돌려준다. 사본이 없으면 None."""
    spec = manifest("pbdb")
    if "occurrences" not in spec or "taxonomy" not in spec:
        return None
    occ_path, tax_path = source_path(spec["occurrences"]["path"]), source_path(spec["taxonomy"]["path"])
    if not occ_path.exists() or not tax_path.exists():
        print("  산출 사본이 없다 — `python -m pipeline fetch --refresh-pbdb` 뒤에 굽는다")
        return None
    out = DERIVED / "occs"
    if out.exists():
        shutil.rmtree(out)                  # 지난 조각이 남지 않게 — 목록이 가리키는 것만 둔다
    out.mkdir(parents=True)
    stats = defaultdict(int)
    accepted, names = read_taxonomy(tax_path)
    for c in kept.values():
        c["locality"] = locality_key(c["lat"], c["lng"], c["formation"], c["max_ma"], c["min_ma"])
        c["at"] = {f[0]: (f[1], f[2]) for f in c["frames"]}
    rows = read_occurrences(occ_path, accepted, kept, stats)
    stats["used"] = len(rows)
    print(f"  산출 {stats['records']} 가운데 {len(rows)} — 지도 밖 산지 {stats['no_collection']}, 나무에 없는 분류군 {stats['no_taxon']}")
    chunks = write_chunks(rows, kept, out, ANALYSIS["chunk_bytes"])
    counts = subtree_counts(rows, accepted)
    letters = write_names(names, accepted, counts, out)
    ref_path = source_path(spec["references"]["path"]) if "references" in spec else None
    refs = write_references(ref_path, {r[9] for _, r in rows}, out) if ref_path and ref_path.exists() else 0
    # 큰 분류군의 요약
    big = sorted((acc for acc, n in counts.items() if n > ANALYSIS["summary_min_occs"]), key=lambda a: accepted[a][0])
    (out / "summary").mkdir(parents=True, exist_ok=True)
    lfts = [lft for lft, _ in rows]
    summaries = {}
    for acc in big:
        lft, rgt, name, rank, _ = accepted[acc]
        part = [r for _, r in rows[bisect.bisect_left(lfts, lft):bisect.bisect_right(lfts, rgt)]]
        frames = summarize(part, kept, ages)
        file = f"occs/summary/{acc}.json"
        (DERIVED / file).write_text(json.dumps({"accepted_no": acc, "name": name, "rank": rank, "n": len(part),
                                                "frames": frames}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        summaries[str(acc)] = file
        print(f"  요약 {name} ({rank}) — 산출 {len(part)}")
    meta = {
        "snapshot": receipt.get("snapshot"), "retrieved_at": receipt.get("retrieved_at"),
        "tables": receipt.get("tables"), "fields": OCC_FIELDS, "coll_fields": COLL_FIELDS,
        "chunks": chunks, "taxa": [f"occs/taxa/{k}.json" for k in letters], "summaries": summaries,
        "summary_min_occs": ANALYSIS["summary_min_occs"], "stats": dict(stats),
        "refs": "occs/refs/{shard}.json" if refs else None, "ref_shard": REF_SHARD,
    }
    (out / "index.json").write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    size = sum(p.stat().st_size for p in out.rglob("*.json"))
    print(f"  조각 {len(chunks)} 개, 이름표 {len(letters)} 개, 요약 {len(summaries)} 개 — {size / 1e6:.0f} MB")
    return {"index": "occs/index.json", "snapshot": meta["snapshot"], "retrieved_at": meta["retrieved_at"],
            "records": len(rows), "chunks": len(chunks)}
