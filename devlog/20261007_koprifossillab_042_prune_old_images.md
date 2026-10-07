# koprifossillab 042 — 운영에 띄운 뒤 옛 이미지를 정리한다

2026-10-07 · `feature/prune-old-images`

개발·운영이 한 서버(paleoserver)라 이미지가 판마다 루트 SSD 에 쌓인다. 사람이 정했다: 정규 배포 과정에 넣고 최근 2~3개만 남긴다.

이 저장소는 운영 쪽 배포가 스크립트가 아니라 README 의 명령 몇 줄이라(`compose pull` → `up -d` → `smoke.sh`), 그 끝에 한 줄을 더하고 스크립트를 따로 뒀다.

- `deploy/host/prune_images.sh [--dry-run] [--keep N] <저장소> [지킬 태그…]` — 만든 시각으로 최근 N개(기본 3) + 인자로 준 태그(지금 판·앞 판) + 컨테이너가 쓰는 이미지를 남기고 지운다. 못 지운 것은 경고만, 늘 0 으로 끝난다.
- README "운영 (paleoserver)" 의 smoke 다음 줄, `deploy/host/deploy.sh` 의 끝 안내에도 같은 줄.
- 규약은 kopri-devdocs `guides/web/deployment.md §5.1`.

확인: `bash -n`, dry-run(이미지 3개 → 지울 것 없음).
