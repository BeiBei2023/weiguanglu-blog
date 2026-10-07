#!/bin/sh
# ── 博客 · 手动重建容器 ──
# 用途：推送时用 BLOG_SKIP_REBUILD=1 跳过了重建、或只改了 docker-compose.yml / .env
#       需要重新起容器时，手动执行本脚本。
#
# 用法（服务器上）：
#   sh /srv/blog/deploy/rebuild.sh
#
# 说明：会记录到 data/deploy.log，方便和自动重建区分。

set -eu

WORK_TREE="${BLOG_WORK_TREE:-/srv/blog}"
LOG="${BLOG_DEPLOY_LOG:-$WORK_TREE/data/deploy.log}"

cd "$WORK_TREE"
printf '%s  REBUILD（手动执行 deploy/rebuild.sh）\n' "$(date '+%F %T')" >>"$LOG" 2>/dev/null || true

docker compose up -d --build
echo
docker compose ps
echo
printf '当前容器镜像：'
docker inspect "$(docker compose ps -q web)" --format '{{.Image}}  StartedAt={{.State.StartedAt}}' 2>/dev/null || true
