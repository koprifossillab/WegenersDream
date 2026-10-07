# CLAUDE.md

**베게너의 꿈 (Wegener's Dream)** — 시대별 고지리 지도(PALEOMAP) 위에 PBDB 화석 산지를 올려 보는 2D 지도 뷰어.
문서는 한국어로 쓴다 — 커밋 메시지, devlog, 주석 모두.

연구소 서버(paleoserver, 172.16.116.98)에 **GSM 과 같은 갈래로** 얹는다 —
저장소·이미지·`/srv/WegenersDream`·nginx 서브경로(`/WegenersDream/`)가 따로다. phyloserver 의 앱이 아니다.

## 시작하기 전에 읽을 것

**[HANDOFF.md](HANDOFF.md) 부터** — 지금 무엇이 돌아가고, 어느 브랜치에 무엇이 기다리고, 어디에
함정이 있는지. 할 일은 [TODOs.md](TODOs.md), 판마다 무엇이 바뀌었는지는 [CHANGELOG.md](CHANGELOG.md),
**왜 그렇게 했는지는 `devlog/`** 다.

## 공통 규약 (kopri-devdocs guides)

형제 저장소들이 같은 사고를 겪고 도달한 규약은 `.guides/` 에 있다 — 지도 뷰어 갈래(상류마다 문 하나·키는 브라우저로 안 나간다·캐시 순위·이용 조건과 연구실 내부용·정적 공개판)는 `.guides/web/map-viewers.md`, 배포·데이터 안전·운영(옛 이미지 정리 포함)은 `.guides/web/README.md`, 브랜치·판 세션·병렬 Claude 세션·devlog 는 `.guides/workflow.md`.
**없으면 kopri-devdocs 클론이 안 걸린 것이다** — `../kopri-devdocs` 를 형제로 두고 `ln -s ../kopri-devdocs/guides .guides`. 이 저장소에는 커밋하지 않는다(kopri-devdocs 는 private, `.gitignore` 에 있다).

## 이름

이름은 **Wegener's Dream**, 한국어 **베게너의 꿈**(대륙이동설의 알프레트 베게너 — 그가 그리던 움직이는 대륙
위의 생물 기록). 화면 머리말과 제목은 **영문을 앞에 굵게**, 한국어를 옆에 작게 둔다(연구자). 2026-09-30 에 첫 이름 `MIH` 에서 바꿨다(020). 옛 devlog·CHANGELOG 의 MIH 는 기록이라 그대로 둔다.

| 자리 | 이름 |
|---|---|
| 저장소·URL(`/WegenersDream/`)·`/srv/WegenersDream` | `WegenersDream` |
| 환경변수 | `WEGENER_*` |
| 소문자를 강제하는 자리 — 파이썬 패키지, Docker 이미지·compose 이름 | `wegenerweb`, `koprifossillab/wegenersdream`, `wegenersdream` |

작업 장비의 폴더(`D:\Claude\MIH`)와 09-29 백업 폴더(`D:\Claude\MIH-backup`)는 옛 이름 그대로다.

## 판 모델을 하나로

**배경·해안선·화석 좌표는 모두 PALEOMAP 틀이어야 한다.** 이것이 이 뷰어의 첫 규칙이다.

- PBDB 는 언제나 `pgm=scotese` 로 묻는다. 파이프라인도, 화면의 분류군 찾기도
- PaleoCoastlines 는 이미 복원 좌표라 회전하지 않는다
- 다른 판 모델(Merdith, Müller 등)의 자료를 더할 때는 그 모델로 화석을 다시 옮겨야
  한다. 섞지 않는다

## 화석을 시점에 나누는 규칙

값은 `pipeline/common.py` 한 곳이 정하고, 뷰어(분류군 찾기)는 `index.json` 의 `rules` 로 받는다
(0.7.0 부터 — 그 전에는 map.js 에 따로 적혀 있었다). **map.js 에 숫자를 다시 적지 않는다.**

- 연대 범위(min_ma~max_ma)가 시점 ±2.5 Myr 창과 **겹친다** (`WINDOW_MA`). 한 산지가 걸친 모든 시점에 오른다.
  연대 범위의 **상한은 없다**(0.9.0 — 그 전의 `MAX_SPAN_MA` 는 지웠다, devlog 013·015)
