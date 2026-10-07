#!/bin/sh
# ── 博客 · bare 仓库收件钩子 ──
# 安装：放到 /srv/blog.git/hooks/post-receive 并 chmod +x
#
# 作用：
#   1) 若工作副本里有未提交的「网页端改动」（/admin 改的文章、上传的图片等），
#      先基于推送前的老提交把它提交为一个 commit，再与本次推送**合并**——
#      这样本地 push 不再覆盖网页编辑，网页改动也能被你本地 git pull 拉回。
#   2) 检出到工作副本。
#   3) 仅当「代码/构建相关路径」变化时才重建容器；内容/图片/文档/部署脚本
#      一律只检出、不重建（站点靠 content watcher 热更新，无需重启）。
#   4) 每次推送的决定都追加到 data/deploy.log，方便事后查「为什么重建了」。
#
# 开关：
#   BLOG_SKIP_REBUILD=1 git push   → 本次即使有代码改动也不重建（稍后手动重建）
#   BLOG_FORCE_REBUILD=1 git push  → 本次强制重建（例如只改了配置想重载）
#   BLOG_REBUILD_CMD=...           → 自定义重建命令（默认 docker compose up -d --build）

set -eu

GIT_DIR="${BLOG_GIT_DIR:-/srv/blog.git}"
WORK_TREE="${BLOG_WORK_TREE:-/srv/blog}"
BRANCH="main"

# 提交服务器端改动时使用的身份（无需服务器全局配置）
export GIT_AUTHOR_NAME="blog-server"
export GIT_AUTHOR_EMAIL="server@localhost"
export GIT_COMMITTER_NAME="blog-server"
export GIT_COMMITTER_EMAIL="server@localhost"

# 命中以下路径才需要重建容器（代码与构建相关）
REBUILD_RE='^(app/|components/|lib/|public/|package\.json$|pnpm-lock\.yaml$|pnpm-workspace\.yaml$|next\.config\.(ts|js|mjs)$|tsconfig\.json$|postcss\.config\.(mjs|js)$|Dockerfile$|docker-compose\.yml$|\.dockerignore$|proxy\.ts$|instrumentation\.ts$|components\.json$)'

REBUILD=0
OLD=""
NEW=""
HIT=""
CHANGED=""
# 重建命令（可覆盖，便于测试或自定义）
REBUILD_CMD="${BLOG_REBUILD_CMD:-docker compose up -d --build}"

LOG="${BLOG_DEPLOY_LOG:-$WORK_TREE/data/deploy.log}"
log() {
	mkdir -p "$(dirname "$LOG")" 2>/dev/null || true
	printf '%s  %s\n' "$(date '+%F %T')" "$1" >>"$LOG" 2>/dev/null || true
}

# post-receive 从标准输入读取：<old> <new> <ref>
while read -r old new ref; do
	[ "$ref" = "refs/heads/$BRANCH" ] || continue
	OLD="$old"
	NEW="$new"
	if [ "$old" = "0000000000000000000000000000000000000000" ]; then
		# 首次推送：全部是新增 → 重建
		REBUILD=1
		HIT="(首次推送：全仓库新增)"
		continue
	fi
	CHANGED=$(git --git-dir="$GIT_DIR" diff --name-only "$old" "$new" || true)
	HIT=$(printf '%s\n' "$CHANGED" | grep -E "$REBUILD_RE" || true)
	if [ -n "$HIT" ]; then
		REBUILD=1
	fi
done

G="git --git-dir=$GIT_DIR --work-tree=$WORK_TREE"

# 1) 先把工作副本里未提交的网页端改动提交，再与本次推送合并
if [ -n "$OLD" ] && [ "$OLD" != "0000000000000000000000000000000000000000" ]; then
	$G add -A
	WT_TREE=$($G write-tree)
	OLD_TREE=$(git --git-dir="$GIT_DIR" rev-parse "$OLD^{tree}")
	if [ "$WT_TREE" != "$OLD_TREE" ]; then
		echo "[hook] 检测到服务器端（网页端）改动，提交并合并…"
		SC=$(git --git-dir="$GIT_DIR" commit-tree "$WT_TREE" -p "$OLD" -m "server: 网页端改动 $(date '+%F %T')")
		# 用 merge-tree 在裸仓库里做三方合并（无需工作区）
		if MERGED_TREE=$(git --git-dir="$GIT_DIR" merge-tree --write-tree "$SC" "$NEW" 2>/dev/null); then
			MC=$(git --git-dir="$GIT_DIR" commit-tree "$MERGED_TREE" -p "$SC" -p "$NEW" -m "merge: 服务器端改动 + 本次推送")
			git --git-dir="$GIT_DIR" update-ref "refs/heads/$BRANCH" "$MC"
			echo "[hook] 已合并服务器端改动（$MC）"
			log "回流合并 $MC（网页端改动 + 推送 $NEW）"
		else
			echo "[hook] ⚠️ 自动合并失败（冲突）：服务器端改动已保存为提交 $SC，本次推送留为 $NEW。"
			echo "[hook] 请人工处理：cd $WORK_TREE && git merge $SC 解决冲突后再提交。"
			log "⚠️ 回流合并冲突 SC=$SC NEW=$NEW"
			exit 1
		fi
	fi
fi

# 2) 检出
echo "[hook] 检出 $BRANCH 到 $WORK_TREE"
$G checkout -f "$BRANCH"

# 2.5) 提醒：钩子自身改了要重装（否则改动不生效）
HOOK_SRC="$WORK_TREE/deploy/post-receive.sh"
if [ -f "$HOOK_SRC" ] && [ "${BLOG_GIT_DIR:-}" = "" ] && ! cmp -s "$HOOK_SRC" "$0" 2>/dev/null; then
	echo "[hook] ⚠️ deploy/post-receive.sh 与已安装钩子不一致，重装以生效："
	echo "        cp $WORK_TREE/deploy/post-receive.sh $GIT_DIR/hooks/post-receive && chmod +x $GIT_DIR/hooks/post-receive"
fi

# 3) 按需重建容器
FORCE="${BLOG_FORCE_REBUILD:-0}"
SKIP="${BLOG_SKIP_REBUILD:-0}"

if [ "$SKIP" = "1" ]; then
	echo "[hook] BLOG_SKIP_REBUILD=1 → 已部署代码但**跳过重建**（容器仍运行旧镜像，稍后手动重建）"
	echo "       手动重建：cd $WORK_TREE && docker compose up -d --build"
	log "SKIP（BLOG_SKIP_REBUILD=1）NEW=$NEW"
elif [ "$REBUILD" = "1" ] || [ "$FORCE" = "1" ]; then
	if [ "$FORCE" = "1" ] && [ "$REBUILD" != "1" ]; then
		echo "[hook] BLOG_FORCE_REBUILD=1 → 强制重建容器…"
		log "REBUILD（强制）NEW=$NEW"
	else
		echo "[hook] 检测到代码变更，重建并重启容器…"
		echo "[hook] 命中路径："
		printf '  - %s\n' $HIT
		log "REBUILD NEW=$NEW 命中: $(printf '%s ' $HIT)"
	fi
	cd "$WORK_TREE"
	sh -c "$REBUILD_CMD"
else
	echo "[hook] 无代码变更（内容/文档/部署物），跳过重建 —— 文章/图片改动靠 content watcher 热更新，无需重启"
	log "SKIP（仅内容/文档）NEW=$NEW 变更: $(printf '%s ' $CHANGED | cut -c1-300)"
fi
