# koprifossillab 056 — 이미지 안의 pip 을 26.1 이상으로 · 서버 디스크가 바뀐 자리 · 1.12.1

2026-10-23 · `feature/pip-security`

기능 변경이 없는 보안 판이다. 같은 날 서버에 일이 겹쳐 함께 적는다 — ① 보안 점검,
② `/data` 디스크(sda) 고장과 `/data3` 디스크(sdc) 열화, ③ Ubuntu 26.04 로 올린 뒤 깨진
호스트 환경. 판으로 나가는 것은 ①뿐이고 ②·③은 이 저장소 밖에서 바뀐 것을 기록한다.

## 1. 보안 — 왜 다시 굽나

2026-10 에 pip·uv·PHP 의 취약점이 잇달아 나와 서버와 컨테이너를 점검했다. 이 저장소의
이미지에 걸리는 것은 **pip** 하나였다.

| 무엇 | 취약점 | 이 저장소 |
|---|---|---|
| pip | CVE-2026-6357 (설치 직후 자기 갱신 확인이 방금 깐 wheel 의 모듈을 임포트해 코드가 돈다) · CVE-2026-3219 (tar 이면서 zip 인 파일을 zip 으로 읽어 다른 파일이 깔린다) · CVE-2026-8643 (entry point 이름으로 scripts 디렉토리 밖에 쓴다) · CVE-2026-13346 (두 번 인코딩한 URL 로 인덱스가 임의 경로에 쓴다) · CVE-2026-1703 (wheel 을 설치 디렉토리 밖 형제 경로에 푼다). 대부분 **26.1 미만** | 이미지 **25.0.1**. 걸린다 |
| uv | CVE-2026-114109 (0.11.15 에서 고침) · CVE-2026-114110 (0.11.6) | 이미지·CI 에 uv 가 없다. 안 걸린다 |
| PHP | CVE-2026-109618 · 109619 ("PHP2Shell", 원격 코드 실행) | PHP 가 없다. 안 걸린다 |

pip 의 결함은 전부 **악성 패키지나 인덱스로 설치할 때** 일어난다. 컨테이너는 돌면서 pip 을
안 부르므로 운영 이미지가 바로 위험한 것은 아니다 — 위험한 자리는 **이미지를 굽는 순간**이다.
**pip 은 베이스 이미지를 새로 받아도 안 올라간다** — `python:3.12-slim` 의 pip 은 그 파이썬
판이 묶어 낸 것이라 지금 받아도 25.0.1 이다. 그래서 `deploy/Dockerfile.web` 에서 직접
올린다(`pip install --upgrade "pip>=26.1"` — 다음 보안판을 받게 하한만 둔다). 다시 굽는 김에
베이스(Debian 13)의 보안 갱신도 들어온다. 판은 PATCH 만 올린다(1.12.0 → 1.12.1, 사용자 방침).

## 2. 디스크 — 자리가 바뀐 것

**`/data` 디스크(sda, 8 TB)가 고장 났다**(SMART 재할당 7,912 · 읽기 불가 1,512 · 파일시스템
비트맵 오류가 07-31 부터 3만 건). **`/data3` 디스크(sdc, 같은 모델)도 열화 중이다** — 재할당이
10-23 하루에 6,136 → 6,272, 요청 한 건에 읽기 1초·쓰기 3초. 두 디스크 다 바꿀 때까지의 임시 배치다.

| 무엇 | 전 | 지금 (2026-10-23) |
|---|---|---|
| **`/data/WegenersDream`** (주간 갱신의 `backups/`·`logs/`) | sda | **`/data3/data-rescue/WegenersDream` 을 `/data` 에 bind mount** (sdc). 경로는 그대로라 `weekly_refresh.sh` 를 안 고쳤다. 고장 난 sda 에서 `rsync -aHAX` 로 옮겼고 원본과 같았다(592 MB · 파일 11 개) |
| Docker 데이터 루트 | `/data3/docker` (sdc) | **`/data2/docker`** (sdb SSD) · `containerd-snapshotter: false`. 이미지는 Docker Hub 에서 **같은 digest** 로 다시 받았다(`wegenersdream:v1.12.0`) |
| `/data3`·`/data` 마운트 | `relatime` | `noatime` (지금 부팅에서만) |
| NAS 의 03:00 백업 수신(rsync 데몬) | 켜짐 | 꺼짐 — NAS 는 지금 백업이 없다 |

**WegenersDream 에 걸리는 것**

- **`/srv/WegenersDream/docker-compose.yml` 은 판을 `.env` 가 아니라 `WEGENER_TAG` 환경변수로 받는다.**
  Docker 를 옮기며 컨테이너를 다시 만들 때 이것을 안 줘 `latest` 를 찾다 한 번 실패했다 —
  `WEGENER_TAG=v1.12.0` 으로 다시 띄웠다. 손으로 다시 띄울 일이 있으면 꼭 준다
- 운영 자료(`/srv/WegenersDream/data`·`state`)는 nvme 에 있어 디스크 고장과 무관하다
- 주간 갱신(월 02:30)은 구조 작업 동안(10-23 10:15~10:42) 꺼 두었다가 다시 켰다 — `/data` 가
  읽기 전용이었다. 다음 월요일(10-26)이 이 자리의 첫 실행이다
- **`.venv` 를 다시 만들었다** — Ubuntu 26.04 에 파이썬 3.12 가 없어 깨졌다. 26.04 의 3.14 로는
  **pygplates 1.0.0 의 wheel 이 없어**(cp38~cp313 뿐) 깔리지 않아, uv 가 받은 파이썬 **3.12.15**
  (`~/.local/share/uv/python/`)로 만들고 같은 판의 패키지 21 개를 깔았다. 옛 것은
  `~/venv-py312-bak/WegenersDream.venv`. `weekly_refresh.sh` 가 이 `.venv` 로 돈다

## 3. 확인

- 시험(`.venv` · 3.12.15): 뷰어 24 · 파이프라인 46 · 학명 음차 57/57 · `check_version.py` 통과
- CI 가 구운 이미지 안에서 `pip --version` 이 26.1 이상인지 본다