- **모호한 연대**: 산지의 PBDB 시대 이름(`early_interval`·`late_interval`) 가운데 하나라도 등급이
  세·기·대 …(`epoch, subepoch, period, era, eon, bin`)이면 모호하다 — "Middle Cambrian", "Late Triassic".
  규칙은 `pipeline/intervals.py` 한 곳이고 등급은 PBDB `intervals/list`(`data/sources/pbdb/intervals.json`).
  **범위의 길이로 가르지 않는다** — "Norian–Rhaetian" 처럼 절 이름 둘로 정해진 범위는 정해진 기록이다
  (연구자, devlog 016). 뷰어는 속이 찬 **세모**로 그리고(고리는 안 보였다), `rules.vague_intervals` 로 PBDB 에
  바로 물은 결과도 같은 규칙으로 가른다. **제4기(2.58 Ma 이후) 안의 이름은 예외로 정해진 기록**이다 — "Pleistocene",
  "Early Pleistocene" 은 지도 시점의 창과 길이가 비슷하다(연구자, tupandactyl 008). 신생대의 다른 세는 그대로 모호하다
- **좌표는 시점마다 계산한다**: 산지의 지금 좌표를 지도 나이로 PALEOMAP v19o(해안선·국경과 같은 모델)로
  돌린다(`pipeline/reconstruct.py`, devlog 017). 그 나이에 판이 없을 때만 PBDB 고좌표(연대 중간값)이고
  `rotated = 0`. 분류군 찾기 결과는 같은 산지이면 산지 파일의 좌표로 옮긴다. PBDB 가 고좌표를 못 준 산지는 뺀다 —
  **에디아카라기 시점(550 Ma)만 예외**로, 판으로 돌릴 수 있으면 올린다(에디아카라기는 PBDB PALEOMAP 고좌표가 거의 없다, tupandactyl 019)
- **에디아카라기 시점은 판 복원만**이다(`common.EDIACARAN_AGE`, `pipeline/ediacaran.py`) — 배경은 오늘날 육지를 그때 자리로 돌린 것,
  해안선·기온·지형은 없고 가까운 시점의 것을 끌어오지 않는다
- **중간값 규칙으로 돌아가지 않는다** — 층서 단계로 매긴 연대의 중간값이 몰려 빈 시점이 생긴다(devlog 001)
- 퇴적기원(해양·육상·미상)은 `pipeline/environments.py` 가 정한다. 해안·석호는 해양기원, 하구·만은
  육상기원이다(연구자의 판단, devlog 003) — 첫 판의 "어느 쪽으로도 밀지 않는다" 는 버렸다

## 화면 문구 — `i18n.js` 한 곳

한국어·영어 두 판이다(027). **화면에 보이는 문구를 새로 쓸 때는 `viewer/static/viewer/i18n.js` 에 한·영 쌍으로
적고 map.js 에서는 `tr(key)` 로 꺼낸다.** 템플릿 문구는 템플릿이 한국어 원문이고 영어만 `DOM_EN` 에 둔다
(`data-i18n` 표시). 자료의 이름(층서·환경·국가)은 index.json 의 `en` 칸이다 — map.js 에 영어 이름을 적지 않는다.

**Casual 모드의 한글**(tupandactyl 020) — 속·종 학명의 음차는 `viewer/static/viewer/translit.js` 한 곳(연구자의 표기 규칙, 예시는
`web/viewer/jstest` 의 시험), 암상의 한글은 `pipeline/lithology.py` → index.json. 한글로 찾기는 PBDB 속·종 이름을 **파이프라인이 node 로
translit.js 를 불러** 미리 음차한 표(`pipeline/taxa_ko.py` → `taxa_ko/<첫 글자>.json`, tupandactyl 021) — 규칙을 파이썬에 다시 적지 않는다.
Scientific·영어판에는 쓰지 않는다.

## 층서표와 퇴적 환경 — 한 곳에만 적는다

- 층서표는 `pipeline/timescale.py`. **이름은 한글판 v2023/04, 경계 나이는 ICS v2024/12**
  (연구자가 정한 것 — devlog 002). 판을 올릴 때 경계는 2024 이후 판과, 이름은 한글판과 대조한다
