# Wegener's Dream (베게너의 꿈) — 고지리 화석 지도

시대별 고지리 지도 위에 그 시대의 화석 기록을 올려 보는 2D 지도 뷰어.
현생누대(0–540 Ma)를 5 Myr 간격 109 시점으로, 그리고 에디아카라기 한 시점(550 Ma, 판 복원만)으로 넘겨 본다.
운영: **http://paleolab/WegenersDream/**(연구소 망 안, `172.16.116.98`) · 연구소 밖: **https://koprifossillab.github.io/WegenersDream/**
(같은 뷰어의 고정 사본 — GitHub Pages, `deploy/static_site.py`·`.github/workflows/pages.yml`).

- 층서표(대·기·세·절)로 시점을 고르고, 밀대로 넘기거나 차례로 본다
- 산지를 퇴적기원(해양·육상)·퇴적 환경·연대 범위·국가로 거르고, 점을 퇴적기원 또는 시대 색으로 칠한다
- 지도 위에 떠 있는 찾기 칸 하나로 분류군·국가를 찾는다. 분류군을 찾으면(PBDB 에 바로 묻는다) 그 시점의 산출 산지·산출 시대 분포·같은 시대의 다른 산지를 보인다
- 지표 기온, 지금 국경을 그때 자리로 돌린 선, 화석으로 고친 해안선, 경위선을 겹친다
- 투영은 정거원통·몰바이데. 몰바이데에서는 지구를 끌어 가운데 경선을 돌린다
- 한국어·English. 시점·투영·가운데 경선·언어는 주소(`#age=250&proj=moll&lon=-65&lang=en`)로 나눈다
- 지도 위 도구 묶음: 전체 보기, 그 시점의 대권 거리 재기, 주소 복사, 지금 보는 지도를 PNG 로 내려받기(밑 띠에 시점·층서·거르기·출처)

| 겹 | 자료 | 조건 |
|---|---|---|
| 배경(고도·음영) | PALEOMAP PaleoDEM, Scotese & Wright 2018 | CC BY 4.0 |
| 해안선 | PaleoCoastlines v7.1, Kocsis & Scotese 2021 | CC BY 4.0 |
| 화석 점 | Paleobiology Database 채집지, PALEOMAP 고좌표(`pgm=scotese`) | CC BY 4.0 |
| 지표 기온 | Scotese et al. 2021, HadCM3L 모의를 대리 자료에 맞춘 것 | CC BY 4.0 |
| 최근 절의 지표 기온 | PaleoClim(Brown et al. 2018; 최종빙기 최성기는 CHELSA v1.2, Karger et al. 2017) — 최종빙기 최성기·최종간빙기·MIS 19·플라이오세 중기 온난기, 육지만 | **CC BY-NC-SA 4.0** — 비영리, 같은 조건 |
| 국경선 | Natural Earth 1:50m 현재 국경을 PALEOMAP 판으로 돌린 것 | 퍼블릭 도메인 |

자료가 모두 **PALEOMAP 판 모델 틀**이라 서로 맞는다. PBDB 기본 모델(`gplates`)을
쓰면 점이 배경과 수 도씩 어긋난다 — [devlog 001](devlog/20260929_001_시작.md).

## 소개 · 만든 사람들

극지연구소 고생물진화연구실이 만든다. 전 세계의 화석 기록과 고지구 자료를 하나의 판 모델 위에 통합해, 시간에 걸친 생물군의
분포와 다양성 변화를 추적하는 것이 목적이다. 이름은 대륙이동설을 내놓은 알프레트 베게너(1880–1930)에게서 왔다.

