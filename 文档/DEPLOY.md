# 部署指南

> 这份文档写给「拿到本仓库、想部署成自己的站点」的人。
> 文中的域名、IP、路径都是占位（`example.com`、`10.0.0.2`、`/srv/blog`），照抄前先替换成你自己的。
> 仓库里不含任何真实域名、服务器地址、账号或密钥 —— 站点身份全部走环境变量（见 §4）。

## 目录

0. [三分钟速览](#0-三分钟速览)
1. [这是什么](#1-这是什么)
2. [前置条件](#2-前置条件)
3. [拿到源码](#3-拿到源码)
4. [配置 .env](#4-配置-env)
5. [本地跑起来](#5-本地跑起来)
6. [方式一：Docker Compose（推荐）](#6-方式一docker-compose推荐)
7. [方式二：不用 Docker](#7-方式二不用-docker)
8. [反向代理](#8-反向代理)
9. [进阶：应用在家 + 公网机只做反代](#9-进阶应用在家--公网机只做反代)
10. [写作与内容](#10-写作与内容)
11. [git push 自动部署](#11-git-push-自动部署)
12. [评论（giscus）](#12-评论giscus)
13. [工作站 /w（全部可选）](#13-工作站-w全部可选)
14. [备份与恢复](#14-备份与恢复)
15. [升级与回滚](#15-升级与回滚)
16. [安全清单](#16-安全清单)
17. [常见问题](#17-常见问题)
18. [许可与致谢](#18-许可与致谢)

---

## 0. 三分钟速览

```bash
git clone <你的仓库地址> blog && cd blog
cp .env.example .env
$EDITOR .env            # 至少填 ADMIN_USERNAME / ADMIN_PASSWORD / AUTH_SECRET
docker compose up -d --build
curl -I http://127.0.0.1:3000     # 期望 200
```

然后：域名解析到这台机器 → 反向代理（§8）→ 浏览器打开 → `/login` 登录 → 开始写文章（§10）。
想连 `git push` 就自动部署，再加 §11 那套 bare 仓库钩子。

---

## 1. 这是什么

一个「纯文件 + 一台服务器」的个人博客，外加一个可选的私人工作站：

- **公开站**：文章（Markdown）、归档 / 标签 / 系列 / 友链、RSS / sitemap / robots / OG 分享图
- **后台 `/admin`**：网页分屏编辑器（登录后可见），粘贴图片即上传
- **工作站 `/w`**（登录后可见，可选）：服务器状态、机器体检、阅读统计、素材台、元器件库存、ESP32 OTA、内嵌 MQTT、备份浏览、热点、片段、项目文档
- **没有数据库**：`content/`（内容）与 `data/`（运行时 JSON）就是全部数据，备份 = 复制目录

运行时只有一个 Node 进程（Next.js standalone）：

```
浏览器 ──HTTPS──▶ Caddy / Nginx ──▶ 127.0.0.1:3000   Next.js (standalone)
                                          ├─ content/  Markdown（改动热更新，不用重启）
                                          ├─ data/     运行时 JSON（阅读量、设置、体检…）
                                          └─ 可选：18830 MQTT / 18831 MQTT over WebSocket
```

---

## 2. 前置条件

| 项目 | 要求 |
| --- | --- |
| 服务器 | Linux（Debian / Ubuntu 为例），1 核 1G 起；Docker 24+ 与 compose 插件 |
| 或者 | 不用 Docker：Node 20+（推荐 22/24）+ pnpm 11 |
| 域名 | 可选但强烈建议；HTTPS 由反向代理自动签 |
| 端口 | 3000（站点，默认只绑本机）；18830 / 18831（可选，MQTT 与 MQTT-WS） |
| 磁盘 | 代码 + 依赖约 1G；文章与图片看你写多少 |

---

## 3. 拿到源码

```bash
git clone <你的仓库地址> /srv/blog && cd /srv/blog
# 或者下载 ZIP 解压到 /srv/blog
```

主要目录：

```
app/            页面与路由（公开站、/admin、/w、RSS/sitemap/OG）
components/     UI 组件（components/ui 是 shadcn 源码）
lib/            内容解析、搜索、认证、MQTT、库存、备份状态…
content/posts/  文章（Markdown，唯一数据源）
content/pages/  单页：关于 / 免责声明 / 隐私政策 / 开源说明
content/images/ 图片（默认不进 git，见 §10.4）
data/           运行时数据（不进 git）
deploy/         钩子、Caddy 样例、备份与体检的 systemd 单元
文档/           文档（容器只读挂载，工作站 /w/docs 会浏览这里）
```

---

## 4. 配置 .env

`.env.example` 是带注释的完整样例；复制成 `.env`（Docker 部署）或 `.env.local`（本地开发）。
两个文件都已被 gitignore，**不要提交**。

### 4.1 必填

| 变量 | 说明 |
| --- | --- |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | 后台登录账号，请改成你自己的强口令 |
| `AUTH_SECRET` | 会话签名密钥，随机长串：`openssl rand -hex 32` |

### 4.2 站点身份（**留空即隐藏**，不会出现空链接或空白块）

| 变量 | 作用 |
| --- | --- |
| `SITE_NAME` | 站点名（导航 / 页脚 / 元信息 / RSS），默认「我的博客」 |
| `SITE_SLOGAN` | 一句话口号（页脚 / llms.txt） |
| `SITE_URL` | 站点地址（RSS / sitemap / 分享 / 友链模板；末尾不带斜杠） |
| `SITE_START_DATE` | 建站日 `YYYY-MM-DD`（页脚「建站 N 天」） |
| `SITE_GITHUB` | GitHub 用户名（关于页 / 友链 / 侧栏卡片） |
| `SITE_ICP` / `SITE_POLICE` / `SITE_POLICE_CODE` | ICP / 公安备案号与查询码（页脚） |

> ⚠️ 备案号与域名绑定：没有备案就**留空**，不要借用他人的备案号。

### 4.3 可选能力

| 变量 | 作用 |
| --- | --- |
| `COMMENTS_REPO` / `COMMENTS_REPO_ID` / `COMMENTS_CATEGORY` / `COMMENTS_CATEGORY_ID` | giscus 评论（§12）；任一为空则文章页不显示评论区 |
| `GITHUB_TOKEN` | 提高侧栏 GitHub 卡片的接口限额 |
| `GEOIP_URL` | MaxMind GeoLite2 数据库下载地址；留空则访客地区不解析 |
| `IMGTOOL_SSH` / `IMGTOOL_SITE` / `IMGTOOL_REMOTE` | 本地素材工具 `pnpm imgtool` 用（ssh 上传图片到服务器） |

### 4.4 工作站 /w（不用就留空 / false）

| 变量 | 作用 |
| --- | --- |
| `MQTT_ENABLED` / `MQTT_PORT` / `MQTT_WS_ENABLED` / `MQTT_WS_PORT` / `MQTT_WS_PATH` | 内嵌 MQTT broker（设备上报 / 下发） |
| `OTA_TOKEN` | ESP32 OTA 拉固件时的校验令牌；留空则不校验（**公网部署建议填**） |
| `BIND_ADDR` | 宿主机端口绑定地址，默认 `127.0.0.1`（只给反代用） |
| `TZ` | 容器时区，默认 `Asia/Shanghai`，影响按天统计与日志时间 |
| `NPM_REGISTRY` | 构建时的 npm 源，默认 `https://registry.npmmirror.com` |

---

## 5. 本地跑起来

```bash
pnpm install            # 慢就加 --registry=https://registry.npmmirror.com
cp .env.example .env.local
$EDITOR .env.local      # 填 ADMIN_USERNAME / ADMIN_PASSWORD / AUTH_SECRET
pnpm dev                # http://localhost:3000
```

- 后台：`http://localhost:3000/login`，用 `.env.local` 里的账号登录
- 内容体检：`pnpm check:content`（文章数、可见性分布、年份与标签统计）
- 推送前过门禁：`pnpm lint && pnpm build`

---

## 6. 方式一：Docker Compose（推荐）

### 6.1 首次启动

```bash
cd /srv/blog
cp .env.example .env && $EDITOR .env
docker compose up -d --build
docker compose ps
curl -I http://127.0.0.1:3000
```

镜像基于 `node:24-alpine`，多阶段构建、产出 Next.js standalone，最终镜像只带运行时。

### 6.2 挂载了什么

| 宿主机 | 容器 | 说明 |
| --- | --- | --- |
| `./content` | `/app/content` | 文章、单页、图片（改完即生效，不用重建） |
| `./data` | `/app/data` | 运行时数据：阅读量、站点设置、体检记录、AI 报告… |
| `./文档` | `/app/文档:ro` | 只读，工作站 `/w/docs` 浏览 |
| `/sys/class/hwmon` | `/sys/class/hwmon:ro` | 宿主机温度传感器，供 `/w` 显示 CPU / 主板温度 |

> 非 Linux（或没有 `/sys/class/hwmon` 的环境）请把最后一行删掉，否则容器起不来。
> 不需要工作站的话，只保留前两行也能跑。

### 6.3 端口与绑定

- 站点：`${BIND_ADDR:-127.0.0.1}:3000`
- MQTT：`18830`（TCP）、`18831`（WebSocket，公网走反代的 `/mqtt-ws`）
- 默认只监听本机，外网必须经反向代理 —— 这是有意的安全默认值
- 让容器直接对外（例如组网隧道）：在 `.env` 里把 `BIND_ADDR` 设成隧道网卡 IP

### 6.4 更新

```bash
cd /srv/blog
git pull --rebase
docker compose up -d --build
docker compose logs -f --tail=100 web
```

- **只改文章 / 图片**：不用重建，`content/` 是挂载进去的，服务端的 watcher 会自动重建索引
- **改了代码 / 依赖 / 配置**：必须 `up -d --build`

### 6.5 国内构建加速

Dockerfile 与 compose 默认用 `registry.npmmirror.com`；要用官方源：

```bash
NPM_REGISTRY=https://registry.npmjs.org docker compose build
```

---

## 7. 方式二：不用 Docker

小机器（或想省 Docker）可以直接跑 Node：

```bash
corepack enable          # 或自行安装 pnpm 11
pnpm install --frozen-lockfile
pnpm build               # 产出 .next/standalone
cp .env.example .env && $EDITOR .env
pnpm start               # 或 node .next/standalone/server.js
```

交给 systemd 常驻（`/etc/systemd/system/blog.service`）：

```ini
[Unit]
Description=blog
After=network-online.target
Wants=network-online.target

[Service]
WorkingDirectory=/srv/blog
EnvironmentFile=/srv/blog/.env
Environment=NODE_ENV=production PORT=3000 HOSTNAME=127.0.0.1 NODE_OPTIONS=--dns-result-order=ipv4first
ExecStart=/usr/bin/pnpm start
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload && systemctl enable --now blog && systemctl status blog
```

> 非 Docker 部署时，`.env` 由 systemd 注入；注意 `pnpm start` 需要 `node_modules`，别把它清掉。

---

## 8. 反向代理

### 8.1 Caddy（推荐，自动 HTTPS）

仓库里给了样例：[`deploy/Caddyfile.example`](../deploy/Caddyfile.example)。最小可用：

```
example.com {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000
}
```

```bash
caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy
```

开了 MQTT over WebSocket 的话再加一段（路径要和 `.env` 的 `MQTT_WS_PATH` 一致）：

```
example.com {
	encode zstd gzip

	# 设备走 wss://example.com/mqtt-ws/
	handle /mqtt-ws* {
		reverse_proxy 127.0.0.1:18831
	}

	handle {
		reverse_proxy 127.0.0.1:3000
	}
}
```

### 8.2 Nginx 要点

```nginx
server {
    listen 443 ssl http2;
    server_name example.com;

    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
    client_max_body_size 64m;      # 后台上传图片

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;        # MQTT-WS 需要
        proxy_set_header Connection "upgrade";
    }
}
```

### 8.3 三个容易漏的点

1. **压缩**：反代层开 `encode` / `gzip`，这是收益最大的一步
2. **HTTPS**：不套 HTTPS 的话，后台登录口令是明文传输的
3. **只绑本机**：保持 `BIND_ADDR=127.0.0.1`，公网只开 80/443

---

## 9. 进阶：应用在家 + 公网机只做反代

家宽通常没有公网 IPv4，可选的两种玩法：

- **家里有公网 IPv6**：域名 AAAA 直接指向家里，公网机可以不参与
- **组网隧道**（EasyTier / Tailscale / ZeroTier）或内网穿透（frp）：应用留在家里，公网机只跑反代

组网方案步骤：

1. 家里服务器与公网机加入同一虚拟网络，记下家里那台的**隧道 IP**（例：`10.0.0.2`）
2. 家里 `.env` 设 `BIND_ADDR=10.0.0.2`，`docker compose up -d`（让 3000 端口监听在隧道网卡上）
3. 公网机 Caddy：`reverse_proxy 10.0.0.2:3000`（见 `deploy/Caddyfile.example`）
4. 公网机防火墙只放 80/443；家里路由器不用做端口映射

> 坑：家宽有 IPv6 而 Docker 默认桥没有 IPv6 出口时，Node 可能先试 IPv6 导致部分外链抓取失败。
> compose 里已经设了 `NODE_OPTIONS=--dns-result-order=ipv4first`，自建 systemd 部署时也建议带上。

---

## 10. 写作与内容

### 10.1 一篇文章长什么样

`content/posts/hello-world.md`（仓库自带一个样例）：

```markdown
---
title: "文章标题"
date: 2026-01-01
tags: [标签一, 标签二]
description: "一句话摘要，用于列表、SEO、分享卡片"
visibility: public
---

正文用 Markdown（支持 GFM 表格、任务列表、脚注、代码高亮）。
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `title` | 是 | 标题 |
| `date` | 是 | `YYYY-MM-DD`，决定归档顺序 |
| `tags` | 否 | 数组，标签云与标签页 |
| `description` | 否 | 摘要，列表 / SEO / 分享卡片用 |
| `visibility` | 否 | `public` 公开 / `login` 仅登录可见 / `draft` 草稿；**不写按草稿处理** |
| `series` | 否 | 系列名，用于系列页 |
| `updated` | 否 | 最后更新日期 |

### 10.2 可见性三态

- `public`：所有人可见，进 RSS / sitemap / 搜索
- `login`：登录后才可见（例如私人备忘），不进公开索引
- `draft`：登录后可预览，公开访问 404

### 10.3 单页

`content/pages/` 下四个文件（about / privacy / disclaimer / opensource）对应页脚链接，
只有 `title` 与 `description` 两个 frontmatter 字段。删掉某个文件对应链接就会 404，所以要么留着，要么同时改掉页脚。

### 10.4 图片

图片默认 **不进 git**（`/content/images/*` 已 gitignore）。三种用法：

1. **后台粘贴**：`/admin` 编辑器里直接粘贴，上传到 `content/images/`
2. **素材台 `pnpm imgtool`**：本地起一个小页面，走 ssh 把图片传到服务器，顺带管 alt 文本与回收站（需要 `IMGTOOL_*`）
3. **手动**：`scp` 到 `content/images/`，正文里用 `/images/xxx.png` 引用

> 想让图片跟随 git 一起走，把 `.gitignore` 里 `content/images/*` 那两行删掉即可（仓库会变大）。

### 10.5 网页后台

`/admin` 登录后：文章列表（含阅读量、可见性）、分屏编辑器、图片粘贴上传、站点设置（存在 `data/site.json`）、
草稿预览。网页端的改动用 §11 的钩子会自动回流到 git。

---

## 11. git push 自动部署

目标：本地 `git push` → 服务器检出 + 按需重建容器。

### 11.1 服务器上建 bare 仓库与工作副本

```bash
# 1) 裸仓库（接收推送）
mkdir -p /srv/blog.git && git init --bare /srv/blog.git

# 2) 工作副本（跑容器的目录）
mkdir -p /srv/blog
git --git-dir=/srv/blog.git --work-tree=/srv/blog checkout -f main

# 3) 装钩子（仓库里就是这份脚本）
cp /srv/blog/deploy/post-receive.sh /srv/blog.git/hooks/post-receive
chmod +x /srv/blog.git/hooks/post-receive
```

### 11.2 本地指向服务器

```bash
git remote add origin ssh://<用户>@<服务器>/srv/blog.git
git push -u origin main
```

### 11.3 钩子做了什么

1. **回流网页端改动**：工作副本里未提交的改动（`/admin` 改的文章、上传的图片）先提交，再与本次推送三方合并
2. **检出**到 `/srv/blog`
3. **按路径决定是否重建容器**：命中 `app/`、`components/`、`lib/`、`public/`、`package.json`、`pnpm-lock.yaml`、`Dockerfile`、`docker-compose.yml`、`next.config.*`、`proxy.ts`、`instrumentation.ts` 等才重建；
   只改 `content/`、`文档/`、`deploy/` 则只检出，**不重建**（文章靠 watcher 热更新）
4. 每次决策写进 `data/deploy.log`，事后可查「为什么重建了 / 为什么没重建」

### 11.4 开关（推送时带上环境变量）

| 变量 | 作用 |
| --- | --- |
| `BLOG_SKIP_REBUILD=1` | 本次即使有代码改动也不重建（稍后手动重建） |
| `BLOG_FORCE_REBUILD=1` | 强制重建（例如只改了 `.env` 或 compose） |
| `BLOG_REBUILD_CMD=...` | 自定义重建命令，默认 `docker compose up -d --build` |
| `BLOG_GIT_DIR` / `BLOG_WORK_TREE` | 覆盖 bare 仓库与工作副本路径 |
| `BLOG_DEPLOY_LOG` | 部署日志路径，默认 `<工作副本>/data/deploy.log` |

```bash
# 例：改完 .env 想重载
BLOG_FORCE_REBUILD=1 git push
```

手动重建：`sh /srv/blog/deploy/rebuild.sh`

### 11.5 两个坑

- **推送被拒（non-fast-forward）**：说明服务器端有网页改动被钩子提交过，先 `git pull --rebase` 再推
- **改了钩子不生效**：`deploy/post-receive.sh` 只是源文件，改完要重新 `cp` 到 `hooks/`（钩子自己会打印提醒）

---

## 12. 评论（giscus）

评论基于 GitHub Discussions，不需要自己的后端：

1. 建一个**公开**仓库专门放评论（例：`your-name/blog-comments`）
2. 该仓库 `Settings → General → Features` 勾上 **Discussions**，并建一个分类（如 `Announcements`）
3. 给仓库安装 [giscus app](https://github.com/apps/giscus)
4. 打开 <https://giscus.app/zh-CN>，填入仓库与分类，得到四个值
5. 写进 `.env` 后重建：`COMMENTS_REPO` / `COMMENTS_REPO_ID` / `COMMENTS_CATEGORY` / `COMMENTS_CATEGORY_ID`

任一为空 → 文章页不渲染评论区（不会报错、不会留空白）。

---

## 13. 工作站 /w（全部可选）

登录后导航出现「工作站」。一半页面读**运行它的那台机器**，一半是**给站长自己用的数据**；
不配置对应变量就没有那些数据，**公开站完全不受影响**。

| 页面 | 依赖 | 说明 |
| --- | --- | --- |
| 服务器状态 | — | CPU / 内存 / 磁盘 / 温度 / 容器与备份状态 |
| 机器体检 | `deploy/health-sample.py` + timer | 每小时采一行 JSON 到 `data/health.jsonl`，看趋势 |
| 阅读统计 | — | 按文章 / 访客流水（可脱敏 IP 导出 CSV） |
| 素材台 | `IMGTOOL_*`（本地）/ 后台 | 图片上传、alt 文本、回收站 |
| 元器件库存 | — | 库存台账（`data/` 下的 JSON） |
| ESP32 OTA | `OTA_TOKEN` | 上传固件、解析版本、设备按 URL 拉取 |
| MQTT | `MQTT_ENABLED` / `MQTT_PORT` / `MQTT_WS_*` | 内嵌 broker，给设备发账号、收上报 |
| 备份浏览 | 备份脚本 | 看最近备份结果与日志尾巴 |
| 热点 / 片段 / 项目文档 | `GEOIP_URL`（地区）/ `文档/` | 公开接口聚合、备忘、浏览 `文档/` |

启用机器体检（可选）：

```bash
cp /srv/blog/deploy/blog-health.service /etc/systemd/system/
cp /srv/blog/deploy/blog-health.timer   /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now blog-health.timer
```

> 脚本只读 `/proc`、`/sys/class/hwmon`、`df`、`lsblk`、`smartctl`，除 `data/health.jsonl` 外不写任何东西。
> 没有 `smartctl`（smartmontools）也能跑，只是硬盘温度那一项为空。

---

## 14. 备份与恢复

### 14.1 要备份什么

```
/srv/blog/content      文章、单页、图片
/srv/blog/data         阅读量、站点设置、体检记录…
/srv/blog/.env         配置（含密钥，注意存放安全）
/srv/blog.git          裸仓库（保住完整 git 历史）
```

### 14.2 rclone 同步到网盘

`deploy/backup-rclone.sh` 会把工作副本与裸仓库同步到任意 rclone 远端（WebDAV / S3 / 对象存储），
并额外打一份带时间戳的 `tar.gz` 全量快照 + `SHA256SUMS`，按份数轮转。

```bash
rclone config                     # 先配好远端，例如名字叫 bg
cp /srv/blog/deploy/blog-backup.service /etc/systemd/system/
cp /srv/blog/deploy/blog-backup.timer   /etc/systemd/system/
$EDITOR /etc/systemd/system/blog-backup.service   # 改 RCLONE_REMOTE / SRC / GIT_DIR_SRC
systemctl daemon-reload && systemctl enable --now blog-backup.timer
systemctl start blog-backup.service && journalctl -u blog-backup -n 50
```

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `RCLONE_REMOTE` | `bg:/blog` | rclone 远端路径 |
| `SRC` | `/srv/blog` | 工作副本 |
| `GIT_DIR_SRC` | `/srv/blog.git` | 裸仓库 |
| `STATUS_FILE` | `$SRC/data/backup-status.json` | 结果状态，`/w/status` 会显示 |

> 打包时容器还在写 `data/`，`tar` 会报「文件发生了变化」—— 这是**良性警告**，
> 脚本用 `--warning=no-file-changed` 忽略它，不要让它导致整次备份失败。

### 14.3 恢复

```bash
tar -xzf blog-site-YYYYMMDD-HHMM.tar.gz -C /srv/blog      # 解开快照
docker compose up -d --build                              # 起容器
# 网页里的阅读量、设置、库存都随 data/ 一起回来了
```

> 恢复前先停容器（`docker compose down`），避免边写边覆盖。

---

## 15. 升级与回滚

```bash
# 升级
cd /srv/blog && git pull --rebase && docker compose up -d --build

# 回滚（内容与 data/ 不受影响）
git log --oneline -10
git reset --hard <旧提交>
docker compose up -d --build
```

- `content/`、`data/`、`.env` 都不在镜像里，重建不会丢数据
- 没有数据库，所以也没有迁移脚本要跑
- 镜像构建失败时旧容器不会被替换（compose 是「构建成功才替换」），站点不会中断

---

## 16. 安全清单

- [ ] 改掉默认 `ADMIN_USERNAME` / `ADMIN_PASSWORD`，口令别复用
- [ ] `AUTH_SECRET` 用随机长串（`openssl rand -hex 32`）
- [ ] `.env` 不进 git（仓库已 gitignore），也不要在 issue / 截图里漏出来
- [ ] 反代套 HTTPS；服务器只开 80/443，站点端口保持 `BIND_ADDR=127.0.0.1`
- [ ] 后台 `/admin` 与工作站 `/w` 都要求登录（中间件已强制）
- [ ] 公开接口有按 IP 限流（天气、浏览量等），但**不要在反代后面关掉真实 IP 传递**，否则限流失效
- [ ] `OTA_TOKEN` 公网部署时必填，否则任何人都能拉固件
- [ ] MQTT 给每台设备单独账号（工作站里管理），不要共用
- [ ] 备份含 `.env`，云端目录权限收紧；重要站点建议加密后再传
- [ ] 定期 `git log --stat` 看看有没有把密钥写进代码

---

## 17. 常见问题

| 现象 | 原因与处理 |
| --- | --- |
| 文章 404 | 确认文件在 `content/posts/`、`visibility` 是 `public`（`login` 要登录、`draft` 仅自己可见） |
| 评论区不显示 | `COMMENTS_*` 四个值没填全（任一为空即不渲染） |
| 页脚没有备案号 | `SITE_ICP` / `SITE_POLICE` 留空即隐藏（有意设计） |
| 侧栏 GitHub 卡片不显示 | `SITE_GITHUB` 为空 |
| `docker compose up` 报挂载失败 | 环境没有 `/sys/class/hwmon`（非 Linux），删掉 compose 里那行 |
| 构建时 corepack 拉 pnpm 超时 | 换源：`NPM_REGISTRY=https://registry.npmmirror.com`（默认已是） |
| `pnpm install` 报 `ERR_PNPM_IGNORED_BUILDS` | `pnpm-workspace.yaml` 里已设 `strictDepBuilds: false`；若你改过配置请保留它 |
| `git push` 被拒 | 服务器端有网页改动，先 `git pull --rebase` |
| 改了 `deploy/post-receive.sh` 没生效 | 重新 `cp` 到 `/srv/blog.git/hooks/post-receive` 并 `chmod +x` |
| 备份一直失败 | 看 `data/backup-status.json` 的 `logTail`，常见是网盘授权失效（401） |
| 页面时间不对 | 设 `TZ`（compose 默认 `Asia/Shanghai`） |
| 设备连不上 MQTT-WS | 反代要转发 `Upgrade` 头，且路径与 `MQTT_WS_PATH` 一致 |
| 改了 `SITE_*` 不生效 | 这些变量在容器启动时读取：`docker compose up -d`（改了 `.env` 要重建容器） |

---

## 18. 许可与致谢

- 本仓库代码：**MIT**（见 [LICENSE](../LICENSE)），可自由使用、修改、分发
- 文章、图片等**内容不在本仓库里**：请写你自己的；不要把别人的文章搬过来
- 直接引用 / 改写的开源项目与运行时依赖清单：见 [content/pages/opensource.md](../content/pages/opensource.md)
- 分享卡片字体「得意黑 Smiley Sans」：SIL OFL 1.1，见 [public/fonts/README.md](../public/fonts/README.md)

> 若你部署时发现某处许可标注不当，欢迎提 issue 补正。