- 퇴적 환경 나무는 `pipeline/environments.py`. 원 용어의 한글은 이 저장소의 풀이다
- 지구사 사건(대멸종·전 지구 사건)은 `pipeline/events.py`(tupandactyl P01·016). 경계와 겹치는 나이는 timescale.py 에서 받는다.
  이름은 모두 영어로만, 풀이 없이 이름·나이·근거만 — 중규모 사건은 공식 번역이 없고 음차도 곤란하다(연구자, tupandactyl 017)
- 셋 다 index.json 으로 뷰어에 간다. **map.js 에 층서 이름·경계·환경 목록·사건을 다시 적지 않는다**
- 환경 이름을 화면에서 고치는 기능은 0.18.0 에서 껐다(tupandactyl 002) — 뷰어는 `<STATE_DIR>/labels.json`
  (`viewer/labels.py`)이 있으면 읽어서 입히기만 한다. 그것은 덮어쓰기이고 environments.py 의 기본 이름은 그대로다. **덮어쓰기를 기본 이름으로 옮길 때는
  labels.json 을 보고 environments.py 를 고친 뒤 그 칸을 labels.json 에서 지운다** — 둘 다 두면
  기본 이름을 고쳐도 화면에 안 보인다

## 자료의 흐름

```
sources/*.json ──fetch──▶ data/sources/ ──build──▶ data/derived/ ──▶ 뷰어(/data/…)
 (주소·SHA-256)            (원본, 커밋 안 함)       (가공물, 커밋 안 함)
```

- Zenodo 압축본(PaleoDEM·PaleoCoastlines·기온)은 매니페스트의 SHA-256 과 맞아야만 쓴다
- PBDB 는 계속 자라서 고정하지 않고, 받은 날의 값을 `data/sources/pbdb/receipt.json` 에 남긴다
- 뷰어는 파이프라인을 import 하지 않는다. 웹 이미지에 numpy 등이 들어가지 않게 하려는 것이다
- 뷰어가 내주는 것은 `.json`·`.webp`·`.png` 뿐이다(`views.SERVED`)

## PBDB 에 바로 묻는 것

브라우저가 PBDB API 를 곧장 부른다(CORS `*`). 여럿이다 — 채집지 산출 목록(`occs/list?coll_id`), 채집지 암상(`colls/single?show=lith`),
분류군 찾기(`occs/list?base_name`, 언제나 `pgm=scotese`), 찾기의 종합 보기(`colls/list?base_name|cc` — 오늘날 좌표라 판 모델과 상관없다),
이름 후보(`taxa/auto`·`taxa/list?match_name` — 같은 이름의 분류군은 번호 `base_id` 로, tupandactyl 026), 찾은 이름의 계급(`taxa/single`),
지층 후보(`strata/auto`, 거르기는 `formation=`, tupandactyl 028), 분포 분석(`occs/diversity`, tupandactyl 024). 서버는 PBDB 를 부르지 않는다. 사내망에서 PBDB 가 막히는 일이
생기면 그때 GSM 처럼 서버에 문(`viewer/pbdb.py`) 하나를 두고 중계한다.

## 커밋과 PR

**각자 자기 Linux 계정에서, 자기 GitHub 계정으로 작업한다**(대응표는 "devlog" 절). 저장소에 git 이름을 따로 두지 않는다.

**코드 작업은 기능마다 `feature/<기능 이름>` 브랜치에서 한다** — 기능 이름은 영어 kebab-case
(`feature/mollweide-drag`). **코드에 손대기 직전에** `main` 에서 만들고(`git switch -c feature/<이름> main`),
**커밋·push·확인을 전부 그 브랜치에서** 한다. **작업이 끝나면 PR 을 만든다**(`gh pr create --base main`) — CI 를
통과해야 하고, **`main` 병합은 사람이 정한다.** 판을 올리는 것은 그 PR 안에서 한다(CHANGELOG·`version.py`).
**병합 직전에 `deploy/host/premerge.sh <PR 번호>` 를 돌린다**(wetherilli 010) — 글자 충돌, main 보다 뒤처졌는지,
판 확인(`deploy/check_version.py`: 판과 CHANGELOG 맨 위가 같은가, main 보다 낮거나 같은 판 번호를 다른 내용으로 썼는가,
태그가 이미 있는가), CI 를 본다. 하나라도 FAIL 이면 병합하지 않고 브랜치를 `git rebase origin/main` 해 판을 다시 매긴다.
판 확인은 CI 의 "판 확인" 작업으로도 돈다. 병합하고 판이 올랐으면 CHANGELOG 의 그 절로 GitHub 릴리스(`v<판>`)를 만든다 — 태그마다 CI 가 Docker Hub 에 이미지를
올린다(koprifossillab 031). 2026-09-30 전에는 하루치 브랜치(`work/<YYYYMMDD>-<계정>`)였다.

