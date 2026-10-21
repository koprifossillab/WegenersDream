# PBDB 자료 — 받기, 가공, 지도에 그리기

2026-09-30 · 0.26.0 기준 · 숫자는 09-30 08:04 UTC 에 받은 PBDB. 규칙의 근거는 devlog(번호를 괄호에 단다).

## 1. 한눈에

```
PBDB colls/list.csv (pgm=scotese) ─┐                                   ┌─ 뷰어(map.js): 시점 파일을 읽어 거르고 칠해 그린다
PBDB intervals/list.json ──────────┼─ fetch ─▶ data/sources/pbdb/ ─ build ─▶ fossils/<나이>.json ×109
                                   │   (매주 월 02:30)                 │     index.json 의 rules·pbdb·environments·countries
                                   │                                   └─ 브라우저가 PBDB 에 바로 묻는 것: 산출 목록·분류군 찾기·후보·계급·분포
```

- **점 하나는 산지(collection) 하나다.** 산출(occurrence)은 미리 싣지 않고, 점을 누르거나 분류군을 찾을 때 브라우저가 PBDB 에 바로 묻는다
  — 백만 건이 넘는 산출을 파일로 나르지 않으려는 것이다
- **판 모델은 하나** — 배경·해안선·국경·화석 좌표 모두 PALEOMAP 틀(CLAUDE.md "판 모델을 하나로")
- 규칙의 숫자·이름은 파이프라인 **한 곳**이 정하고 `index.json` 으로 뷰어에 보낸다. map.js 에 다시 적지 않는다(§5)

## 2. 받기 — `pipeline/fetch.py`, 매니페스트 `sources/pbdb.json`

| 받는 것 | 주소 | 자리 |
|---|---|---|
| 산지 전체 | `data1.2/colls/list.csv?all_records&show=loc,paleoloc,geo,crmod&pgm=scotese&vocab=pbdb` | `data/sources/pbdb/collections.csv`(114 MB, 278,399 행) |
| 시대 이름표 | `data1.2/intervals/list.json?all_records&vocab=pbdb` | `data/sources/pbdb/intervals.json`(1,909 개) |

- **`pgm=scotese` 가 요점이다** — PBDB 기본 모델(`gplates`, Wright 2013)의 고좌표는 배경과 판 모델이 달라 점이 수 도씩 어긋난다(001).
  화면의 분류군 찾기도 늘 `pgm=scotese` 로 묻는다
- `show=loc` 이 국가 코드 `cc`(ISO alpha-2, 영국은 `UK`, 대양은 `O1`~`O7`)를 준다 — 국가로 거르기(003)
- PBDB 는 살아 있어 같은 질의도 나중에는 더 준다. 그래서 크기·SHA-256 을 미리 고정하지 않고 **받은 날의 값**을 `receipt.json` 에 적는다
  (`retrieved_at`·`bytes`·`sha256`·`records`). 받기는 임시 파일에 받아 행을 세고(`paleolat` 칸이 있는지) 다 받은 뒤 바꿔 끼운다 —
  실패해도 지난 사본이 남는다
- **매주 월요일 02:30** paleoadmin 의 cron 이 `fetch --refresh-pbdb` → `build --no-relief` → 운영 반영을 한다. 받기 전의 PBDB 사본은
  백업에 남는다 — [docs/백업.md](백업.md)(koprifossillab 032)

## 3. 가공 — `pipeline/fossils.py` 등

### 3.1 산지 읽기 — 무엇을 빼나

| | 산지 | |
|---|---|---|
| 받은 행 | 278,399 | |
| 연대(`max_ma`·`min_ma`)가 없다 | 0 | 뺀다 |
| 현재 좌표(`lat`·`lng`)가 없다 | 0 | 뺀다 |
| **PBDB 고좌표가 없다** | **46,930** | 뺀다 — 좌표 계산(017)을 들인 뒤에도 지도에 오르는 산지 집합이 바뀌지 않게, 016 까지처럼 뺀다 |
| **쓰는 산지** | **231,469** | 그중 모호한 연대 33,245(14.4%) |

