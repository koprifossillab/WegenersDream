# koprifossillab P02 — 세는 단위·표본 표준화·범위 밖 기록을 연구 관행에 맞춘다 — 계획

2026-10-21 · `main`(문서만)

연구자(10-21): "세는 단위는 연구에서 더 많이 쓰는 방향으로. 표준화, 범위 밖 기록의 처분도 실제 paleogeography 연구를 참고하여 반영하고,
캐주얼 모드에서도 엄밀 표기는 이용에 불편이 없는 한 기본으로." [P01](20261020_koprifossillab_P01_analysis_rigor.md) 의 열린 질문 5·8·11·12·13 에 대한 답이다.

## 1. 연구에서 어떻게 하나

| 주제 | 관행 | 근거 |
|---|---|---|
| 다양성을 셀 때의 표본 단위 | **PBDB 산지(collection)** 를 표본 하나로 — 분류군의 "있음/없음"(incidence)으로 센다. 같은 산지의 같은 속은 한 번 | Alroy et al. 2001·2008 의 목록 단위 표본추출, Alroy 2010(SQS), Close et al. 2017·2020 |
| 공간을 셀 때의 단위 | **등면적 격자 칸**에 넣어 칸마다 있음/없음 — 좌표의 작은 차이와 같은 자리의 여러 산지를 흡수한다. divvy 의 기본은 Equal Earth(EPSG:8857) 200 km 칸(≈2°) | Antell et al. 2024(Paleobiology 50:177–193, divvy), Close et al. 2017 |
| 표본 크기 표준화 | **표본 범위(coverage) 기준 희박화** — SQS(Alroy 2010)와 거의 같은 것을 Chao & Jost(2012)가 해석적으로 풀었다. 산지 단위 incidence 로, 문턱(quorum) 0.4~0.7. 고전적 희박화(같은 표본 수)는 고르기(evenness)에 휘둘린다 | Alroy 2010, Chao & Jost 2012, Chao et al. 2014(Ecol. Monogr., iNEXT) |
| 공간 표준화 | 면적과 퍼짐(최소 신장 트리 길이)을 맞춘 부분표본 — 희박화만으로는 고르지 않은 공간 표본을 못 지운다 | Close et al. 2017, Antell et al. 2024 |
| 시간 구간에 넣기 | 연대 범위의 **반 넘게(majority)** 든 구간 하나에 — 넣을 수 없는 산지(범위가 구간보다 훨씬 넓다)는 표준화한 셈에서 빠진다. PBDB `timerule=major` 와 같은 생각 | PBDB diversity 문서, palaeoverse `bin_time`(Jones et al. 2023) |
| 범위 밖 기록 | **시공간 외톨이 시험** — 분류군마다 기록들 사이의 시간·거리 차의 합이 사분위 범위로 본 바깥(q75 + 5×IQR)이면 외톨이. 나이는 범위 안에서 무작위로, 5 번 되풀이해 반 넘게 걸리면 표시. 정리(cleaning) 단계에서 뺀다 | CoordinateCleaner `cf_outl`(Zizka et al. 2019) |

## 2. 무엇을 바꾸나

### 2.1 Casual 에서도 엄밀 표기를 기본으로(질문 13)

`RIGOR` 의 기본을 두 모드 모두 켬. 이미 고른 값은 모드마다 기억한 대로. 불편한 것이 있으면(상태 줄이 길어지는 것) 그 줄만 Casual 에서 접는다 —
처음에는 그대로 두고 본다.

### 2.2 세는 단위(질문 5·12)

- **다양성(속 수)·표준화** — 산지가 표본. 지금도 산출을 산지로 묶는다 — 그대로
- **공간(고위도 분위·10° 띠·겹침)** — 047 의 "고유 산지-시간"(우리가 정한 열쇠)을 **등면적 격자 칸**(Equal Earth, 200 km)으로 바꾼다. 칸은 그 시점의
  고좌표로 잡는다(divvy 도 고좌표 칸). 엄밀 표기에서 기본. "지금 시점" 의 5° 칸 Jaccard 도 같은 칸으로
