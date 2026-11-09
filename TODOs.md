# TODOs

지금 상태와 인수 사항은 [HANDOFF.md](HANDOFF.md), 그때의 판단은 `devlog/`.
**끝난 일은 여기 쌓지 않는다** — 끝나면 지우고 devlog·CHANGELOG 에 남긴다.

## 배포

- [ ] **운영 이미지를 v1.15.1 로 띄운다**(`WEGENER_TAG=v1.15.1`) — 층 3·4 가 보이고, 11-16 cron 뒤 분포 분석이 사본으로 돈다. 그 뒤 `/healthz` 의 `missing_occurrences` 와 분석 패널의 "PBDB 사본" 을 본다(koprifossillab 060)
- [ ] **11-16 cron 이 바깥 사이트 자료를 올렸는지** — `last_refresh.json` 의 note 가 "바깥 사이트 자료를 올렸다" 인지, 릴리스 `site-data` 의 날짜(koprifossillab 063)
- [ ] **주간 갱신 실패를 사람에게 알린다** — 10-05~10-19 세 주 동안 `last_refresh.json`·`/healthz` 의 실패를 아무도 못 봤다(koprifossillab 052).
      메일·메신저 가운데 연구실이 쓰는 곳으로
- [ ] **paleoadmin SSH 열쇠** — `authorized_keys` 가 664 이고 jschoi 의 열쇠(`O+W0SUB56…`) 줄이 없다(10-23 확인, 057 §1.2·059).
      `chmod 600` 하고 jschoi 의 공개 열쇠 한 줄을 더한다

## 자료

- [ ] **PBDB 고좌표가 없는 산지(46,930 곳, 산출 38 만)를 넣을지** — 현재 좌표로 v19o 로 돌릴 수는 있다. 016 의 규칙을 연구자와 다시 정한다(057 §1.3)
- [ ] **기후 민감 암상 점**(증발암·석탄·빙하 퇴적물·보크사이트 …, Boucot et al. 2013 계열) — 화석 점처럼
      겹칠 수 있다. 디지털 원본과 이용 조건부터 확인한다(004)
- [ ] 300 Ma 무렵 범위가 넓은 육상기원 산지는 시점 계산 좌표가 PBDB 좌표보다 땅에 덜 든다(63.5% 대 79%, 017) —
      판 경계 산지인지 해안선 다각형화 탓인지 본다
