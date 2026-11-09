# TODOs

지금 상태와 인수 사항은 [HANDOFF.md](HANDOFF.md), 그때의 판단은 `devlog/`.
**끝난 일은 여기 쌓지 않는다** — 끝나면 지우고 devlog·CHANGELOG 에 남긴다.

## 배포

- [ ] **11-16 cron 뒤 사본 목록이 `occs/list.json` 으로 바뀌었는지** — 운영 `index.json` 의 `occurrences.index` 와 `/healthz` 가 ok 인지. 손으로 옮긴 `occs/index.json` 은 그 뒤 지워도 된다(koprifossillab 060)
- [ ] **11-16 cron 이 바깥 사이트 자료를 올렸는지** — `last_refresh.json` 의 note 가 "바깥 사이트 자료를 올렸다" 인지, 릴리스 `site-data` 의 날짜(koprifossillab 063)
- [ ] **Teams 알림을 켠다(paleoadmin)** — 코드는 1.15.2 에 있다(tupandactyl 032). Teams 채널 → Workflows "웹후크 요청을 받으면 채널에 게시" 로 주소를 만들어
      `~/.config/wegenersdream/teams_webhook`(chmod 600)에 두고, `deploy/host/crontab.WegenersDream` 의 08:00 줄을 crontab 에 더하고, `deploy/host/refresh_alert.py --test`
- [ ] **11-16 cron 뒤 고좌표가 없는 산지가 들어갔는지** — 0 Ma 시점 산지가 약 8 천 → 3 만 곳인지, 갱신이 산지 급감 검사에 걸리지 않았는지(tupandactyl 033)
- [ ] **paleoadmin SSH 열쇠** — `authorized_keys` 가 664 이고 jschoi 의 열쇠(`O+W0SUB56…`) 줄이 없다(10-23 확인, 057 §1.2·059).
      `chmod 600` 하고 jschoi 의 공개 열쇠 한 줄을 더한다

## 자료

- [ ] **기후 민감 암상 점**(증발암·석탄·빙하 퇴적물·보크사이트 …, Boucot et al. 2013 계열) — 화석 점처럼
      겹칠 수 있다. 디지털 원본과 이용 조건부터 확인한다(004)
- [ ] 300 Ma 무렵 범위가 넓은 육상기원 산지는 시점 계산 좌표가 PBDB 좌표보다 땅에 덜 든다(63.5% 대 79%, 017) —
      판 경계 산지인지 해안선 다각형화 탓인지 본다
