# 주간 갱신이 실패하거나 안 돌면 Teams 로 알린다

2026-11-09 · `feature/refresh-alert`

## 1. 왜

10-05~10-19 세 주 동안 주간 갱신이 운영 반영에서 멈췄는데 아무도 몰랐다(koprifossillab 052). `/healthz` 는
0.26.1 부터 실패를 `degraded` 로 알리지만(034) 늘 보는 사람이 없다. 연구실이 쓰는 메신저는 Microsoft Teams 다(연구자, 11-09).

## 2. 어떻게

- `deploy/host/refresh_alert.py` 를 **갱신과 따로** 월요일 08:00 cron 으로 돌린다. `last_refresh.json` 을 읽고
  - `result` 가 ok 가 아니다(fail·skip)
  - 결과가 24 시간보다 오래됐다 — 이번 주 갱신이 아예 안 돌았거나, 스크립트가 결과를 쓰기 전에 죽었다
  - 결과 파일이 없다·못 읽는다
  - 갱신은 ok 인데 NAS 백업이 fail 이다

  면 Teams 채널로 적응형 카드 하나를 보낸다. ok 이면 조용하다(연구자가 "실패할 때만" 을 골랐다).
- 웹훅 주소는 저장소에 두지 않는다 — `WEGENER_TEAMS_WEBHOOK` 또는 paleoadmin 의 `~/.config/wegenersdream/teams_webhook`(600).
- 표준 라이브러리만 쓴다 — cron 의 `/usr/bin/python3` 로 돌고 `.venv` 에 기대지 않는다(갱신이 `.venv` 때문에 깨진 날에도 알리게).

## 3. 버린 것

- **weekly_refresh.sh 의 `fail()` 에서 바로 보내기** — 스크립트가 결과를 쓰기 전에 죽거나 cron 이 안 돌면(PATH 사고, 063) 못 보낸다.
  "조용함" 을 잡으려면 갱신 밖에서 봐야 한다. 바로 알리는 것은 6 시간 늦어지는 값으로 버렸다
- **`/healthz` 의 degraded 도 알리기** — 지금은 사본 목록(`occs/list.json`)이 11-16 까지 없어 degraded 라 첫 주부터 헛알림이 된다.
  갱신 실패와 같은 일이 아니다
- **매주 성공도 알리기** — 연구자가 실패만 골랐다. 대신 "안 돌았다" 를 잡아 조용함이 고장을 감추지 않게 했다

## 4. 남은 것

paleoadmin 이 할 일 — Teams 채널에서 Workflows 웹훅을 만들어 주소를 `~/.config/wegenersdream/teams_webhook` 에 두고(`chmod 600`),
`deploy/host/crontab.WegenersDream` 의 08:00 줄을 crontab 에 더하고, `deploy/host/refresh_alert.py --test` 로 한 번 보낸다.
jschoi 계정으로는 paleoadmin 의 crontab 을 고칠 수 없다.