### 3.2 퇴적기원 — `pipeline/environments.py`

PBDB 의 `environment`(원 용어 그대로)를 **세 갈래 → 환경군 → 원 용어** 나무로 가른다: 해양기원(m)·육상기원(t)·미상(o). 해안·석호는
해양기원, 하구·만은 육상기원이다(연구자의 판단, 003). 환경군은 퇴적상 순서(해양은 해안→심해, 육상은 상류→하류)이고 색도 그 순서다.
나무에 없는 용어는 "목록에 없는 용어"(미상). 화석 파일에는 원 용어가 그대로 들어가 **나무를 고쳐도 화석을 다시 가공하지 않는다**
(목록만 다시 만든다).

### 3.3 모호한 연대 — `pipeline/intervals.py`

산지의 PBDB 시대 이름(`early_interval`·`late_interval`) 가운데 **하나라도 등급이 세·아세·기·대·이언·bin** 이면 모호하다
("Middle Cambrian", "Late Triassic") — `precise = 0`. 절 이하(age·subage·zone …)면 정해진 기록이다. **범위의 길이로 가르지 않는다** —
"Norian–Rhaetian" 처럼 절 이름 둘로 정해진 범위는 정해진 기록이다(016).

**제4기(2.58 Ma 이후) 안의 이름은 예외로 정해진 기록**이다 — Quaternary·Pleistocene·Early/Middle Pleistocene·Tarantian·Ionian(0.24.0,
tupandactyl 008). 제4기가 통째로 지도 시점의 창(±2.5 Myr)만 해서 자리가 흐려지지 않는다. 신생대의 다른 세는 그대로 모호하다.
경계는 층서표(`timescale.py`)에서 읽는다. 결과 모호한 이름 176 개가 `index.json` 의 `rules.vague_intervals` 로 뷰어에 간다.

### 3.4 시점에 나누기 — `common.WINDOW_MA`, `fossils.assign`

- 시점은 0~540 Ma, 5 Myr 간격 109 개(배경 PaleoDEM 의 나이). 산지는 **연대 범위 [min_ma, max_ma] 가 시점 ±2.5 Myr 창과 겹치면** 그
  시점에 오른다 — 범위가 긴 산지는 **걸친 모든 시점**에 오른다. 연대 범위의 **상한은 없다**(015)
- 중간값 하나로 시점을 고르지 않는다 — 층서 단계로 매긴 연대의 중간값이 몰려 빈 시점이 생겼다(001)
- 결과: 시점 파일 행 합 564,184(한 산지가 평균 2.4 시점), 가장 많은 시점은 5 Ma(18,568)

### 3.5 좌표 — `pipeline/reconstruct.py`

산지의 **현재 좌표를 그 시점의 나이로** PALEOMAP v19o 판 모델(PaleoCoastlines 압축본 안의 회전 파일·판 나눔 다각형 — 해안선·국경과 같은
모델, pygplates)로 돌린다(017). 범위가 긴 산지도 시점마다 그때 자리에 그려진다.

- 판 번호는 그 나이에 유효한 판 나눔 다각형 가운데 현재 좌표를 품은 것. 유효 기간 0–0 다각형은 뺀다
- 그 나이에 판이 없으면(모델에 그때 없던 지각) **PBDB 고좌표**(Scotese 2021 판, 산지 연대의 **중간값**)를 쓰고 `rotated = 0` —
  564,184 행 가운데 404(0.07%). 1° 안팎 어긋날 수 있어 팝업이 출처를 적는다
- 0 Ma 는 회전이 없어 현재 좌표 그대로

### 3.6 산출물

**`fossils/<나이>.json`** — `{"age", "window_ma", "fields", "rows"}`. 행 하나가 산지 하나, 칸:

