"""계통 생물지리 묶음 — 연대 나무 + 조상 범위 추정 결과를 시점마다의 지도 자리와 함께 굽는다(tupandactyl 035).

뷰어는 R 도, 분석도 돌리지 않는다. **분석은 밖에서**(BioGeoBEARS 는 R, `pipeline/r/` 의 스크립트와 Docker — README) 돌리고,
그 결과를 연구실이 검토해 `sources/phylogeo/<id>.json`(연구·지역 정의)과 `<id>.result.json`(나무와 노드의 범위 확률)으로
저장소에 둔다. 이 단계는 둘을 합쳐

- 지역마다 대표 지점(현생 분포의 자리)을 **시점마다 PALEOMAP v19o 로 돌린** 자리 — 화석 좌표와 같은 판 모델(CLAUDE.md "판 모델을 하나로")
- 나무(노드의 나이·부모·끝 이름)와 노드마다 범위 확률(1% 이상만)

을 `phylogeo/<id>.json` 하나로 굽고, `index.json` 의 `phylogeo` 칸에 목록을 단다.

지역을 다각형이 아니라 **지점**으로 둔 까닭: 지역 경계(예: "동남아시아")는 여러 판에 걸치고, 다각형의 꼭짓점이 바다에 떨어지면
그 나이에 판이 없어 돌릴 수 없다. 육지 위의 지점은 늘 판이 있다. 뷰어는 돌린 지점들의 볼록 껍질과 가운데를 그린다.

    python -m pipeline phylogeo      묶음만 굽고 지금 index.json 에 붙인다 (몇 초)
"""
import json

import numpy as np

from .common import DERIVED, SOURCES, age_key

SRC = SOURCES / "phylogeo"
MARGIN_MA = 10.0        # 뿌리보다 이만큼 오래된 시점까지 — 뿌리 가지가 시작하는 자리를 보이게


def studies():
    """(정의, 결과) 쌍. 결과 파일이 없는 정의는 건너뛴다."""
    out = []
    for path in sorted(SRC.glob("*.json")):
        if path.name.endswith(".result.json"):
            continue
        result = path.with_name(path.stem + ".result.json")
        if not result.exists():
            print(f"  {path.name}: 결과 파일 {result.name} 이 없어 건너뛴다")
            continue
        out.append((json.loads(path.read_text(encoding="utf-8")), json.loads(result.read_text(encoding="utf-8"))))
    return out


def area_positions(areas, ages, reconstructor):
    """{나이 열쇠: {지역: [[위도, 경도] …]}} — 지점을 그 나이로 돌린다. 판이 없는 지점은 뺀다."""
    out = {}
    for age in ages:
        here = {}
        for code, area in areas.items():
            pts = np.asarray(area["points"], dtype=float)
            lon, lat, ok = reconstructor.rotate(pts[:, 1], pts[:, 0], float(age))
            here[code] = [[round(float(a), 3), round(float(b), 3)] for a, b, k in zip(lat, lon, ok) if k]
        out[age_key(age)] = here
    return out


def bundle(study, result, ages, reconstructor):
    root_age = max(n["age"] for n in result["nodes"])
    use = [a for a in ages if a <= root_age + MARGIN_MA]
    areas = {code: {k: v for k, v in a.items() if k != "points"} for code, a in study["areas"].items()}
    return {
        "id": study["id"],
        "title": study["title"], "title_ko": study.get("title_ko"),
        "method": study["method"], "citation": study["citation"], "data": study.get("data"), "note": study.get("note"),
        "model": result["model"], "lnl": result.get("LnL"), "params": result.get("params"),
        "models": result.get("models"),                 # 견준 모델들의 LnL·AIC(있으면)
        "root_age": root_age,
        "areas": areas,
        "nodes": result["nodes"],
        "positions": area_positions(study["areas"], use, reconstructor),
    }


def build(frames):
    """index.json 의 `phylogeo` 칸(목록). frames 는 index 의 시점들."""
    pairs = studies()
    if not pairs:
        return []
    from .reconstruct import Reconstructor
    reconstructor = Reconstructor()
    ages = sorted({float(f["age"]) for f in frames})
    (DERIVED / "phylogeo").mkdir(parents=True, exist_ok=True)
    listing = []
    for study, result in pairs:
        data = bundle(study, result, ages, reconstructor)
        rel = f"phylogeo/{study['id']}.json"
        (DERIVED / rel).write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        listing.append({"id": study["id"], "title": study["title"], "title_ko": study.get("title_ko"),
                        "method": study["method"], "root_age": data["root_age"], "file": rel})
        print(f"  {study['id']}: 노드 {len(data['nodes'])}, 시점 {len(data['positions'])} -> {rel}")
    return listing


def attach():
    """`python -m pipeline phylogeo` — 지금 목록에 계통 생물지리 묶음만 굽고 붙인다."""
    path = DERIVED / "index.json"
    index = json.loads(path.read_text(encoding="utf-8"))
    index["phylogeo"] = build(index["frames"])
    path.write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"계통 생물지리 {len(index['phylogeo'])} 건 -> {path}")
