# HANDOFF — 2026-09-30 현재 상태 · 베게너의 꿈 (Wegener's Dream)

이어서 작업할 사람(또는 다음 세션)을 위한 인수 문서. **무엇이 돌아가고 있고, 무엇이 반쯤 되어 있고,
어디에 함정이 있는지**를 적는다. **지난 일은 여기 안 남긴다** — 그것은 `devlog/` 의 몫이고, 여기는
**지금**만 말한다.

**이름**: 09-30 에 `MIH` → **베게너의 꿈 (Wegener's Dream)**. 저장소·URL `/WegenersDream/`, 환경변수 `WEGENER_*`,
패키지 `wegenerweb` (020, CLAUDE.md "이름"). **로컬 실행·시험의 `MIH_*` 환경변수는 이제 안 먹는다.**

**저장소** https://github.com/koprifossillab/WegenersDream (09-30 에 `MIH` 에서 바꿈 — 옛 주소는 GitHub 가 넘겨 준다).
**브랜치** `main` = `1.2.0` (10-06, PR #1~#48) · 병합을 기다리는 브랜치는 없다. 0.11.1 부터 GitHub PR 로 병합하고,
판을 올리면 CHANGELOG 로 GitHub 릴리스를 만든다(v0.11.2 부터).
다음 코드 작업은 각자 자기 계정에서 `feature/<기능 이름>` 브랜치를 `main` 에서 만들고, 끝나면 PR 을 만든다
(CLAUDE.md "커밋과 PR"). **병합 직전에 `deploy/host/premerge.sh <PR>`**(충돌·뒤처짐·판·CI, wetherilli 010).

**옛 가공물이면 다시 만든다** — 화석 파일에 `precise`·`rotated` 칸(016·017)이, `index.json` 의 `relief_files` 에
몰바이데 `moll-*`(024)가 있어야 한다. `python -m pipeline fetch`(PBDB 시대 이름 목록 `intervals.json` 이 든다) 다음
`build`(배경 포함, 7 분 남짓). 몰바이데 배경이 없으면 투영 고르기가 숨는다.

**배포**: paleoserver — **http://paleolab/WegenersDream/**(`172.16.116.98`) = `v1.2.0`(Docker Hub 이미지). 컨테이너 `wegenersdream-web-1`
**10-05 주간 갱신**은 운영 옮기기에서 멈췄다가(폴더 시각, 1.1.2 에서 고침) 10-06 에 손으로 마무리했다 — 운영·바깥 사이트 모두 PBDB 10-04,
`/healthz` ok(koprifossillab 037). 다음 정기 실행은 10-12(월).

**연구소 밖**: **https://koprifossillab.github.io/WegenersDream/** — 같은 뷰어의 고정 사본(GitHub Pages, tupandactyl 029). `deploy/static_site.py` 로
굽고 `.github/workflows/pages.yml` 이 올린다. 자료는 릴리스 `site-data` 의 `wegener-data.tar.gz`(주간 갱신이 덮어쓴다). Pages(Source "GitHub Actions")는
10-02 에 켰고 v1.2.0 이 올라가 있다. 배포 환경 `github-pages` 는 `main` 브랜치와 `v*` 태그에서만 올릴 수 있다 — 릴리스로 도는
작업은 태그 위라, 태그 규칙이 없으면 배포 단계가 막힌다(10-02 v1.1.0 에서 한 번 막혀 더했다). 손으로 다시 올리려면 `gh workflow run pages.yml`.
(`127.0.0.1:8095`), nginx `snippets/WegenersDream-subpath.conf`, paleolab 첫 화면 카드. 운영 compose·`.env` 는
`/srv/WegenersDream/`, 자료는 `/srv/WegenersDream/data`(읽기 전용), 명칭 덮어쓰기·비밀키는 `/srv/WegenersDream/state`.
운영 `.env` 에 `WEGENER_EDITOR_KEY` 가 남아 있어 `/labels` POST 가 열쇠로 열린다 — 화면의 명칭 고치기는 0.18.0 에서 껐다(tupandactyl 002).
완전히 닫으려면 그 열쇠를 지운다. 비밀키는 비워 두어 `state/secret_key` 를 쓴다.
배포 순서(이미지 → 가공물은 `index.json` 을 맨 나중에 → `up -d` → `smoke.sh`)는 README "운영". 릴리스 태그(`v*`)마다
CI 가 `koprifossillab/wegenersdream:<태그>` 를 Docker Hub 에 올린다(v0.15.3 부터, koprifossillab 031) — v0.16.0 부터 운영은
`docker compose pull` 로 그 이미지를 받는다. 이 서버의 `paleoadmin` 그룹 계정(sclee 등)도 docker·운영 `.env` 를 쓸 수 있다.

**가공**: paleoserver `paleoadmin` 의 `~/projects/WegenersDream/.venv`(pygplates 포함)로 한다. 원본 `data/sources/`(3.2 GB)와
가공물 `data/derived/`(216 MB, 지형 포함)가 그 저장소 폴더에 있다.

**최근의 절 기온(PaleoClim, 0.26.0)**: `climate/pc_*.png`·`climate/recent.json`. 원본은 PaleoDEM 처럼 SHA-256 으로 고정돼 있어
`fetch` 가 받고 `build` 가 굽는다 — `--no-relief`(주간 갱신)면 있는 것을 그대로 둔다(koprifossillab 033). 주간 점검도 본다. paleoadmin
가공 폴더의 것과 운영 폴더의 것(jschoi 가 먼저 구운 것)이 바이트까지 같다. 읽으려면 `tifffile`·`imagecodecs`(요구 목록에 있다).
조건은 **CC BY-NC-SA 4.0**(README 라이선스 표, tupandactyl 010).

**매주 월요일 02:30**(paleoadmin crontab, `deploy/host/crontab.WegenersDream`): `deploy/host/weekly_refresh.sh` 가 운영 자료·PBDB
원본·state(비밀키 빼고)를 `/data/WegenersDream/backups/WegenersDream.<YYYYMMDD>.tar.gz`(640, 주 140 MB 남짓)와 NAS
`/nfs/temp-share/WegenersDream/backup/` 에 같은 파일로 백업하고, PBDB 를 새로
받아 `build --no-relief` 로 산지를 다시 가공해 운영에 옮긴다. 실패·산지 급감이면 운영은 지난 자료 그대로. **paleoadmin 의
이 저장소 폴더가 `main` 이고 깨끗해야 가공한다** — feature 브랜치에 두고 월요일 새벽을 넘기면 백업만 하고 `fail` 이다.
결과는 `/data/WegenersDream/logs/last_refresh.json` 과 `/srv/WegenersDream/state/refresh.json`(koprifossillab 032) — **`/healthz` 가
그것을 읽어 실패·NAS 실패·8 일 넘은 침묵이면 `degraded`**(0.26.1, koprifossillab 034). 같은 날 다시 돌려도 백업을 덮어쓰지 않는다(`.2` …).
백업의 모든 것(되살리기 포함)은 [docs/백업.md](docs/백업.md).

**git 밖의 백업**: 매주 `/data/WegenersDream/backups/`·NAS([docs/백업.md](docs/백업.md)). 첫 판을 만든 개인 PC(Windows)의
`D:\Claude\MIH-backup\20260929\`(09-29 PBDB 사본 등)는 그 PC 를 더 쓰지 않아 옮기지 않기로 했다(09-30).

**PBDB 자료가 어떻게 받아지고 가공되어 지도에 그려지는지**(빼는 산지·모호한 연대·시점 창·좌표·뷰어의 거르기·분류군 찾기)는
[docs/PBDB_자료_처리.md](docs/PBDB_자료_처리.md).

## 1. 한 줄 요약

PALEOMAP 고지리(PaleoDEM 배경·PaleoCoastlines 해안선) 위에 PBDB 채집지를 시점(0~540 Ma, 109 장)마다
올리는 2D 뷰어. 층서표(한글판 2023/04 이름·ICS 2024/12 경계)로 시점을 고르고, 퇴적기원·국가·분류군으로
거르고, 지표 기온(Scotese 2021)과 지금 국경을 그때 자리로 돌린 선을 겹친다. 투영은 정거원통·몰바이데(돌려 보기)·3D 지구본,
화면은 한국어·영어.

## 2. 지금 돌아가는 것

### 뷰어 — Django 5.2, DB 없음 (`web/`)

- 화면 하나(`/`), 가공물 내주기(`/data/…` — `.json`·`.webp`·`.png` 만), 상태(`/healthz`),
  명칭 덮어쓰기(`/labels` GET·POST, 003·0.3.0 — 화면에서 고치는 UI 는 0.18.0 에서 지웠고 GET 으로 읽어 입히기만 한다)
- 지도는 Leaflet 1.9.4(저장소에 담음). 투영은 정거원통(EPSG:4326)·몰바이데(직접 짠 좌표계, 024) — 몰바이데는
  끌어서 가운데 경선을 돌린다(025, 지구 밖을 끌면 옮기기 029). 배경은 2048·4096 두 벌을 확대 정도로 고른다(002)
- **지구본**(wetherilli P01·015) — CesiumJS 1.145.0(저장소에 담음, 14 MB, 처음 고를 때만 싣는다)·`globe.js`. 자료를 따로
  거르지 않고 **숨은 Leaflet 층(정거원통)을 비춘다** — 거르기·색을 고칠 때는 map.js 만 고치면 지구본도 따라온다. 거리 재기·
  축척 막대·커서 기온은 지구본에서 쉰다
- **지구본 지형**(wetherilli 016·017, 0.21.0) — 가공물의 `terrain/<나이>.webp`(1/4° 높이 격자)를 브라우저가 풀어 Cesium 지형을
  세운다. 높이 과장 밀대(처음 ×15). 운영 가공물에도 지형이 있다 — 09-30
  paleoadmin 이 `python -m pipeline terrain`(4 분 20 초, 109 시점, 27 MB)으로 굽어 `/srv/WegenersDream/data` 에 옮겼다.
  `index.json` 은 `terrain` 칸 말고는 그대로다. 배경·화석을 다시 가공할 때는 `build` 가 지형도 함께 굽는다
- 한국어·영어(027) — 문구는 `viewer/static/viewer/i18n.js`, 자료의 이름은 index.json 의 `en`. 패널은 절마다 접히고
  좁은 창에서는 통째로 접힌다(026)
- 화면 배치(wetherilli 001~014, tupandactyl 002·003): 머리말 밑 한 줄에 창 폭을 채운 시점 막대(기·세 띠에 영어 이름, 좁으면
  규칙으로 만든 약자)와 "차례로 보기". 패널은 오른쪽 하나 — 층서표 칩 · 화석 산지(퇴적 환경은 처음에
  퇴적기원 셋만) · 분류군 찾기(찾은 뒤에만) · 겹쳐 보기. 화면 문구는 "점" 이 아니라 "포인트". 머리말 오른쪽에 투영 붙은 단추와 ⚙ 설정 · 자료 창(언어·읽는 법·출처·판).
  지도 왼쪽 위에 전 지구 평균 기온 온도계, 오른쪽 위에 도구 묶음(확대·축소 | 전체·거리·링크·다운로드 | 지우기), 오른쪽 아래에 두꺼운
  축척 막대, 지도 위에 끌어 옮기는 "분류군 또는 국가" 찾기 카드와 고른 것의 딱지. 휠·키로도 확대·축소한다.
  첫 배경이 올 때까지 대기 화면
- 주소 `#age=…&proj=moll&lon=…&lang=en` 이 시점·투영·가운데 경선·언어를 담는다. 옮기기·확대는 담지 않는다(030).
  지구본은 `proj=globe&lon=…&lat=…&alt=…`(km)로 카메라 자리를 담는다(015)
- 브라우저가 PBDB 를 곧장 부른다(CORS). 무엇을 부르는지는 CLAUDE.md "PBDB 에 바로 묻는 것"
- 개발: `WEGENER_DEBUG=1` 로 `web/manage.py runserver`

### 파이프라인 (`pipeline/`, `python -m pipeline fetch|build|all`)

| 단계 | 자료 | 가공물 (`data/derived/`) |
|---|---|---|
| 배경 | PaleoDEM 6 분 격자(Zenodo 5460860) | `relief/{2048,4096}/*.webp` 와 몰바이데 `relief/moll-{2048,4096}/` — 7 분 남짓 |
| 지형 | 같은 PaleoDEM 격자 | `terrain/*.webp`(1/4°, 무손실, 27 MB) — 5 분 남짓, `pipeline terrain` 으로 따로도 (016) |
| 해안선 | PaleoCoastlines v7.1(Zenodo 4297693) | `coastlines/*.json` |
| 화석 | PBDB 채집지 전체(`pgm=scotese`, `show=loc,…`) | `fossils/*.json` (국가 코드 포함) |
| 국경 | Natural Earth 50m + PaleoCoastlines 안의 PALEOMAP 모델, pygplates | `countries/*.json` (41 MB) |
| 고기후 | Scotese 2021 지표 기온(Zenodo 8238875) | `climate/*.png` (회색조, 0.7 MB) |
| 목록 | 층서표·환경 나무·국가 목록·출처·지구사 사건(`events.py`)·암상 한글(`lithology.py`) | `index.json` |
| 에디아카라기 | 오늘날 육지를 PALEOMAP v19o 로 550 Ma 자리까지(판 복원만) | `relief/*/5500.webp` 등 — `pipeline ediacaran` (tupandactyl 019) |
| 한글 찾기 | PBDB 속·종 이름표(`taxa.csv`)를 node 로 translit.js 에 태워 | `taxa_ko/<첫 글자>.json`(558 파일, 18 MB) — `pipeline taxa_ko` (021) |

**주간 갱신** — 가공 전에 paleoadmin 클론의 main 을 앞으로만 당긴다(tupandactyl 025). **다만 그 당기기 코드 자체가 클론에 아직 없다** —
10-01 기준 클론은 `f776c9e`(0.31.0)라 옛 스크립트가 돈다: 당기지 않고, 점검이 시점 `== 109` 를 요구해 에디아카라기(110) 때문에 **멈춘다**
(운영은 지난 자료로 돌지만 PBDB 가 갱신되지 않는다). **다음 월요일 전에 paleoadmin 으로 한 번 `git pull`** — 그 뒤로는 스스로 당긴다.
사건·에디아카라기·암상 한글·한글 찾기 표는 build 가 모두 다시 만든다(한글 찾기 표는 node, 이름표 `taxa.csv` 는 `fetch --refresh-pbdb`).
갱신은 운영에 옮긴 뒤 바깥 사이트의 자료도 올린다 — paleoadmin 의 gh 가 로그인돼 있을 때만.

`build --no-relief` 는 배경을 다시 그리지 않는다(30 초 남짓). 원본은 `data/sources/`, 매니페스트는 `sources/*.json`.
Zenodo 것은 SHA-256 으로 고정, PBDB·Natural Earth 는 받은 날의 값을 `receipt.json` 에 남긴다.

**지금 가공물(paleoserver·운영)은 2026-09-30 08:04 UTC 에 받은 PBDB(채집지 278,399)로 만든 것이다** — 매주 월요일 02:30(KST)
cron 이 새로 받는다(koprifossillab 032). 언제 받은 것인지는 `/healthz` 의 `pbdb_retrieved_at`.

### 시험

`python -m unittest discover -s pipeline/tests -t .`(26 — 판 모델 시험 3 개는 원본이 있을 때만) · `WEGENER_SECRET_KEY=x web/manage.py test viewer`(16 — i18n 열쇠 시험 3 포함, wetherilli 007).
CI(`.github/workflows/test.yml`)가 둘 다 돌리고, PR 에서는 "판 확인"(`deploy/check_version.py`)도 돌리고, `v*` 태그를 밀면 이미지를 굽고 Docker Hub 에 올린다.

## 3. 지금 조심할 것

### 3.1 화석 좌표와 국경·배경은 판본이 조금 다르다

0.9.0 부터 화석 좌표·국경·해안선은 PaleoCoastlines 안의 같은 v19o 판 모델이다(017). 다만 그 나이에 판이 없는
404 건(0.07%)과 **분류군 찾기에서 산지 파일에 없는 산지**는 PBDB 고좌표(Scotese 2021 판, 연대 중간값)라 1° 안팎
어긋날 수 있다 — 팝업에 출처가 적힌다. 배경은 2018 PaleoDEM 이다. **다른 판 모델(Merdith 등)의 자료를
섞지 않는다** — CLAUDE.md "판 모델을 하나로".

### 3.2 명칭 덮어쓰기와 기본 이름

환경 이름의 기본은 `pipeline/environments.py`, 화면에서 고친 것은 `<STATE_DIR>/labels.json` 의 덮어쓰기다.
0.4.0 에서 연구자가 고친 이름을 기본으로 옮기고 표를 비웠다(003). 옮기기 전 표는
`data/state/labels.before-0.4.json`(로컬, 커밋 안 함). 운영 `state/` 에는 `labels.json` 이 없다(09-30 확인). 화면에서 고치는
UI 는 0.18.0 에서 지웠다 — 이름을 바꿀 일이 생기면 environments.py 를 고치고 가공물을 다시 만든다.

### 3.3 개발 서버의 템플릿 캐시

`runserver --noreload` 로 띄우면 템플릿을 고쳐도 안 바뀐다. 자동 재시작으로 띄운다. 정적 파일 주소에는
`?v=<판>` 이 붙어, 판을 올리지 않으면 브라우저가 옛 map.js 를 쓸 수 있다.

### 3.4 Windows 작업 장비에서의 git

Windows 에서 작업할 때(첫 판을 만든 장비). `.gitattributes` 가 셸·Dockerfile 을 LF 로 두고, 로컬은 `core.eol=lf` 다.
셸 스크립트는 실행 비트(`git update-index --chmod=+x`)를 붙여 커밋했다. PowerShell 에서 파일을
`Get-Content`/`Set-Content` 로 고치면 한글이 깨진다(한 번 깨뜨렸다) — 편집기로 고친다.

### 3.5 git·GitHub 계정은 Linux 계정마다 제 것을 쓴다

저장소에 `user.name`·`user.email` 을 따로 두지 않는다 — 각 Linux 계정이 자기 GitHub 계정으로 커밋·push 한다.
대응표(devlog 글쓴이도 이것)는 CLAUDE.md "devlog". jschoi(Tupandactyl)도 저장소에 push 할 수 있다(09-30 확인).

### 3.6 paleoserver 에서 화면을 시험할 때

playwright 의 헤드리스 크롬은 사내 TLS 검사 장비의 인증서(KOPRI 루트)를 믿지 않아 PBDB 호출(분류군 찾기·산출 목록)이
실패한다. `--ignore-certificate-errors-spki-list=<KOPRI 루트 공개키 해시>` 로 띄운다 — 해시는
`openssl x509 -in /usr/local/share/ca-certificates/kopri_ssl_root.crt -pubkey -noout | openssl pkey -pubin -outform der
| openssl dgst -sha256 -binary | base64`. 서버의 gh·git·pip 는 운영체제 인증서 저장소를 써서 문제없다.

## 4. 어디까지 왔나

| 판 | 무엇 | devlog |
|---|---|---|
| 0.1.0 | 첫 판 — 배경·해안선·채집지, 분류군 찾기 | 001 |
| 0.2.x | 층서표로 고르기, 퇴적 환경 나무, 자동완성, 0.1° 배경 | 002 |
| 0.3.0 | 환경 이름 화면에서 고치기, 원 용어 반투명 | (CHANGELOG) |
| 0.4.0 | 퇴적기원 재분류, 점 색(퇴적기원/시대), 찾기 결과만, 국가·국경선 | 003 |
| 0.5.0 | 고기후, 점 반투명, 국가 확대, 과 이하 커서 목록 | 004~006 |
| 0.5.x | 해양기원 점 색 — 에메랄드(0.5.1) → 아쿠아·청록(0.5.2) | 007·008 |
| 0.6.0 | 기온 층 불투명도, 분류군 산출 시대 분포, 산출 시대 차례로 보기 | 009~011 |
| 0.7.0 | 같은 시대 다른 산지(속 이하), 노릭절 채집지 누락·가공 캐시 고침 | 012·013 |
| 0.8.0 | "산지" 로 이름 바꿈, 퇴적기원별 산출 건수, 넓은 연대 고리(015 — 0.9.0 에서 바로잡음) | 014·015 |
| 0.9.0 | 모호한 연대(PBDB 시대 이름 등급) 세모, 화석 좌표 시점별 v19o 계산 | 016·017 |
| 0.10.x | 연대 범위 막대, 점 테두리 흰색 | 018·019 |
| 0.11.x | 이름 Wegener's Dream, paleoserver 배포, 깜박임 고침·CI, 머리말 판 번호 | 020~023 |
| 0.12.0 | 몰바이데 투영(배경은 파이프라인이 굽는다) | 024 |
| 0.13.0 | 몰바이데에서 끌면 가운데 경선이 돈다(배경은 행마다 옮겨 그린다) | 025 |
| 0.14.0 | 패널의 절 접기, 좁은 창에서 패널 통째로 접기 | 026 |
| 0.15.x | 영어판(문구는 `i18n.js`), 몰바이데 테두리 해안선 고침, 지구 밖을 끌면 옮기기, 주소 바뀌면 다시 맞추기 | 027·028·koprifossillab 029·030 |
| 0.16.0 | 축척 막대·온도계·투영 단추·설정 창·찾기 막대·대기 화면·팝업 색·좌표 복사·그림 내려받기, 병합 전 판 확인 | wetherilli 001~010 |
| 0.16.1 | 분류군 찾기의 커서 목록을 계급과 상관없이, 산지의 분류군이 5종 이상이면 요약 | tupandactyl 001 |
| 0.17.0 | 패널 양쪽, 찾기 칸 하나(분류군·국가), 두꺼운 축척 막대, 도구 묶음(거리 재기·링크·전체·그림) | wetherilli 011~014 |
| 0.18.0 | 시점 막대 맨 위(영어 이름), 떠 있는 찾기 카드, 환경 나무 접기, 설명문은 설정 창의 "읽는 법", "다운로드", 명칭 고치기 끔 | tupandactyl 002 |
| 0.19.0 | 세 번째 투영: 3D 지구본(Cesium, Leaflet 층을 비춘다) | wetherilli P01·015 |
| 0.20.0 | 패널을 오른쪽 하나로, 층서표 글씨 키움, "포인트", 분류군 설명도 "읽는 법" 으로 | tupandactyl 003 |
| 0.20.1 | 확대·축소 단추를 도구 묶음에 다시(지구본 포함) | tupandactyl 004 |
| 0.21.0 | 지구본 지형(1/4° 높이 격자, 높이 과장), `pipeline terrain` | wetherilli 016·017 |
| 0.22.0 | 빈티지 대기 화면(베게너 초상 메달·파이프 연기·메소사우루스, 펜으로 쓰는 제목), 머리말 엠블럼 | tupandactyl 005 |
| 0.23.0 | 사이트 전체 빈티지풍(가죽 머리말·양피지·원목, 본명조 + Spectral 글꼴 12.7 MB 를 저장소에), 어두운 판·화면 밝기 설정 | tupandactyl 006 |
| 0.23.1 | 대기 화면 1.3 배, 시대 범례의 기준, 퇴적기원 아이콘, 칩 글자, 온도계·엠블럼. "모든 시대 첫 화면" 을 걷었다 | tupandactyl 007 |
| 0.24.0 | 제4기(2.58 Ma 이후) 안의 시대 이름은 모호한 연대에서 뺀다 — 가공물을 다시 만들었다(0 Ma 모호 4,880 → 575곳) | tupandactyl 008 |
| 0.25.0 | 최근 5 Ma 를 절 단위 시점으로(홀로세~장클레절 일곱) — 0·5 Ma 지도의 산지를 뷰어가 절 경계로 다시 거른다, "최근 5 Ma" 칩 | tupandactyl 009 |
| 0.26.0 | 최근의 절에 PaleoClim 기온(빙기 최성기·최종간빙기·MIS 19·플라이오세 중기 온난기, 육지만), `pipeline paleoclim` | tupandactyl 010 |
| 0.26.1 | `/healthz` 가 주간 갱신·백업(`refresh`)과 지형·PaleoClim 파일을 본다, 같은 날 백업을 덮어쓰지 않는다 | koprifossillab 034 |
| 0.27.0 | 화면 모드 Scientific(기본: Pretendard, 층서·환경·계급 영문)·Casual(빈티지 글씨·한글 용어), 설정 창에서 고른다 | tupandactyl 011 |
| 0.28.0 | 찾기의 종합 보기(0 Ma 지도에 모든 시대 산지, 분류군 범위로 지도 이동, 점 → 산지 목록·산출), 지도 옮기는 폭 두 배, 팝업 자리, 암상 | tupandactyl 012 |
| 0.28.1 | 대기 화면 1.85 배 빠르게, "느리게 보기" | tupandactyl 013 |
| 0.29.0 | 종합 보기 툴팁(산지·산출·시대), 팝업 산출 이름으로 찾기, 분류군 × 국가 한 줄, PBDB 산지 링크 403 고침 | tupandactyl 014·015 |
| 0.30.0 | 지구사 사건 14 건(층서표 책갈피·폭발/마름모 표식), 에디아카라기 시점 550 Ma(판 복원만) | tupandactyl P01·016~019 |
| 0.31.0 | Casual 모드의 한글 — 속·종 학명 음차(translit.js), 연대·암상 한글, 한글로 찾기(미리 음차한 표) | tupandactyl 020·021 |
| 0.31.1 | 산지 팝업 세로 길이 손잡이(위·아래), 읽는 법에 학명 표기 근거, 다크 모드 Casual 의 한글 본명조 600 | tupandactyl 022·023 |
| 0.31.2 | 주간 갱신이 main 을 스스로 당기고, 점검이 에디아카라기 시점(110)을 받아들인다 | tupandactyl 025 |
| 0.32.0 | 분포 분석 — 다양성·고위도 곡선, 비교 분류군 B, 지금 시점 수치, CSV·GeoJSON 내려받기, 잘림 알림 | tupandactyl 024 |
| 0.32.1 | 같은 이름의 분류군(동명)을 따로 — PBDB 번호로 묻는다 | tupandactyl 026 |
| 0.32.2 | Casual 학명 한글 보충(동정 계급), 최근 찾은 것 5 개 | tupandactyl 027 |
| 0.33.0 | 지층으로 찾기 | tupandactyl 028 |
| 0.34.0 | 지층의 화석 기록 계통 나무 | tupandactyl 030 |
| 1.0.0 | 첫 정식판 — 연구소 밖에서 보는 사이트(GitHub Pages) | tupandactyl 029 |
| 1.0.1 | 지층 화석 나무 동물·식물·기타·문부터 접기, 읽는 법 접힌 항목, 찾기 후보 국가→지층→분류군 | tupandactyl 031 |
| 1.1.0 | 휴대폰 화면 — 페이지 폭을 창에 맞추고, 머리말 두 줄·밑에서 올라오는 패널·지도 위쪽 찾기 칸 | koprifossillab 035 |
| 1.1.1 | 휴대폰 팝업 — 작게, 안을 문지르면 스크롤·지도 옮기기, 두 손가락 크기. 시점 막대 얇게, 패널 끌어 높이 고르기 | koprifossillab 036 |
| 1.1.2 | 주간 갱신이 운영에 옮길 때 폴더 시각을 맞추지 않는다(10-05 실패의 원인) — 웹 이미지는 1.1.1 과 같다 | koprifossillab 037 |
| 1.1.3 | 휴대폰 — 시점 막대 접어서 시작, 찾기 카드의 분류군 줄(시점별 산출·전체 산지), 더 축소·이동, 몰바이데 손가락 끌기. 최근 찾은 것·최근 절 단추의 함수 이름 충돌 | koprifossillab 038 |
| 1.2.0 | 설정 창 탭 셋(설정 · 소개 · 자료와 판 이력), 연구실 소개·만든 사람들, CHANGELOG 로 그린 판 이력 | koprifossillab 039 |
