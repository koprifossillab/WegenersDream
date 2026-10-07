#!/bin/bash
# 저장소에서 굽고 Docker Hub 에 올린다. 굽는 장비에서 돌린다.
#
#   deploy/host/deploy.sh v0.1.0
#
# 운영 장비에 저장소를 두지 않는 갈래라(GSM 과 같다), 굽기는 여기서 하고
# 돌리기는 /srv/WegenersDream/docker-compose.yml 이 한다.
set -euo pipefail

TAG="${1:-}"
if [[ -z "$TAG" ]]; then
    echo "판 번호를 준다: deploy/host/deploy.sh v0.1.0" >&2
    exit 1
fi

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO"

echo "== 시험 =="
( cd web && WEGENER_SECRET_KEY=test-only python manage.py test viewer )
python -m unittest discover -s pipeline/tests -t .

echo "== 굽기 $TAG =="
WEGENER_TAG="$TAG" docker compose -f deploy/docker-compose.yml build web

echo "== 밀어 올리기 =="
WEGENER_TAG="$TAG" docker compose -f deploy/docker-compose.yml push web

echo
echo "굽고 올렸다: koprifossillab/wegenersdream:$TAG"
echo "운영 장비에서:"
echo "    cd /srv/WegenersDream && WEGENER_TAG=$TAG docker compose pull && WEGENER_TAG=$TAG docker compose up -d web"
echo "    deploy/host/smoke.sh"
echo "    deploy/host/prune_images.sh koprifossillab/wegenersdream $TAG <앞 판>   # smoke 통과 뒤"
