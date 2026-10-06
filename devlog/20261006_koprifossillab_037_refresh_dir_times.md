# koprifossillab 037 — 주간 갱신이 남의 폴더 시각에서 멈췄다

2026-10-06 · `feature/refresh-dir-times`

## 1. 무슨 일이었나

10-05(월) 02:30, cron 으로 처음 돈 주간 갱신(032)이 마지막 단계(운영에 옮기기)에서 실패했다.

```
rsync: [generator] failed to set times on "/srv/WegenersDream/data/taxa_ko": Operation not permitted (1)
rsync error: some files/attrs were not transferred (see previous errors) (code 23)
2026-10-05T02:32:16+09:00 [fail] deploy — rsync 실패
```

`/srv/WegenersDream/data/taxa_ko` 는 **jschoi** 가 만든 폴더다(한글 찾기 표, tupandactyl 021 — 그때 손으로 운영에 옮겼다).
그룹(paleoadmin)에 쓰기 권한이 있어 안의 파일 558 개는 모두 옮겨졌지만, 주인이 아니면 폴더의 시각을 바꿀 수 없다. `rsync -a` 는
폴더 시각도 맞추려 하므로 코드 23 으로 끝났고, 스크립트는 그것을 실패로 보고 멈췄다.

멈춘 자리가 나빴다 — `index.json` 을 **맨 나중에** 옮기는 규칙(컨테이너가 없는 파일을 가리키지 않게) 때문에 가공물은 모두 새것(PBDB 10-04)인데
목록만 옛것(09-30)으로 남았다. 그 뒤의 바깥 사이트 자료 올리기도 돌지 않았다. `/healthz` 는 `degraded` 로 이것을 보고 있었다(034 가 한 일).
백업·NAS 는 그 전 단계라 멀쩡했다.

## 2. 고친 것

운영에 옮기는 두 rsync 에 `--omit-dir-times`. 폴더 시각은 뷰어도 rsync 의 다음 비교도 쓰지 않는다(파일은 크기·시각으로 비교한다).
README 의 손으로 옮기는 명령과 docs/백업.md 의 되살리는 명령도 같은 옵션으로 — 사람이 그 명령을 돌려도 같은 데서 걸린다.

버린 것:
- **폴더 주인을 paleoadmin 으로 바꾸기**(`sudo chown`) — 하면 좋지만 그것만으로는 다음에 누가 손으로 옮겨 만든 폴더에서 또 걸린다.
  옵션 쪽이 원인을 없앤다. 주인 바꾸기는 sudo 가 있는 사람이 할 수 있으면 하면 된다
- **코드 23 을 성공으로 치기** — 23 은 "일부 파일을 못 옮겼다" 도 뜻한다. 그것까지 삼키면 진짜 빠진 파일을 놓친다

## 3. 10-05 의 남은 일

남은 것은 `index.json` 하나를 옮기고 바깥 사이트 자료를 올리는 것이다. 다음 정기 실행(10-12)을 기다려도 저절로 맞지만, 그 전에
손으로 하면 한 주 동안 목록과 가공물이 어긋나지 않는다(HANDOFF).
