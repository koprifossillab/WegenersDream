# koprifossillab 063 — 바깥 사이트 자료가 멈춘 것은 로그인이 아니라 cron 의 PATH 였다

2026-11-09 · `feature/cron-gh-path`

## 1. 무엇이 틀렸나

10-26·11-02·11-09 의 주간 갱신이 모두 `ok` 이면서 "바깥 사이트는 그대로 — gh 로그인 없음" 으로 끝났고, 릴리스 `site-data` 는 10-23 에 멈춰 있었다.
TODOs 는 이것을 "paleoadmin 의 `gh auth login`" 으로 적었지만, paleoadmin 의 `gh` 는 09-30 부터 로그인돼 있다(`hosts.yml` 이 그날 것).

`gh` 는 `~/.local/bin/gh` 에 있고 cron 의 PATH 는 `/usr/bin:/bin` 이다. `env -i HOME=$HOME PATH=/usr/bin:/bin` 으로 돌려 보면 `command -v gh` 가 비고,
스크립트는 `command -v gh && gh auth status` 를 한 조건으로 묶어 두 실패를 같은 문구로 적었다. 손으로 돌리면 PATH 가 있어 되므로 드러나지 않았다
(10-23 14:24 의 site-data 는 059 에서 손으로 돌린 갱신이 올린 것으로 보인다).

## 2. 고친 것

- `weekly_refresh.sh` 가 맨 앞에서 `PATH="$HOME/.local/bin:$PATH"` 를 더한다. crontab 에 PATH 를 적는 길도 있지만, crontab 은 저장소 밖(사람이 붙인 것)이라
  다시 붙이지 않으면 안 바뀐다 — 스크립트 안이면 다음 cron 이 main 을 당길 때 함께 온다(025)
- "gh 를 못 찾음(PATH 를 함께 적는다)" 과 "gh 로그인 없음" 을 따로 적는다 — 같은 문구가 원인을 잘못 가리켜 세 주를 보냈다

결과가 `ok` 로 나와 놓치는 것은 그대로다. 사람에게 알리는 일(TODOs)이 이것도 덮어야 한다.