| 칸 | 뜻 |
|---|---|
| `collection_no` | PBDB 산지 번호 — 팝업·찾기 결과를 잇는 열쇠 |
| `paleolng`·`paleolat` | 그 시점의 좌표(§3.5) |
| `env` | 퇴적기원 갈래 `m`·`t`·`o` |
| `n_occs` | 산출 건수 |
| `collection_name`·`formation` | 이름·지층 |
| `early_interval`·`late_interval` | PBDB 시대 이름 |
| `max_ma`·`min_ma` | 연대 범위 |
| `environment` | PBDB 원 용어 |
| `cc` | 오늘날 국가 코드 |
| `precise` | 1 = 정해진 연대, 0 = 모호한 연대(§3.3) |
| `rotated` | 1 = v19o 로 계산한 좌표, 0 = PBDB 고좌표(§3.5) |

**`index.json`** 에서 PBDB 에 닿는 것: `frames[].fossils`(`file`·`count`·`vague`·`pbdb_fallback`·`by_env`), `rules`(`window_ma`·`vague_types`·
`vague_intervals`), `pbdb`(`stats`·`receipt` — `/healthz` 의 `pbdb_retrieved_at`), `environments`(나무와 용어별 산지 수), `countries`(PBDB
코드 → 한·영 이름, 254 개).

## 4. 지도에 그리기 — `web/viewer/static/viewer/map.js`

### 4.1 불러오기

- 시점을 고르면 그 시점의 `fossils/<나이>.json` 하나를 받는다. 옆 시점(±1)의 파일은 미리 받아 두고, 새 파일이 올 때까지 옛 점을 둔다 —
  깜박이지 않게(021)
- **최근 5 Ma 는 절 단위 시점**(홀로세·플라이스토세 후기·지바·칼라브리아·젤라·피아첸차·장클레, 0.25.0 tupandactyl 009) — 가공물은 그대로
  5 Myr 간격이고, 뷰어가 0 Ma·5 Ma 파일을 합쳐 **그 절의 경계 안에 드는 산지만** 고른다. 좌표는 그 절이 쓰는 지도(2.5 Ma 보다 젊으면
  0 Ma, 아니면 5 Ma)의 것

### 4.2 거르기(`passes`)

- **퇴적 환경** — 나무의 체크(갈래·환경군·원 용어)
- **국가** — 산지의 `cc` 가 고른 나라인가("지금 그 나라 땅에서 나온 산지")
- **모호한 연대 보기** — 끄면 `precise = 0` 을 가린다
- **연대 범위 막대** — `max_ma − min_ma` 가 고른 값(1·2·3·5·8·10·15·20·30·50 Myr, 기본 제한 없음) 이하만(018). 등급(모호함)과 따로 본다 —
  등급은 "어떻게 매겼나", 길이는 "얼마나 불확실한가"

### 4.3 모양·색

- **원** = 정해진 연대, **속이 찬 세모** = 모호한 연대(016). 흰 테, 반투명(기본 60%)
- 색은 **퇴적기원**(환경군의 색) 또는 **시대(기)** — 시대는 **산지 연대의 중간값이 드는 기**라 범위가 긴 산지는 다른 기로 칠해질 수 있다
  (범례에 적는다, 0.23.1)
- 몰바이데는 같은 점을 투영만 바꿔 그리고, 지구본(Cesium)은 Leaflet 의 점을 그대로 옮겨 지형 높이 위에 앉힌다(wetherilli 015·017)

### 4.4 점을 누르면 — 산지 팝업

파일의 칸(연대·범위 길이·모호함, 지층, 환경, 그 시점의 좌표와 출처, 오늘날 국가) + **그 자리의 그때 기온**(기온 격자) + 브라우저가
PBDB 에 바로 묻는 **산출 목록** `occs/list.json?coll_id=<번호>&show=class`(최대 500) + PBDB 산지 페이지 링크.

### 4.5 분류군 찾기(브라우저 → PBDB)

