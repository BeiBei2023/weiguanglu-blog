#!/bin/sh
# ── 博客 · 备份到 123 云盘（rclone + WebDAV）──
# 依赖：rclone 已配置好 remote（见 文档/DEPLOY.md），例如 remote 名 `bg`
#
# 备份内容：
#   $REMOTE/site  ← 工作副本 /srv/blog（content/、data/、配置等）
#   $REMOTE/git   ← bare 仓库 /srv/blog.git（保留 git 历史）
#
# 注意：`rclone sync` 默认就会删除目标端多余文件，**不要加 `--delete`**（无此参数，会报错）。
#
# 用法：直接执行，或交给 systemd timer / cron
#
# 另外：脚本结束时会把「上次备份结果」写到 $SRC/data/backup-status.json，
#       供站点内 /w/status「服务器状态」页读取（约 1 分钟内可见）。

set -eu

SRC="${SRC:-/srv/blog}"
GIT_DIR_SRC="${GIT_DIR_SRC:-/srv/blog.git}"
REMOTE="${RCLONE_REMOTE:-bg:/blog}"
STATUS_FILE="${STATUS_FILE:-$SRC/data/backup-status.json}"

START_MS=$(date +%s%3N)
RESULT_LOG=$(mktemp)
trap 'rm -f "$RESULT_LOG"' EXIT

