# koprifossillab 059 — 세 주 멈춘 주간 갱신을 되살리고 1.13.0 을 운영에 올린다

2026-10-23 · `main`(운영 작업·문서만)

10-05~10-19 주간 갱신이 jschoi 소유의 운영 `taxa_ko` 폴더에서 멈춰(052) 운영 자료가 10-04 에 머물러 있었다. 10-20~10-23 의 코드는
jschoi 의 Windows PC(git 은 koprifossillab)에서 짰는데, 그 PC 에서는 서버의 paleoadmin 으로 들어오지 못해(057 §1.2) 이 정리가 남아 있었다.
paleoserver 의 paleoadmin 세션에서 했다.

## 1. 한 것

| 시각 | 무엇 | 결과 |
|---|---|---|
| 14:10 | 운영 `taxa_ko` 를 `taxa_ko.jschoi-20261021` 로 옮기고 `weekly_refresh.sh` 를 손으로 | 14:25 `ok` — 산지 278,580 → 278,593, 운영에 옮김, 바깥 사이트 자료 올림. `/healthz` `degraded` → `ok` |
| 14:30 무렵 | PR #63 병합 — `premerge.sh` 가 main 보다 한 커밋 뒤처졌다고 FAIL, `gh pr update-branch --rebase` 뒤 CI 를 다시 보고 병합. 릴리스 `v1.13.0` | 태그 CI·Pages 성공 |
| 그 뒤 | 운영을 `WEGENER_TAG=v1.13.0` 으로 `pull`·`up -d`, `smoke.sh` | 넷 다 ok, `/healthz` 1.13.0 `ok` |
| 그 뒤 | 옛 `taxa_ko.jschoi-20261021` 를 운영 자료 밖(`/srv/WegenersDream/`)으로 | 운영 자료 518 MB |

## 2. 판단

- **옛 폴더를 운영 자료 안에 두지 않는다** — 052·HANDOFF 가 정한 자리(`data/` 안 옆자리)는 갱신의 5 단계가 `data/` 를 통째로 묶어 바깥 사이트에
  올리고 매주 백업에도 넣는다(18 MB 씩). rsync 에 `--delete` 가 없어 저절로 사라지지도 않는다. 지우지 않고 `data/` 밖으로만 옮겼다 — 10-19·10-23
  백업(로컬·NAS)에 있으니 지워도 되지만, 지우는 것은 사람이 정한다
- **057 §1.1 의 "10-26 cron 도 같은 자리에서 멈춘다" 는 바로잡는다** — cron 이 도는 스크립트는 paleoadmin 클론의 것이고, 그 클론은 10-22 05:30 의 pull 로
  이미 #59(`rsync -rlt`, 10-21 15:59 병합)를 당겨 둔 상태였다. 폴더 안 파일은 paleoadmin 소유, 폴더 시각은 `--omit-dir-times` 로 건너뛰니 옮기지 않았어도 지나갔을
  가능성이 크다. 다만 돌려 보기 전에는 몰라 옮겼다
- **rebase 는 남의 브랜치에도 했다** — 뒤처진 것이 HANDOFF 한 줄이라 내용 충돌은 없었다. jschoi 의 PC 에 남은 `feature/occupancy-layers` 는 해시가
  달라졌으니 버리고 main 을 당긴다

## 3. 확인한 것(10-23)

- **보안 판** — 운영 컨테이너의 pip 26.2.2(파이썬 3.12.15), 가공 `.venv` 의 pip 26.2.2. 056 §3 의 "CI 가 이미지 안 pip 판을 본다" 는 워크플로에
  그런 단계가 없다 — 이번에는 손으로 봤다
- **디스크** — `/data` 는 `/data3/data-rescue` 의 bind mount 로 `/etc/fstab` 에 걸려 있다(재부팅에도 남는다). Docker 루트 `/data2/docker`
  (`/etc/docker/daemon.json`). 주간 갱신은 바뀐 자리에서 백업·NAS 모두 성공
- **SSH** — paleoadmin 의 `authorized_keys` 는 664(08-04 그대로)이고 jschoi 의 열쇠 줄이 없다. 057 §1.2 의 두 추정이 다 맞다. 고치는 것은 열쇠 본문을 받은 뒤
- **아직 남은 보안 거리** — 운영 `.env` 에 `WEGENER_EDITOR_KEY` 가 있어 `/labels` POST 가 열쇠로 열린다(HANDOFF, 0.18.0 부터 쓰지 않는다)