| 묻는 것 | 무엇에 |
|---|---|
| `taxa/auto`(앞부분) + `taxa/list?match_name=%…%`(가운데) | 이름 후보 — 합쳐 산출 수로 줄 세운다 |
| `taxa/single` | 찾은 이름의 계급 — 과 이하면 커서만 대도 산출 목록(006), 속 이하면 "같은 시대 다른 산지"(012) |
| `occs/list?base_name=…&max_ma&min_ma&timerule=overlap&pgm=scotese&show=paleoloc,coll,class,env,loc` | 그 시점 창의 산출 → 산지로 묶어 그린다 |
| `occs/diversity?count=genera&time_reso=stage`(+ 5,000 건 이하면 `occs/list&show=env`) | 산출 시대 분포 칩·막대, 차례로 보기(010·011) |

- 찾은 산지가 **산지 파일에 있으면 그 파일의 좌표**(그 시점 나이로 계산한 것)로 옮긴다. 없으면 PBDB 고좌표 — 1° 안팎 어긋날 수 있다
- 모호함은 `rules.vague_intervals` 로 같은 규칙을 쓴다. 최근 절 시점은 PBDB 의 `overlap` 이 경계에 닿은 것도 주므로 절 안쪽만 남긴다
- 산출 수가 5,000 건 이하면 산출 기록 자체를 받아 **지도와 같은 규칙**(창과 겹침, 퇴적기원·연대 범위 거르기)으로 센다. 그보다 많으면
  PBDB 의 절 단위 수를 쓰고 거르기가 수에 반영되지 않는다고 적는다(014)
- 서버는 PBDB 를 부르지 않는다(CORS `*`). 사내망에서 막히면 GSM 처럼 서버에 중계 문을 둔다(CLAUDE.md)

## 5. 규칙이 사는 곳

| 규칙 | 한 곳 | 뷰어로 |
|---|---|---|
| 시점 창 ±2.5 Myr | `pipeline/common.py` `WINDOW_MA` | `index.json` `rules.window_ma` |
| 분석의 시점 몫·몬테카를로(koprifossillab 044) | `pipeline/common.py` `frame_share`·`ANALYSIS` | `rules.analysis`, 셈은 `analysis.js`(같은 보기로 시험) |
| 모호한 연대(등급·제4기 예외) | `pipeline/intervals.py` | `rules.vague_types`·`rules.vague_intervals` |
| 퇴적 환경 나무·색 | `pipeline/environments.py` | `index.json` `environments` |
| 층서표(이름 한글판 2023/04, 경계 ICS 2024/12) | `pipeline/timescale.py` | `index.json` `timescale` |
| 국가 이름 | `pipeline/countries.py` | `index.json` `countries` |
| 판 모델·좌표 | `pipeline/reconstruct.py`(v19o) | 산지 파일의 좌표 |
| 화면 문구(한·영) | `web/viewer/static/viewer/i18n.js` | — |

## 6. 알려진 한계

- **PBDB 고좌표가 없는 산지 46,930 곳은 지도에 없다** — 현재 좌표만 있으면 v19o 로 돌릴 수 있지만, 016 까지의 산지 집합을 지키려고 뺀다.
  넣으려면 이 규칙을 연구자와 다시 정한다
- 300 Ma 무렵 범위가 넓은 육상기원 산지는 계산 좌표가 PBDB 좌표보다 땅에 덜 든다(63.5% 대 79%, 017) — TODOs
- 찾기 결과 가운데 산지 파일에 없는 산지(파일에서 뺀 것 등)는 PBDB 고좌표라 조금 어긋날 수 있다
- 시점은 5 Myr 간격이라(최근 5 Ma 만 절 단위) 한 시점의 점은 ±2.5 Myr 동안의 산지를 한데 보인 것이다 — 한 순간의 지도가 아니다
- 층서표의 경계 나이(ICS 2024/12)와 PBDB 시대 이름의 나이는 판이 조금 다를 수 있다 — 칩·분포에서 절을 이을 때 가운데 나이로 잇는다
- 결과 잘림(찾기 20,000 건·팝업 500 건), 주간 갱신 점검의 자리, 분포의 timerule 은 [PBDB_받기_검토.md](PBDB_받기_검토.md) 에서 따진다
