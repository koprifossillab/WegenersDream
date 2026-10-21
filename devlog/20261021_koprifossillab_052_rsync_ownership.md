# koprifossillab 052 — 주간 갱신이 남의 폴더 권한에서 세 주째 멈췄다

2026-10-21 · `feature/rsync-ownership`

## 1. 무엇을 봤나

1.9.0 을 운영에 띄우고 `/healthz` 를 보니 `degraded` — 운영 자료가 **10-04** 의 것이고, 10-05·10-12·10-19 의 주간 갱신이 모두 마지막
단계(운영에 옮기기)에서 `rsync 실패` 로 끝나 있었다. 로그:

```
10-05  rsync: failed to set times on "/srv/WegenersDream/data/taxa_ko": Operation not permitted (1)
10-12  rsync: failed to set permissions on "/srv/WegenersDream/data/taxa_ko": Operation not permitted (1)
10-19  (같다)
```

10-05 의 것은 037 에서 `--omit-dir-times` 로 막았다. 그런데 같은 폴더(jschoi 가 손으로 만든 `taxa_ko`)의 **권한**도 paleoadmin 이 못 바꾼다 —
가공 폴더의 `taxa_ko` 는 750(주간 갱신의 umask 027), 운영 쪽은 775. `rsync -a` 는 권한을 맞추려다 코드 23 으로 끝나고, 스크립트는 파일을 다
옮긴 뒤 `index.json` 을 옮기기 **전에** 멈춘다 — 그래서 화면은 10-04 의 목록을 계속 썼다.

## 2. 고친 것

- `weekly_refresh.sh`·README 의 운영 반영을 `rsync -a` → **`rsync -rlt`** — 권한·소유자·그룹은 맞추지 않는다. 새 파일은 스크립트의 umask 로 생기고
  컨테이너는 paleoadmin(uid 1000)으로 읽으니 맞출 까닭이 없다. 다른 계정이 만든 것이 섞여도 멈추지 않는다
- 운영의 `taxa_ko` 는 paleoadmin 이 옆으로 옮기고(`taxa_ko.jschoi-20261021`) 주간 갱신을 손으로 돌려 새로 만들게 했다(10-21, 연구자)

## 3. 배운 것

`last_refresh.json` 의 실패가 세 주 동안 아무에게도 닿지 않았다. `/healthz` 가 `degraded` 로 알리지만 그것을 보는 사람이 없었다 — 알림을 어디로
보낼지는 TODOs 에 둔다.