# 两步 rclone 的输出先收进日志文件（最后再原样打到 stdout，journald 里仍然看得到）；
# 这里临时关掉 -e，好在失败时也能记下状态并保留退出码。
set +e
{
	echo "[backup] worktree $SRC -> $REMOTE/site"
	rclone sync "$SRC" "$REMOTE/site" \
		--exclude "node_modules/**" \
		--exclude ".next/**" \
		--exclude "*.tmp-*" \
		--exclude "dev.log" \
		--log-level INFO

	echo "[backup] bare repo $GIT_DIR_SRC -> $REMOTE/git"
	rclone sync "$GIT_DIR_SRC" "$REMOTE/git" \
		--log-level INFO

	# 网盘后端不保留 mtime、也不提供哈希，rclone 只能按体积判断是否变化：
	# git 的引用文件（HEAD / refs/heads/*）恒为 41 字节 → 会被当成“没变”而永远跳过，这里强制重传
	if [ -f "$GIT_DIR_SRC/HEAD" ]; then
		rclone copyto --ignore-times "$GIT_DIR_SRC/HEAD" "$REMOTE/git/HEAD" --log-level INFO || echo "[backup] 警告：HEAD 重传失败"
	fi
	if [ -d "$GIT_DIR_SRC/refs" ]; then
		rclone copy --ignore-times "$GIT_DIR_SRC/refs" "$REMOTE/git/refs" --log-level INFO || echo "[backup] 警告：refs 重传失败"
	fi
	# data/ 里的小 json 也可能“改了但体积不变”（阅读计数、状态文件等）→ 强制重传（地区库 65MB 不传）
	if [ -d "$SRC/data" ]; then
		rclone copy --ignore-times "$SRC/data" "$REMOTE/site/data" --exclude "geoip/**" --log-level INFO || echo "[backup] 警告：data/ 重传失败"
	fi

	# ── 全量归档快照 ──────────────────────────────────────────────
	# 纯 WebDAV 不支持哈希、也不支持设置修改时间 → rclone 只能按体积判断，
	# 同体积的改动会被当成“没变”而跳过；归档文件名带时间戳，每次都是“新文件”，
	# 一定会上传，并且可以用 SHA256SUMS 校验完整性。
	# 123 云盘客服确认上传无单文件大小限制（2026-10-04）→ 直接单个 tar.gz，不再分卷。
	STAMP=$(date +%Y%m%d-%H%M)
	ARCHIVE_DIR=$(mktemp -d)
	echo "[backup] 归档快照 $STAMP（site + git，单文件，保留最近 30 份）"
	# data/ 里的 json 会被运行中的容器不停改写，tar 读到「文件发生了变化」只是
	# 警告级（输出仍然完整）→ 用 --warning=no-file-changed 消掉，退出码 1 也不算失败。
	tar -czf "$ARCHIVE_DIR/blog-site-$STAMP.tar.gz" -C "$SRC" \
		--exclude "./node_modules" --exclude "./.next" --exclude "./dev.log" \
		--exclude "./*.tmp-*" --warning=no-file-changed . \
		|| echo "[backup] 警告：site 归档失败"
	tar -czf "$ARCHIVE_DIR/blog-git-$STAMP.tar.gz" \
		-C "$(dirname "$GIT_DIR_SRC")" "$(basename "$GIT_DIR_SRC")" \
		--warning=no-file-changed \
		|| echo "[backup] 警告：git 归档失败"
	( cd "$ARCHIVE_DIR" && sha256sum ./*.tar.gz > "SHA256SUMS-$STAMP.txt" ) \
		|| echo "[backup] 警告：生成校验和失败"
	rclone copy --ignore-times --transfers 3 "$ARCHIVE_DIR" "$REMOTE/archive" --log-level INFO \
		|| echo "[backup] 警告：归档上传失败"
	# 轮转：site / git 按时间戳分组，各保留最近 30 组
	for prefix in "blog-site-" "blog-git-"; do
		rclone lsf "$REMOTE/archive" --files-only 2>/dev/null \
			| grep "^${prefix}" | sed -e "s/^${prefix}//" -e 's/\.tar\.gz.*$//' | sort -u \
			| head -n -30 \
			| while read -r old; do
				rclone lsf "$REMOTE/archive" --files-only 2>/dev/null \
					| grep "^${prefix}${old}" \
					| while read -r file; do
						rclone deletefile "$REMOTE/archive/$file" --log-level INFO || true
					done
			done
	done
	# 校验和文件保留最近 30 份
	rclone lsf "$REMOTE/archive" --files-only 2>/dev/null \
		| grep "^SHA256SUMS-" | sort | head -n -30 \
		| while read -r old; do
			rclone deletefile "$REMOTE/archive/$old" --log-level INFO || true
		done
	# 归档清单（供 /w/backup 页面读取）：第一行是生成时间，之后每行 "modtime|size|name"
	{
		date -Iseconds
		rclone lsf "$REMOTE/archive" --files-only --format "ts" --separator "|" 2>/dev/null || true
	} > "$SRC/data/backup-index.txt" || echo "[backup] 警告：写入 backup-index.txt 失败"

	rm -rf "$ARCHIVE_DIR"

	echo "[backup] 完成"
} >"$RESULT_LOG" 2>&1
CODE=$?
# 只信「块内最后一条命令」的退出码是不够的：很多失败只写在日志里（比如云盘授权失效时，
# 前两条 rclone 都报 401 但脚本仍会往下走完）→ 扫一遍日志，出现 rclone 的 ERROR /
# "Failed to ..." 或我们自己的「警告：」就判定这次备份失败（退出码 1、状态 ok=false）。
# 注意：tar 读 data/（容器正在写）时的「文件发生了变化」是良性警告（归档仍完整），
# 已在 tar 命令上消掉；这里再排一遍，免得别的写法再把它带进来。
if grep -v -e "文件发生了变化" -e "file changed as we read it" "$RESULT_LOG" 2>/dev/null \
	| grep -q -e "警告：" -e "ERROR" -e "Failed to"; then
	CODE=1
fi
set -e

# 云盘授权失效是最常见的失败原因，单独补一句能照着做的提示（会进 logTail，站点 /w/status 上能看到）
if grep -q "401 Unauthorized" "$RESULT_LOG" 2>/dev/null; then
	printf '\n[backup] 云盘授权失效（401）→ 去 123云盘「工具中心 → 第三方挂载 → WebDAV 授权管理」重新生成应用密码，\n' >> "$RESULT_LOG"
	printf '[backup] 再在服务器执行 sudo rclone config update bg --webdav-user <账号> --webdav-pass <新密码>，然后手动跑一次本脚本。\n' >> "$RESULT_LOG"
fi

cat "$RESULT_LOG"

END_MS=$(date +%s%3N)
DURATION_MS=$((END_MS - START_MS))

if [ "$CODE" -eq 0 ]; then
	OK=true
else
	OK=false
	echo "[backup] 失败：退出码 $CODE（详见上面的 rclone 输出）" >&2
fi

# logTail：优先带上真正的错误行（ERROR / 警告 / Failed to），否则取最后 6 行；
# 压成一行、转义引号与反斜杠、截断到 900 字符
ERR_LINES=$(grep -n -e "警告：" -e "ERROR" -e "Failed to" -e "401" "$RESULT_LOG" 2>/dev/null | tail -n 4)
if [ -n "$ERR_LINES" ]; then
	LOG_TAIL=$(printf '%s\n%s\n' "$ERR_LINES" "$(tail -n 2 "$RESULT_LOG" 2>/dev/null)")
else
	LOG_TAIL=$(tail -n 6 "$RESULT_LOG" 2>/dev/null)
fi
LOG_TAIL=$(printf '%s' "$LOG_TAIL" | tr '\n\t' '  ' | tr -d '\000-\010\013\014\016-\037' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | cut -c1-900)

mkdir -p "$(dirname "$STATUS_FILE")"
printf '{\n  "at": "%s",\n  "ok": %s,\n  "durationMs": %s,\n  "logTail": "%s"\n}\n' \
	"$(date -Iseconds)" "$OK" "$DURATION_MS" "$LOG_TAIL" > "$STATUS_FILE.tmp"
mv "$STATUS_FILE.tmp" "$STATUS_FILE"

echo "[backup] 状态已写入 $STATUS_FILE（ok=$OK，耗时 ${DURATION_MS}ms）"

exit "$CODE"
