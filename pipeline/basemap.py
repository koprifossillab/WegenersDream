"""배경 그림과 세밀한 지형만 다시 굽고 지금 index.json 에 입힌다(tupandactyl 040 — 지도 화질).

    python -m pipeline basemap                 굽고(30 분 남짓) 입힌다
    python -m pipeline basemap --attach-only   이미 구운 것(basemap/entries.json)을 지금 index.json 에 입히기만 한다

화석·해안선 등은 손대지 않는다. 운영에 올릴 때는 구운 폴더(`basemap/`·`terrain/fine/`)를 운영 자료 폴더와 주간 갱신의 가공 폴더
(paleoadmin 의 `data/derived/`) 둘 다에 옮기고 각 폴더에서 `--attach-only` 로 목록에 입힌다 — 주간 갱신(`build --no-relief`)은
가공 폴더의 목록에서 배경·지형 칸을 이어받는다(build.previous_reliefs·previous_terrains).
"""
import json

from . import relief, terrain
from .common import DERIVED

ENTRIES = DERIVED / relief.ROOT_DIR / "entries.json"


def main(attach_only=False):
    if attach_only:
        data = json.loads(ENTRIES.read_text(encoding="utf-8"))
    else:
        entries = relief.build()
        fine = terrain.build_fine()
        data = {"relief": entries, "fine": [{"age": a, **v} for a, v in sorted(fine.items())]}
        ENTRIES.parent.mkdir(parents=True, exist_ok=True)
        ENTRIES.write_text(json.dumps(data, ensure_ascii=False) + "\n", encoding="utf-8")
    path = DERIVED / "index.json"
    index = json.loads(path.read_text(encoding="utf-8"))
    missing = [p for e in data["relief"] for p in e["files"].values() if not (DERIVED / p).is_file()]
    missing += [e["file"] for e in data["fine"] if not (DERIVED / e["file"]).is_file()]
    if missing:
        raise SystemExit(f"구운 파일이 없다({missing[0]}) — 폴더를 먼저 옮긴다")
    n = relief.patch(index, {e["age"]: e for e in data["relief"]})
    fine = {e["age"]: {"file": e["file"], "step": e["step"]} for e in data["fine"]}
    m = 0
    for frame in index["frames"]:
        if frame.get("terrain") and frame["age"] in fine:
            frame["terrain"]["fine"] = fine[frame["age"]]
            m += 1
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    tmp.replace(path)
    print(f"목록: 배경 {n}·세밀한 지형 {m} / {len(index['frames'])} 시점 -> {path}")