- 047 의 고유 산지-시간 열쇠는 재현 묶음의 칸으로만 남긴다(화면 고르기는 격자 칸으로 대신한다)

### 2.3 표본 범위 표준화 속 수(질문 8)

- 시점마다 **산지 단위 incidence** 로 Chao et al.(2014) 의 표본 범위 추정·희박화. 문턱 기본 **0.5**(0.4~0.7 고르기), 관찰 범위가 모자라면 관찰 표본
  수의 2 배까지 외삽(iNEXT 의 기본 끝점), 그래도 모자라면 비운다("표본 부족")
- 시점에 넣기는 **majority**(그 시점 창에 범위의 반 넘게 든 산지만) — 지도의 겹침과 다르다는 것을 곡선 밑에 적는다
- 브라우저(사본의 산출, 50,000 건 이하)와 파이프라인(요약)이 같은 셈 — 044·045 처럼 두 시험이 같은 보기 파일
- 다양성 그래프에 "속 수 — 시점, 표본 범위 표준화" 를 더한다(지금의 PBDB 절 단위 셈 셋 옆에)
- 공간 표준화(divvy 의 원형 부분표본)는 이번에 넣지 않는다 — 다음 계획. 대신 **점유 칸 수와 최소 신장 트리 길이**(퍼짐)를 "지금 시점" 수치에 보여
  공간 표본의 차이를 읽게 한다

### 2.4 범위 밖 기록(질문 11)

- `cf_outl` 꼴의 **시공간 외톨이 시험**을 찾은 분류군마다 브라우저에서(사본의 산출) — 시간(범위 안의 무작위 나이)과 공간(오늘날 좌표의 대권 거리)
  차의 평균을 각각 최댓값으로 나눠 더하고, q75 + 5×IQR 을 넘으면 외톨이, 5 번 되풀이해 반 넘게 걸리면 표시. 기록이 10 건 미만이면 시험하지 않는다
  (CoordinateCleaner 의 기본값들). 큰 분류군은 기준 2,000 건을 뽑아 견준다
- 엄밀 표기에서 **외톨이는 기본으로 뺀다** — 관행이 정리 단계에서 빼는 것이다. 거르기 줄에 "범위 밖(시공간 외톨이) 기록 빼기"(기본 켬), 상태 줄에
  뺀 수, 팝업·커서 목록에 표지. 046 의 대멸종 경계 걸침은 그대로 따로 둔다
- 동정 표지(045)의 "표시만" 은 그대로 — 연구자가 정한 것

## 3. 순서

| 단계 | 무엇 | 판 |
|---|---|---|
| 1 | Casual 엄밀 표기 기본 + 등면적 격자 칸 | 1.10.0 |
| 2 | 표본 범위 표준화 속 수(브라우저·요약) | 1.11.0 |
| 3 | 시공간 외톨이 표지·빼기 | 1.12.0 |

## 4. 참고

- Alroy, J. 2010. Geographical, environmental and intrinsic biotic controls on Phanerozoic marine diversification. *Palaeontology* 53:1211–1235 (SQS)
- Chao, A. & Jost, L. 2012. Coverage-based rarefaction and extrapolation. *Ecology* 93:2533–2547
- Chao, A. et al. 2014. Rarefaction and extrapolation with Hill numbers. *Ecological Monographs* 84:45–67
- Close, R. A., Benson, R. B. J., Upchurch, P. & Butler, R. J. 2017. Controlling for the species-area effect … *Nature Communications* 8:15381
- Antell, G. S., Benson, R. B. J. & Saupe, E. E. 2024. Spatial standardization of taxon occurrence data—a call to action. *Paleobiology* 50:177–193 (divvy)
- Zizka, A. et al. 2019. CoordinateCleaner. *Methods in Ecology and Evolution* 10:744–751 (`cf_outl`·`cf_range`)
- Jones, L. A. et al. 2023. palaeoverse. *Methods in Ecology and Evolution* 14:2205–2215