**문서·기록만 고치는 커밋은 `main` 에 바로 올린다**(HANDOFF·TODOs·CLAUDE.md 같은 것).
브랜치는 부딪힐 수 있는 것을 격리하려고 있는 것이다. 애매하면 묻는다.

**한 단계가 끝날 때마다 커밋하고 push 한다** — 기능 여럿을 한 커밋에 몰지 않는다. 단계마다
devlog 하나, 판 번호는 몇 단계를 묶어 따로 적는다("0.5.0 을 적는다 (004~006)").

메시지는 **한국어 평서문으로 무엇을 했는지**를 쓰고 devlog 를 붙인다 — 028 까지는 번호만(`(005)`), 그 뒤로는
글쓴이와 번호(`(koprifossillab 029)`, "devlog" 절):

```
국가를 고르면 그 나라 범위로 지도를 당기고, "이 나라로 다시 가기" 를 단다 (005)
Scotese 2021 지표 기온 지도를 받아 시점마다 기온 격자 PNG 로 굽는다 (004)
```

0.4.0 까지는 conventional commits(`feat:`)였다. 그 뒤로는 위의 꼴이다.

**`git add` 는 내가 고친 파일만 지정한다** — `git add -A`·`git add .`·`git commit -a` 는 쓰지
않는다. `git commit -F <메시지 파일> -- <파일…>`. 커밋 전에 `git status --short` 를 보고, 내가 손대지
않은 파일은 그대로 둔다. 작업 전에 `git pull --rebase`.

## devlog

**그때의 판단과 근거를 남기는 곳이다.** 실제로 한 작업은 `devlog/YYYYMMDD_{author}_{nnn}_{title}.md`, 계획은
`YYYYMMDD_{author}_P{nn}_{title}.md` 로 **단계마다 끊어** 적는다. 머리줄 아래에
`날짜 · \`브랜치\`` 를 적고, 절에 번호를 붙인다. **무엇을 했는지보다 왜 그렇게 했고 무엇을
버렸는지**를 쓴다. 무엇을 했는지는 `git log` 가 안다.

**파일 이름은 글쓴이마다 번호를 센다**(2026-09-30 부터, EarthThruTime3D 와 같은 꼴). `author` 는 **작업하는 Linux
계정의 GitHub 계정 이름** 소문자다 — paleoadmin → `koprifossillab`, jikhanjung → `jikhanjung`, sclee → `wetherilli`,
jschoi → `tupandactyl`(`whoami` 로 본다). `title` 은 영어 snake_case. 번호는 **그 글쓴이의** 다음 번호다 —
koprifossillab 은 001~028 에 이어 029 부터, 다른 사람은 001 부터. **001~020 은 옛 이름(`YYYYMMDD_NNN_주제.md`)
그대로** 두고 번호만으로 가리킨다("devlog 017"). 새 꼴은 링크나 "koprifossillab 029" 로 가리킨다.
**새 파일은 [devlog/README.md](devlog/README.md) 색인에 한 줄 더한다.**

**계획이 아닌 검토는 `docs/`** 에 둔다 — "이렇게 하겠다" 가 정해진 것은 devlog 의 P 문서이고, "할까 말까·
언제 하나" 를 따진 것(예: `docs/DB_전환_검토.md`)은 `docs/` 다. 검토가 계획으로 정해지면 그때 P 문서를 쓴다.
**지금 어떻게 돌아가는지 설명하는 운영 문서도 `docs/`**(예: `docs/백업.md`) — devlog 가 그때의 판단이라면 이것은 늘 지금에 맞춘다.

**HANDOFF.md 는 지금만 말한다** — 지난 일은 devlog 의 몫이고, HANDOFF 는 근거가 필요한 자리마다
devlog 번호를 건다. **TODOs.md 에는 끝난 일을 쌓지 않는다.**