| 사람 | GitHub | 맡은 일 |
|---|---|---|
| 최준석 | [Tupandactyl](https://github.com/Tupandactyl) | 데이터 통합과 수정, 기능 추가 |
| 정직한 | [jikhanjung](https://github.com/jikhanjung) | 검토와 세부 기능 추가 |
| 이승찬 | [wetherilli](https://github.com/wetherilli) | 검토와 세부 기능 추가 |
| — | [koprifossillab](https://github.com/koprifossillab) | 총괄 |

화면에서는 ⚙ 설정 창의 "소개" 탭(소개·만든 사람들·자료)에 같은 내용이 있다(`web/viewer/templates/viewer/map.html`, 영어는 `i18n.js`) — 바꿀 때 둘 다 고친다.

## 구조

```
pipeline/     원본 받기·가공 → data/derived/ (시점별 배경 WebP — 정거원통·몰바이데, 해안선·화석·국경 JSON,
              기온 PNG, index.json)
web/          Django 뷰어. 파이프라인이 만든 파일만 읽는다. DB 없음. 화면 문구는 viewer/static/viewer/i18n.js
deploy/       Docker·nginx(/WegenersDream/ 서브경로)·운영 compose. GSM 과 같은 갈래
sources/      원본 매니페스트(주소·SHA-256·인용·이용 조건)
devlog/       왜 그렇게 했는지 — 색인은 devlog/README.md
docs/         운영 문서(백업·PBDB 자료 처리)와 정하기 전의 검토(DB 전환)
```

## 로컬 실행

```bash
python -m venv .venv
.venv/bin/pip install -r requirements.txt        # Windows: .venv\Scripts\pip …

# 1) 원본 받기(약 500 MB, 풀면 3.3 GB — PaleoClim 포함)와 가공(약 15 분, 배경·지형 굽기 포함) — 처음 한 번
.venv/bin/python -m pipeline all
#    PBDB 만 새로 받아 다시 가공: fetch --refresh-pbdb 다음 build --no-relief(30 초 남짓, 배경·지형은 지난 것)
#    지구본 지형만 굽어 지금 목록에 붙이기: python -m pipeline terrain(5 분 남짓)

# 2) 뷰어
WEGENER_DEBUG=1 .venv/bin/python web/manage.py runserver    # PowerShell: $env:WEGENER_DEBUG = "1"
```

http://127.0.0.1:8000/ 에서 본다. 가공에는 pygplates 가 든다(`requirements-pipeline.txt`). 웹 이미지에는
파이프라인 의존성을 넣지 않는다(`requirements-web.txt`).

## 시험

```bash
WEGENER_SECRET_KEY=test .venv/bin/python web/manage.py test viewer
.venv/bin/python -m unittest discover -s pipeline/tests -t .
```

CI(`.github/workflows/test.yml`)가 PR·push 마다 둘 다 돌리고 이미지를 굽는다.

## 작업 방식

각자 자기 계정에서 `feature/<기능 이름>` 브랜치로 작업하고 끝나면 PR 을 만든다. 병합은 사람이 정한다.
판을 올린 PR 이 병합되면 CHANGELOG 로 GitHub 릴리스를 만들고, 릴리스 태그마다 CI 가 Docker Hub
(`koprifossillab/wegenersdream:<태그>`)에 이미지를 올린다. 자세한 규약은 [CLAUDE.md](CLAUDE.md),
지금 상태는 [HANDOFF.md](HANDOFF.md), 할 일은 [TODOs.md](TODOs.md), 판마다 바뀐 것은 [CHANGELOG.md](CHANGELOG.md).

## 운영 (paleoserver)

연구소 서버의 nginx 가 `/WegenersDream/` 를 `127.0.0.1:8095` 컨테이너로 넘긴다
([deploy/nginx/WegenersDream-subpath.conf](deploy/nginx/WegenersDream-subpath.conf)). 운영 compose 는
[deploy/srv/docker-compose.yml](deploy/srv/docker-compose.yml) 을 `/srv/WegenersDream/` 에 둔 것이고,
자료는 `/srv/WegenersDream/data/`(읽기 전용 마운트), 화면에서 고친 명칭·비밀키는 `/srv/WegenersDream/state/` 다.

```bash
# 이미지: 서버에서 굽거나, 릴리스된 판을 Docker Hub 에서 받는다
WEGENER_TAG=v1.2.0 docker compose -f deploy/docker-compose.yml build web
#   또는: cd /srv/WegenersDream && WEGENER_TAG=v1.2.0 docker compose pull

# 가공물이 바뀌었으면 — index.json 을 맨 나중에 바꾼다(컨테이너가 없는 파일을 가리키지 않게)
rsync -a --omit-dir-times --exclude index.json data/derived/ /srv/WegenersDream/data/
rsync -a --omit-dir-times data/derived/index.json /srv/WegenersDream/data/index.json

cd /srv/WegenersDream && WEGENER_TAG=v1.2.0 docker compose up -d web
deploy/host/smoke.sh http://172.16.116.98/WegenersDream/
```

**매주 월요일 02:30** paleoadmin 의 cron 이 [deploy/host/weekly_refresh.sh](deploy/host/weekly_refresh.sh) 를 돌린다 — 운영 자료·PBDB
원본·state(비밀키 빼고)를 `/data/WegenersDream/backups/WegenersDream.<YYYYMMDD>.tar.gz` 와 NAS(`/nfs/temp-share/WegenersDream/backup/`)에
같은 파일로 백업하고, PBDB 를 새로 받아 산지를 다시
가공해 운영에 옮긴다(실패하면 지난 자료 그대로). 등록은 `(crontab -l; cat deploy/host/crontab.WegenersDream) | crontab -`.
무엇이 들고 무엇이 빠지는지, 확인하는 법과 되살리는 절차는 [docs/백업.md](docs/백업.md).

## 인용

화면의 ⚙ 설정 · 자료 창과 `index.json` 의 `sources` 에 다섯 자료의 인용이 있다. 그림을 쓸 때
자료를 모두 밝힌다. PBDB 는 채집지마다 원 문헌이 따로 있다.

## 라이선스

이 저장소의 코드(파이프라인·뷰어·배포 스크립트)는 **GNU Affero General Public License v3.0**([LICENSE](LICENSE))을 따른다.
저작권은 기여자들에게 있다(git 기록). AGPL 이라 **고쳐서 네트워크로 서비스하면 그 소스도 이용자에게 내놓아야 한다.**

함께 담은 것은 각자의 조건을 따른다 — AGPL 로 바뀌지 않는다.

| 것 | 조건 | 자리 |
|---|---|---|
| Leaflet 1.9.4 | BSD 2-Clause | `web/viewer/static/viewer/vendor/leaflet/` |
| CesiumJS 1.145.0 | Apache-2.0 | `web/viewer/static/viewer/vendor/cesium/LICENSE.md` |
| 글꼴 La Belle Aurore·본명조(Noto Serif KR)·Spectral·Pretendard | SIL OFL 1.1 | `web/viewer/static/viewer/vendor/fonts/OFL-*.txt` |
| 베게너 사진(대기 화면 초상의 원본) | Photo: Alfred Wegener Institute | `design/README.md` |
| pygplates 1.0(가공에만) | **GPL-2.0-only**(COPYING 이 "not any later version" 이라 적는다) | `requirements-pipeline.txt` — 저장소·이미지에 담지 않고 쓰는 사람이 설치한다. AGPL-3.0 과 맞지 않아 **파이프라인과 한 꾸러미로 묶어 배포하지 않는다** |
| 자료(PaleoDEM·PaleoCoastlines·PBDB·기온·Natural Earth) | CC BY 4.0·퍼블릭 도메인 | 위 "겹" 표, `sources/*.json` — 저장소에 담지 않고 파이프라인이 받는다 |
| 자료(PaleoClim — 최근 절의 기온) | **CC BY-NC-SA 4.0** | `sources/paleoclim.json`. 저장소에 담지 않는다. 이것으로 구운 기온 그림(`climate/pc_*.png`)과 그것이 든 화면 그림도 같은 조건 — **상업적으로 쓸 수 없다**. 연구자가 이 조건으로 쓰기로 정했다(2026-09-30). 빙기 최성기·최종간빙기 압축본에는 조건 문서가 없어 PaleoClim 의 조건으로 본다 |

목록은 [vendor/README.md](web/viewer/static/viewer/vendor/README.md) 에 판·받은 곳과 함께 있다.
