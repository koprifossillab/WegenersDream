"""산출의 동정 품질 — 어느 PBDB 표지를 "불확실" 로 보나(koprifossillab P01 §6, 045).

PBDB 산출의 동정에는 수식어가 붙는다(`show=ident` 의 `primary_reso`·`subgenus_reso`·`species_reso`). 화면은 이것을 표지로 달고
(연구자: 모두 보이고 **표시만**, 빼는 것은 고를 때만 — P01 §11.1), 분석 패널에서 거를 수 있게 한다. 규칙은 이 파일 한 곳이고
`index.json` 의 `rules.quality` 로 뷰어에 간다. 표지를 매기는 셈은 뷰어의 analysis.js(`identMarks`)이고, 두 시험이 같은 보기
(tests/quality_cases.json)를 쓴다.

- **속 불확실** — 속(또는 아속) 이름에 cf.·aff.·?·따옴표("… 쓰임이 의심스럽다")·informal
- **종 불확실** — 종 이름에 같은 것과 ex gr.(그 무리의 하나)
- **속까지 동정 안 됨** — PBDB 동정 계급(`identified_rank`)이 속보다 위(과·목 … indet.)
- **새 이름** — n. gen.·n. sp. 등. 불확실이 아니다 — 처음 기재된 기록이라는 표시만

PBDB 의 `flags` 칸은 뜻을 문서로 확인하기 전까지 쓰지 않는다(P01 §6).
"""

QUALITY = {
    "uncertain_reso": ["cf.", "aff.", "?", "\"", "informal"],
    "uncertain_species_reso": ["cf.", "aff.", "?", "\"", "informal", "ex gr."],
    "new_reso": ["n. gen.", "n. subgen.", "n. sp.", "n. ssp."],
    "genus_or_below": ["genus", "subgenus", "species", "subspecies"],
}


def marks(record, rules=QUALITY):
    """PBDB 산출 하나(show=ident) → 표지 집합: g(속 불확실)·s(종 불확실)·h(속까지 동정 안 됨)·n(새 이름)."""
    out = set()
    reso = lambda key: (record.get(key) or "").strip()
    if reso("primary_reso") in rules["uncertain_reso"] or reso("subgenus_reso") in rules["uncertain_reso"]:
        out.add("g")
    if reso("species_reso") in rules["uncertain_species_reso"]:
        out.add("s")
    rank = (record.get("identified_rank") or "").strip()
    if rank and rank not in rules["genus_or_below"]:
        out.add("h")
    if any(reso(k) in rules["new_reso"] for k in ("primary_reso", "subgenus_reso", "species_reso")):
        out.add("n")
    return out
