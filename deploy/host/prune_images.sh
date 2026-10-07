#!/usr/bin/env bash
# 옛 Docker 이미지를 정리한다 — 저장소마다 최근 N 개만 남긴다 (.guides/web/deployment.md §5.1).
#
#   prune_images.sh [--dry-run] [--keep N] <저장소> [지킬 태그 …]
#   예) deploy/host/prune_images.sh koprifossillab/wegenersdream v1.2.3 v1.2.2
#
# 이 서버는 개발·운영을 겸하고 루트 SSD 가 늘 빠듯하다. 이미지는 판마다 수백 MB~수 GB 씩
# 쌓이고, 손으로 치우면 잊는다 — 그래서 배포의 마지막 단계(smoke 통과 뒤)에서 부른다.
#
# 남기는 것:
#   - 만든 시각으로 최근 N 개(기본 3). 태그 글자순이 아니다 — v0.9 와 v0.10 은 글자순으로 거꾸로다.
#   - 인자로 준 태그(지금 판·되돌리기에 쓸 앞 판) — 개수와 상관없이.
#   - 지금 컨테이너(멈춘 것 포함)가 쓰는 이미지.
# 지우지 못한 것은 경고만 하고 0 으로 끝난다 — 정리 실패가 배포를 실패로 만들지 않는다.
set -uo pipefail

DRY=0; KEEP=3
while [ $# -gt 0 ]; do
    case "$1" in
        --dry-run) DRY=1; shift ;;
        --keep) KEEP="${2:?--keep 뒤에 개수}"; shift 2 ;;
        *) break ;;
    esac
done
REPO="${1:-}"
[ -n "$REPO" ] || { sed -n '2,6p' "$0" >&2; exit 2; }
shift

PROTECT="$(mktemp)"; trap 'rm -f "$PROTECT"' EXIT
for t in "$@"; do [ -n "$t" ] && printf '%s:%s\n' "$REPO" "$t" >> "$PROTECT"; done
docker ps -a --format '{{.Image}}' | grep "^$REPO:" >> "$PROTECT" || true

docker images "$REPO" --format '{{.CreatedAt}}\t{{.Repository}}:{{.Tag}}' \
    | grep -v '<none>' | sort -r | tail -n +"$((KEEP + 1))" | cut -f2 \
    | grep -vxF -f "$PROTECT" \
    | while read -r img; do
        if [ "$DRY" = 1 ]; then
            echo "  (dry-run) 지울 것: $img"
        elif docker rmi "$img" >/dev/null 2>&1; then
            echo "  옛 이미지를 지웠다: $img"
        else
            echo "  경고: $img 를 지우지 못했다 — 넘어간다" >&2
        fi
    done || true   # 지울 것이 없으면 grep 이 1 — pipefail 아래서 실패로 끝나지 않게

# 태그 없는(dangling) 이미지도 — 판을 같은 태그로 다시 구우면 옛것이 이렇게 남는다.
[ "$DRY" = 1 ] || docker image prune -f >/dev/null 2>&1 || true
exit 0
