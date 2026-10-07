# 部署指南（从零开始，一步一步）

> 这份文档写给**第一次部署**的人：每一步都写清楚「在哪里敲什么命令」「正常应该看到什么」「不对怎么办」。
> 不需要你懂 Docker 或 Linux 运维，照着做就行。
>
> 文中出现的 `example.com`、`203.0.113.10`、`/srv/blog` 都是**占位符**，请替换成你自己的域名、服务器 IP、目录。
> 本仓库不含任何真实域名、服务器地址、账号或密钥 —— 站点身份全部通过环境变量（`.env`）填写。

## 怎么读这份文档

- 命令块上方都会标明**在哪里执行**：`【服务器】` 表示 SSH 登录服务器后执行，`【本地】` 表示在你自己电脑上执行
- 每一步末尾有 **✅ 验收**：看到那个结果才算这步做对了；不符合就先看紧跟的「不对怎么办」
- 只想快点跑起来：做完 **第 0 ~ 6 章**（约 40 分钟）就能在浏览器里打开自己的站点，第 7 章之后是「让它变成你的」「自动化」「备份」等
- 全程只用两条线：**服务器**（跑站点）和**你自己的电脑**（写文章、推送）

## 目录

- [第 0 章 开工前：你需要准备什么](#第-0-章-开工前你需要准备什么)
- [第 1 章 连上服务器](#第-1-章-连上服务器)
- [第 2 章 装 Docker](#第-2-章-装-docker)
- [第 3 章 把代码放到服务器](#第-3-章-把代码放到服务器)
- [第 4 章 写配置文件 .env](#第-4-章-写配置文件-env)
- [第 5 章 第一次启动](#第-5-章-第一次启动)
- [第 6 章 域名与 HTTPS](#第-6-章-域名与-https)
- [第 7 章 把站点变成你自己的](#第-7-章-把站点变成你自己的)
- [第 8 章 写第一篇文章](#第-8-章-写第一篇文章)
- [第 9 章 接上 git push 自动部署](#第-9-章-接上-git-push-自动部署)
- [第 10 章 图片与素材](#第-10-章-图片与素材)
- [第 11 章 评论区（giscus）](#第-11-章-评论区giscus)
- [第 12 章 备份](#第-12-章-备份)
- [第 13 章 日常运维](#第-13-章-日常运维)
- [第 14 章 安全检查清单](#第-14-章-安全检查清单)
- [第 15 章 故障排查大全](#第-15-章-故障排查大全)
- [附录 A 不用 Docker 的部署方式](#附录-a-不用-docker-的部署方式)
- [附录 B 应用在家、公网机只做反代](#附录-b-应用在家公网机只做反代)
- [附录 C 环境变量全表](#附录-c-环境变量全表)
- [附录 D 工作站 /w 逐项开启](#附录-d-工作站-w-逐项开启)
- [附录 E 目录与文件说明](#附录-e-目录与文件说明)
- [附录 F 常用命令速查](#附录-f-常用命令速查)
- [附录 G 许可与致谢](#附录-g-许可与致谢)

---

## 第 0 章 开工前：你需要准备什么

### 0.1 必备清单

| 需要的东西 | 说明 | 大概花费 |
| --- | --- | --- |
| 一台 Linux 服务器 | 1 核 1G 内存、20G 硬盘就够跑；系统选 **Debian 12** 或 **Ubuntu 22.04/24.04** | 轻量云约 10-30 元/月 |
| 一个域名 | 可选，但没有域名就只能用 IP 访问、且没法自动签 HTTPS 证书 | 约 10-70 元/年 |
| 你自己的电脑 | Windows / macOS / Linux 都行，用来写文章、推送代码 | — |
| 一个 Git 托管账号 | 可选，用 GitHub / Gitee 存代码，方便换电脑和多人协作 | 免费 |

### 0.2 买好服务器后，先记下三样东西

1. **服务器公网 IP**（形如 `203.0.113.10`）
2. **root 密码**（或你创建的用户名 + 密码）
3. **SSH 端口**（默认 22，有些商家会改成别的）

> 大多数云厂商控制台里都有「重置密码」和「安全组 / 防火墙」两个入口，后面第 6 章要用到安全组。

### 0.3 域名要做什么

到你的域名服务商（阿里云 / 腾讯云 / Cloudflare / Namecheap 等）的 **DNS 解析**页面，添加一条记录：

| 记录类型 | 主机记录 | 记录值 | 说明 |
| --- | --- | --- | --- |
| `A` | `@` | 你的服务器 IP | 让 `example.com` 指向服务器 |
| `A` | `www` | 你的服务器 IP | 让 `www.example.com` 也指向服务器（可选） |

解析生效一般几分钟到几小时。第 6 章会给你一条命令验证。

### 0.4 四个名词，一句话解释

| 名词 | 一句话 |
| --- | --- |
| **容器 / Docker** | 把程序和它需要的环境打包成一个「盒子」，服务器上不用装 Node、不用配环境，一条命令就能跑 |
| **反向代理** | 站在门口的接待员：外面访问 `https://example.com`，它转发给屋里 3000 端口的程序，顺便负责 HTTPS 证书 |
| **HTTPS 证书** | 浏览器地址栏那把锁。Caddy 会自动免费申请和续期，你不用买 |
| **bare 仓库** | 一个「只存历史、没有工作文件的 git 仓库」，用来接收你的 `git push`，再自动更新服务器上的代码 |

### 0.5 全程路线图

| 阶段 | 做什么 | 章节 | 耗时 |
| --- | --- | --- | --- |
| 一 | 连上服务器、装 Docker | 第 1-2 章 | 10 分钟 |
| 二 | 上传代码、写配置、启动 | 第 3-5 章 | 15 分钟 |
| 三 | 域名 + HTTPS，浏览器能打开 | 第 6 章 | 10 分钟 |
| 四 | 改成自己的站点、写文章 | 第 7-8 章 | 10 分钟 |
| 五 | 自动化部署、备份、评论（可选） | 第 9-12 章 | 20 分钟 |

---

## 第 1 章 连上服务器

### 1.1 打开终端

- **Windows**：按 `Win` 键，输入 `powershell`，回车（Win10/11 自带）
- **macOS**：打开「终端」
- **Linux**：打开终端

### 1.2 登录服务器

【本地】把 IP 换成你自己的：

```bash
ssh root@203.0.113.10
```

第一次连接会问：

```
The authenticity of host ... can not be established.
Are you sure you want to continue connecting (yes/no/[fingerprint])?
```

输入 `yes` 回车（这是首次确认服务器指纹，正常现象），然后输入密码。**输入密码时屏幕上不会显示任何字符**，这正常，输完直接回车。

✅ **验收**：提示符变成 `root@主机名:~#` 或类似，说明已经进到服务器里了。

### 1.3 不对怎么办

| 报错 | 原因 | 处理 |
| --- | --- | --- |
| `Connection refused` | 端口不对 / SSH 服务没开 | 确认商家给的 SSH 端口，用 `ssh -p 2222 root@IP` 指定 |
| `Connection timed out` | 安全组没放行 22 端口 | 到云厂商控制台的安全组里放行 22 端口 |
| `Permission denied (publickey)` | 商家默认只允许密钥登录 | 控制台里绑定密钥，或重置为密码登录 |
| 一直卡住不动 | 网络问题 | 换手机热点试试；国内访问境外服务器可能不稳 |

### 1.4 （推荐）改用密钥登录，以后不用输密码

【本地】生成一对密钥（一路回车即可，已有可跳过）：

```bash
ssh-keygen -t ed25519 -C "my-blog"
```

【本地】把公钥传到服务器（会要一次密码）：

```bash
ssh-copy-id root@203.0.113.10
```

Windows 若提示没有 `ssh-copy-id`，用这条替代（把公钥内容追加到服务器）：

```powershell
type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh root@203.0.113.10 "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

✅ **验收**：再执行一次 `ssh root@203.0.113.10`，不再问密码直接进入。

---

## 第 2 章 装 Docker

以下命令全部在 **服务器** 上执行（除非标注【本地】）。

### 2.1 更新系统软件列表

```bash
apt update && apt upgrade -y
```

### 2.2 一条命令装 Docker（含 compose 插件）

这是 Docker 官方提供的一键安装脚本：

```bash
curl -fsSL https://get.docker.com | sh
```

- 国内服务器如果卡在下载，多试两次；或改用国内镜像脚本（自行搜索「Docker 安装 国内镜像」，命令会随镜像站变化，这里不写死）
- 安装结束后 Docker 会自动启动

### 2.3 验证装好了

```bash
docker --version
docker compose version
systemctl is-active docker
```

✅ **验收**：

```
Docker version 27.x.x, build xxxxx
Docker Compose version v2.x.x
active
```

三行都要有输出，第三行必须是 `active`。

### 2.4 换国内镜像加速（可选，拉镜像慢时做）

```bash
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<EOF
{
  "registry-mirrors": ["https://docker.m.daocloud.io"]
}
EOF
systemctl restart docker
docker info | grep -A2 "Registry Mirrors"
```

> 镜像加速地址经常失效，失效就删掉 `daemon.json` 里的那一行并 `systemctl restart docker`，直接用官方源。

### 2.5 顺带确认 git 在（一般自带）

```bash
git --version
```

没有就装：`apt install -y git`。

### 2.6 不对怎么办

| 报错 | 处理 |
| --- | --- |
| `curl: command not found` | `apt install -y curl` |
| `docker: command not found` | 安装脚本没跑完，重跑 2.2；仍不行看脚本最后几行报错 |
| `Cannot connect to the Docker daemon` | `systemctl start docker && systemctl enable docker` |
| `docker compose` 提示不是命令 | 装 compose 插件：`apt install -y docker-compose-plugin` |

---

## 第 3 章 把代码放到服务器

目标：把仓库内容放到服务器的 `/srv/blog` 目录（目录名可自定，后面所有命令要保持一致）。

### 3.1 方式 A：从 Git 仓库拉（推荐）

适合：代码已经在 GitHub / Gitee / 你自己的服务器上。

```bash
mkdir -p /srv && cd /srv
git clone https://github.com/你的用户名/你的仓库.git blog
```

私有仓库需要输入用户名和 token（GitHub 的密码方式已停用，要用 Personal Access Token）。

### 3.2 方式 B：从自己电脑上传

【本地】把整个目录传上去（Windows 用 PowerShell，路径换成你的）：

```powershell
scp -r D:\my_project\blog root@203.0.113.10:/srv/blog
```

> 传之前先把 `node_modules`、`.next` 删掉，能省几百 MB；这两个目录本来也不需要上传。

### 3.3 方式 C：网页下载压缩包

在仓库页面点「Download ZIP」下载到本地，再用 WinSCP / FileZilla / 宝塔面板上传解压到 `/srv/blog`。

### 3.4 验收：确认关键文件都在

```bash
cd /srv/blog && ls
```

✅ **验收**：至少能看到这些名字：

```
app  components  content  data  deploy  lib  public  scripts  文档
Dockerfile  docker-compose.yml  package.json  pnpm-lock.yaml  .env.example
```

再确认两个目录存在（后面会往里写数据）：

```bash
ls -d /srv/blog/content /srv/blog/data
```

---

## 第 4 章 写配置文件 .env

`.env` 是整个站点的「身份证 + 密码本」：站点叫什么、域名是什么、后台账号是什么，全在这里填。
仓库里带了完整样例 `.env.example`，我们复制一份再改。

### 4.1 复制样例

【服务器】

```bash
cd /srv/blog
cp .env.example .env
```

### 4.2 用 nano 编辑（最简单的编辑器）

```bash
nano .env
```

nano 只要记三条：方向键移动光标；`Ctrl` + `O` 再回车是保存；`Ctrl` + `X` 是退出。

> 不习惯 nano 也可以用 `vi .env`：按 `i` 进入编辑，改完按 `Esc`，输入 `:wq` 回车保存退出。

### 4.3 必填的三项

| 变量 | 填什么 |
| --- | --- |
| `ADMIN_USERNAME` | 后台登录用户名，例如 `admin`（建议改成别人猜不到的） |
| `ADMIN_PASSWORD` | 后台登录密码，一定不要留 `change-me` |
| `AUTH_SECRET` | 会话签名密钥，随机长串，生成方法见下 |

【服务器】生成随机密钥，复制输出的那一串：

```bash
openssl rand -hex 32
```

输出形如 `7f3c1a9e...`（64 位十六进制），整段粘到 `.env` 的 `AUTH_SECRET=` 后面。改完大致是：

```env
ADMIN_USERNAME=myadmin
ADMIN_PASSWORD=一个你自己记得住的强密码
AUTH_SECRET=7f3c1a9e5b2d4867a0c3e91f7b2d4867a0c3e91f7b2d4867a0c3e91f7b2d4867
```

### 4.4 站点身份（留空就自动隐藏，不会出现空链接）

| 变量 | 作用 | 例子 |
| --- | --- | --- |
| `SITE_NAME` | 站点名（导航 / 页脚 / 浏览器标题） | `我的技术笔记` |
| `SITE_SLOGAN` | 一句话口号（页脚） | `记录折腾与踩坑` |
| `SITE_URL` | 站点完整地址，末尾不要带斜杠 | `https://example.com` |
| `SITE_START_DATE` | 建站日期，页脚算「建站 N 天」 | `2026-01-01` |
| `SITE_GITHUB` | 你的 GitHub 用户名（侧栏卡片） | `yourname` |
| `SITE_ICP` | ICP 备案号 | 没有就留空 |
| `SITE_POLICE` / `SITE_POLICE_CODE` | 公安备案号与查询码 | 没有就留空 |

> ⚠️ 备案号与域名绑定：没有备案就留空，不要借用别人的备案号。

### 4.5 可选能力（先不管，后面章节再回来填）

```env
# 评论（第 11 章）
COMMENTS_REPO=
COMMENTS_REPO_ID=
COMMENTS_CATEGORY=Announcements
COMMENTS_CATEGORY_ID=

# GitHub 卡片接口限额（可选）
GITHUB_TOKEN=

# 访客地区解析（可选）
GEOIP_URL=
```

### 4.6 端口与工作站（不用工作站就保持默认）

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `BIND_ADDR` | `127.0.0.1` | 端口只绑本机，由反向代理转发；不要轻易改成 0.0.0.0 |
| `TZ` | `Asia/Shanghai` | 容器时区，影响日志时间与按天统计 |
| `MQTT_ENABLED` | `false` | 内嵌 MQTT broker，给 ESP32 之类设备用 |
| `OTA_TOKEN` | 空 | 设备拉固件的校验令牌，公网部署建议填 |

### 4.7 验收

【服务器】

```bash
grep -E "^(ADMIN_USERNAME|ADMIN_PASSWORD|AUTH_SECRET|SITE_NAME|SITE_URL)=" .env
chmod 600 .env
```

✅ **验收**：五行都打印出来，`AUTH_SECRET` 不是样例里的那串占位文字。

**不对怎么办**：值两边不要加引号、不要留空格、不要用中文标点，否则程序读到的就是错的值。

---

## 第 5 章 第一次启动

### 5.1 构建并启动

【服务器】

```bash
cd /srv/blog
docker compose up -d --build
```

会发生什么：拉取 `node:24-alpine` 基础镜像 → 安装依赖（几百 MB，第一次通常 5-15 分钟，国内已默认走 npmmirror）→ 执行构建 → 启动容器。

看到 `Container blog-web-1 Started` 之类字样就成功了。

### 5.2 看状态

```bash
docker compose ps
```

✅ **验收**：

```
NAME        IMAGE        STATUS         PORTS
blog-web-1  blog:latest  Up 30 seconds  127.0.0.1:3000->3000/tcp
```

`STATUS` 必须是 `Up`；显示 `Restarting` 或 `Exited` 就看下一节的日志。

### 5.3 看日志

```bash
docker compose logs --tail=50 web
```

✅ **验收**：末尾能看到 `Ready in xxx ms` 或 `Listening on` 之类字样，且没有反复刷的错误堆栈。

### 5.4 本机验证

```bash
curl -I http://127.0.0.1:3000
```

✅ **验收**：第一行是 `HTTP/1.1 200 OK`。

### 5.5 失败排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 构建时报 `ERR_PNPM_` | 依赖下载失败 | 重跑一次；或在 `.env` 里设 `NPM_REGISTRY=https://registry.npmjs.org` 换官方源 |
| 报挂载 `/sys/class/hwmon` 失败 | 非 Linux 或没有该目录 | 编辑 `docker-compose.yml`，删掉 `/sys/class/hwmon:/sys/class/hwmon:ro` 那一行 |
| `address already in use` | 3000 端口被占用 | 用 `ss -lntp` 找到占用 3000 的进程，或改 `.env` 里的端口 |
| 容器起来又退出 | 配置错误 | `docker compose logs --tail=100 web` 看最后一段报错 |
| `No space left on device` | 磁盘不够 | `df -h` 查看；`docker system prune -a` 清理无用镜像 |

### 5.6 常用操作

```bash
docker compose logs -f web      # 实时日志（Ctrl+C 退出）
docker compose restart web      # 重启容器
docker compose down             # 停止并删除容器（content/ 与 data/ 里的数据不会丢）
docker compose up -d            # 重新启动
docker compose up -d --build    # 改代码后重建镜像并启动
```

> 容器已设置 `restart: unless-stopped`，服务器重启后站点会自动起来。

---

## 第 6 章 域名与 HTTPS

### 6.1 确认域名解析生效

【本地】把域名换成你的：

```bash
nslookup example.com
```

✅ **验收**：`Address` 那一行是你服务器的 IP。

不对就回域名服务商检查 A 记录；刚加的记录可能要等几分钟到几小时。

### 6.2 装 Caddy

【服务器】以下是 Caddy 官方 Debian / Ubuntu 安装步骤，逐条执行：

```bash
apt install --yes debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg
chmod o+r /etc/apt/sources.list.d/caddy-stable.list
apt update
apt install -y caddy
```

```bash
caddy version
systemctl is-active caddy
```

✅ **验收**：打印版本号，第二行是 `active`。

> Debian 12 / Ubuntu 24.04 的官方源里也可能直接带 caddy：先试 `apt install -y caddy`，装上且版本不低于 2.7 就不必用 cloudsmith 那几条。

### 6.3 写 Caddyfile

【服务器】先备份，再写入配置（把 `example.com` 换成你的域名）：

```bash
cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak
cat > /etc/caddy/Caddyfile <<EOF
example.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000
}
EOF
```

三行的含义：

- `example.com`：域名，Caddy 看到就自动申请并续期 HTTPS 证书
- `encode zstd gzip`：开启压缩，网页体积明显变小
- `reverse_proxy 127.0.0.1:3000`：把请求转给第 5 章启动的程序

> 想同时支持 `www.example.com`，第一行写成：`example.com, www.example.com {`
> 更完整的样例（含 MQTT over WebSocket、「应用在家」两种场景）见 [../deploy/Caddyfile.example](../deploy/Caddyfile.example)。

### 6.4 检查并生效

```bash
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

✅ **验收**：`validate` 打印 `Valid configuration`。

### 6.5 打开网站

【本地】浏览器访问 `https://example.com`；或在服务器上：

```bash
curl -I https://example.com
```

✅ **验收**：`HTTP/2 200`，浏览器地址栏有锁标志。

### 6.6 放行 80 / 443 端口

两处都要放行，缺一个都打不开：

```bash
# 服务器本机防火墙（用 ufw 的系统）
ufw allow 80
ufw allow 443
ufw status
```

另一处是云厂商控制台的**安全组 / 防火墙**：添加规则放行 TCP 80 与 443，来源 `0.0.0.0/0`。

### 6.7 打不开怎么排查

| 现象 | 处理 |
| --- | --- |
| 一直转圈超时 | 安全组没放行 80/443，或域名没解析到这台机器 |
| 显示 Caddy 默认欢迎页 | Caddyfile 域名写错，或改完没 `systemctl reload caddy` |
| 证书申请失败 | `journalctl -u caddy -n 50` 看日志；常见原因是域名未解析、80 端口被 Nginx/Apache 占用 |
| `502 Bad Gateway` | 后端没起来：`docker compose ps` 看容器，`curl -I http://127.0.0.1:3000` 试本机 |
| `Failed to connect` | Caddy 没启动：`systemctl status caddy` |

### 6.8 换用 Nginx

要点（证书用 certbot 申请）：

```nginx
server {
    listen 443 ssl http2;
    server_name example.com;

    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
    client_max_body_size 64m;            # 后台上传图片需要

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d example.com
```

---

## 第 7 章 把站点变成你自己的

### 7.1 登录后台

浏览器打开 `https://example.com/login`，用 `.env` 里的 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 登录。

✅ **验收**：登录后导航栏出现「工作站」入口，右上角显示已登录状态。

登不上怎么办：确认 `.env` 里三项都填了、没有多余空格；改完 `.env` 后必须 `docker compose up -d` 让容器重新读取。

### 7.2 改站点名、域名、备案号

这些都属于「启动时读取」的环境变量，改法是固定三步：

```bash
cd /srv/blog
nano .env                 # 改 SITE_NAME / SITE_URL / SITE_ICP ...
docker compose up -d      # 让新配置生效（不必 --build）
```

✅ **验收**：刷新首页，导航与页脚变成你填的名字；页脚出现建站天数。

### 7.3 站点设置页（换头像、背景、侧栏挂件）

登录后进 `/admin` → 设置：

| 项目 | 说明 |
| --- | --- |
| 头像 / logo / favicon | 填文件路径，文件放 `public/` 下，例如 `/avatar.jpg` |
| 背景图 / 背景视频 | 同上；背景支持模糊与压暗参数 |
| 侧栏挂件 | 文章页 / 列表页分别配置左、右两栏显示哪些卡片 |

设置保存在 `data/site.json`（不进 git，但会随 `data/` 一起备份）。

### 7.4 放自己的图片文件

【服务器】把 `avatar.jpg`、`logo.png` 之类放进 `public/`：

```bash
ls /srv/blog/public
```

可以用 `scp` 从本地上传：

```powershell
scp D:\图片\avatar.jpg root@203.0.113.10:/srv/blog/public/
```

✅ **验收**：刷新页面，头像/logo 变成你自己的（浏览器强刷 `Ctrl` + `F5`）。

---

## 第 8 章 写第一篇文章

文章就是 `content/posts/` 目录下的 `.md` 文件。**写完保存即生效**，不用重启、不用重新构建。

### 8.1 方式一：在服务器上直接写

```bash
cd /srv/blog/content/posts
nano 我的第一篇文章.md
```

把下面内容粘进去（`title` / `date` 必填）：

```markdown
---
title: "我的第一篇文章"
date: 2026-01-01
tags: [随笔]
description: "这篇文章用来测试站点是否正常工作。"
visibility: public
---

正文从这一行开始，支持 Markdown 语法。

## 二级标题

- 列表项
- 列表项

```

保存退出（`Ctrl` + `O` 回车，`Ctrl` + `X`）。

✅ **验收**：刷新首页，文章出现；点进去能打开，代码块有高亮。

### 8.2 方式二：网页后台写

`/admin` → 新建文章 → 左侧写 Markdown、右侧实时预览 → 保存。

网页端写的文章同样落到 `content/posts/`，而且接线后（第 9 章）会自动提交进 git。

### 8.3 方式三：本地写 + git push（长期推荐）

在你的电脑上 clone 一份仓库：

```bash
git clone ssh://root@203.0.113.10/srv/blog.git
cd blog
```

用 VS Code 打开这个目录，在 `content/posts/` 里新建 `.md`，写完后：

```bash
git add -A
git commit -m "content: 新增一篇文章"
git push
```

配合第 9 章的钩子，服务器会自动检出并热更新（内容改动不重建容器）。

### 8.4 frontmatter 字段表

文件开头两个 `---` 之间就是 frontmatter：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `title` | 是 | 标题 |
| `date` | 是 | `YYYY-MM-DD`，决定归档顺序 |
| `tags` | 否 | 数组：`[标签一, 标签二]` |
| `description` | 否 | 摘要，列表页 / SEO / 分享卡片用 |
| `visibility` | 否 | `public` 公开、`login` 仅登录可见、`draft` 草稿；**不写按草稿处理** |
| `series` | 否 | 系列名，用于系列页聚合 |
| `updated` | 否 | 更新日期 |

### 8.5 可见性三态怎么用

| 值 | 谁能看 | 用途 |
| --- | --- | --- |
| `public` | 所有人 | 正常发布；进 RSS / sitemap / 搜索 |
| `login` | 只有登录的你 | 私人笔记，不进公开索引 |
| `draft` | 只有登录的你 | 写到一半的草稿（默认值，安全兜底） |

### 8.6 文章不显示？按这个顺序查

1. 文件在不在 `content/posts/`，后缀是不是 `.md`
2. `visibility` 是不是 `public`
3. `date` 是不是写成了未来的日期（排序会跑到最前面）
4. frontmatter 的两个 `---` 有没有写全（少一个就整篇解析失败）
5. 看日志有没有解析报错：`docker compose logs --tail=50 web`

---

## 第 9 章 接上 git push 自动部署

目标：本地 `git push` 之后，服务器自动更新代码，并在**必要时**重建容器。

### 9.1 原理（30 秒看懂）

```
你的电脑 ──push──▶ /srv/blog.git（裸仓库，只存历史）
                        │  post-receive 钩子触发
                        ├─▶ 把网页端改动先提交、与本次推送合并（回流）
                        ├─▶ 检出文件到 /srv/blog（容器的挂载目录）
                        └─▶ 只有代码变了才 docker compose up -d --build
```

为什么要裸仓库：容器用的是 `/srv/blog` 目录，用一个「不带工作区」的仓库收推送，才不会和容器正在读的目录打架。

### 9.2 服务器：建裸仓库

【服务器】

```bash
git init --bare -b main /srv/blog.git
```

### 9.3 本地：把代码推上去

【本地】在你的仓库目录里执行（IP 换成你的）：

```bash
git remote add origin ssh://root@203.0.113.10/srv/blog.git
git push -u origin main
```

✅ **验收**：推送成功（这时还没有钩子，服务器上只有裸仓库里的历史）。

### 9.4 服务器：装钩子 + 首次检出

钩子脚本就在你刚推上去的代码里（`deploy/post-receive.sh`），两条命令取出来装上：

```bash
git --git-dir=/srv/blog.git show main:deploy/post-receive.sh > /srv/blog.git/hooks/post-receive
chmod +x /srv/blog.git/hooks/post-receive
```

然后把代码检出到工作副本（容器挂载的就是这个目录）：

```bash
mkdir -p /srv/blog
git --git-dir=/srv/blog.git --work-tree=/srv/blog checkout -f main
ls /srv/blog
```

✅ **验收**：`ls` 能看到 `app`、`components`、`content`、`Dockerfile` 等文件。

### 9.5 验证自动化

【本地】随便改一篇文章（比如加一行字）后：

```bash
git commit -am "content: 测试自动部署"
git push
```

【服务器】看文件变没变、日志说了什么：

```bash
grep -c "测试" /srv/blog/content/posts/xxx.md
tail -5 /srv/blog/data/deploy.log
```

✅ **验收**：`deploy.log` 里出现一行 `SKIP（仅内容/文档）` —— 说明内容改动**没有**触发重建（这是对的，文章靠热更新）。

再改一个代码文件（比如 `app/` 下的任意文件）推一次，日志应出现：

```
REBUILD NEW=xxxx 命中: app/xxx.ts
```

### 9.6 钩子到底做了什么

| 步骤 | 说明 |
| --- | --- |
| 1. 回流 | 工作副本里未提交的改动（`/admin` 改的文章、上传的图片）先提交，再与本次推送三方合并 |
| 2. 检出 | `git checkout -f main` 更新 `/srv/blog` |
| 3. 按需重建 | 命中代码路径才重建容器；只改内容/文档就跳过 |
| 4. 记日志 | 每次决策追加到 `data/deploy.log` |

会触发重建的路径：`app/`、`components/`、`lib/`、`public/`、`package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`next.config.*`、`tsconfig.json`、`postcss.config.*`、`Dockerfile`、`docker-compose.yml`、`.dockerignore`、`proxy.ts`、`instrumentation.ts`、`components.json`。

### 9.7 网页端改动会「回流」，所以推送可能被拒

你在 `/admin` 改的内容会在下一次推送时被钩子提交成一个 commit，并产生一个合并提交。于是**本地就落后于服务器了**，下一次 `git push` 会被拒绝：

```
! [rejected]        main -> main (fetch first)
hint: Updates were rejected because the remote contains work that you do not have locally.
```

这不是故障，处理办法就一条：

```bash
git pull --rebase
git push
```

> 习惯上：**每次 push 前先 `git pull --rebase`**，就不会被拒。

### 9.8 开关：跳过 / 强制重建

| 变量 | 作用 |
| --- | --- |
| `BLOG_SKIP_REBUILD=1` | 本次即使有代码改动也不重建（先部署文件，稍后手动重建） |
| `BLOG_FORCE_REBUILD=1` | 强制重建（例如只改了 `.env`、想重载容器） |
| `BLOG_REBUILD_CMD=...` | 换掉默认重建命令 `docker compose up -d --build` |
| `BLOG_GIT_DIR` / `BLOG_WORK_TREE` | 覆盖裸仓库 / 工作副本路径（默认 `/srv/blog.git`、`/srv/blog`） |

> ⚠️ 通过 SSH 推送时，**客户端的环境变量默认不会传到服务器**（sshd 只接受白名单变量），所以 `BLOG_SKIP_REBUILD=1 git push` 通常不会生效。两个办法：
>
> 1. 简单可靠：需要时直接在服务器上执行 `sh /srv/blog/deploy/rebuild.sh`（手动重建），或推送后再跑一次 `docker compose up -d --build`
> 2. 想用环境变量：客户端 `~/.ssh/config` 里加 `SendEnv BLOG_SKIP_REBUILD BLOG_FORCE_REBUILD BLOG_REBUILD_CMD`，服务器 `/etc/ssh/sshd_config` 里加 `AcceptEnv BLOG_*`，然后 `systemctl restart ssh`

### 9.9 钩子相关排错

| 现象 | 处理 |
| --- | --- |
| 推送成功但服务器文件没变 | 钩子没装或没执行权限：`ls -l /srv/blog.git/hooks/post-receive` 必须是 `-rwxr-xr-x` |
| 推送后报权限错误 | 钩子要以能写 `/srv/blog` 的用户运行；`chown -R 你的用户 /srv/blog /srv/blog.git` |
| 改了 `deploy/post-receive.sh` 却不生效 | 它只是源文件，改完要重新 `cp`/重装到 `hooks/post-receive`（钩子自己会打印这条提醒） |
| 合并冲突 | 钩子会保留服务器端提交并中止：按提示 `cd /srv/blog && git merge <提交>` 手工解决 |

---

## 第 10 章 图片与素材

### 10.1 先理解一件事：图片默认不进 git

仓库的 `.gitignore` 里有这两行：

```gitignore
/content/images/*
!/content/images/.gitkeep
```

意思是：图片放在服务器上，不跟着代码走。原因是图片多起来之后 git 仓库会非常臃肿，推送、克隆都变慢。

> ⚠️ 副作用：**图片必须单独备份**（第 12 章），否则服务器坏了图片就没了。

### 10.2 方式一：后台粘贴上传（最省事）

登录 `/admin` → 打开文章编辑 → 直接把图片**粘贴**到编辑器里（或拖进来），它会自动上传到 `content/images/` 并插入链接。

### 10.3 方式二：从本机直接上传

【本地】

```powershell
scp D:\图片\screenshot.png root@203.0.113.10:/srv/blog/content/images/
```

正文里引用：

```markdown
![图片说明](/images/screenshot.png)
```

### 10.4 方式三：本地素材台（图片多时推荐）

仓库自带一个小工具，起在本地、通过 ssh 直接把图片传到服务器，还能管 alt 文本与回收站。

【本地】在你的工作副本里配置 `.env.local`：

```env
IMGTOOL_SSH=root@203.0.113.10
IMGTOOL_SITE=https://example.com
IMGTOOL_REMOTE=/srv/blog/content/images
```

然后启动：

```bash
pnpm imgtool
```

Windows 上也可以直接双击仓库根目录的 `图片工具.bat`，它会自动打开浏览器界面。

### 10.5 引用图片的两种写法

```markdown
![说明文字](/images/xxx.png)          # 站内图片（推荐：有 alt，利于无障碍与 SEO）
![说明文字](https://图床地址/xxx.png)   # 外链图床
```

小技巧：图片想控制大小，用 HTML 也可以：`<img src="/images/xxx.png" width="600" alt="说明">`。

### 10.6 如果你就是想让图片进 git

把 `.gitignore` 里那两行删掉，`git add content/images` 即可。代价是仓库会越来越大，图片多的时候不建议。

---

## 第 11 章 评论区（giscus）

评论用的是 giscus：把评论存到 GitHub Discussions 里，不需要自己的数据库。**任何一步没配全，评论区就不显示**（页面不会报错）。

### 11.1 建一个专门放评论的公开仓库

1. 打开 <https://github.com/new>
2. 名字填 `blog-comments`（随便取），**必须选 Public**（giscus 需要公开仓库）
3. 勾选 `Add a README file`，点 Create

### 11.2 给这个仓库开 Discussions

1. 进入该仓库 → 上方 `Settings`
2. 找到 `Features` 一栏 → 勾选 `Discussions`
3. 进入仓库的 `Discussions` 标签页 → 左侧分类旁的编辑入口 → 确认有一个 `Announcements` 分类（没有就新建一个，类型选 Announcements）

### 11.3 安装 giscus App

1. 打开 <https://github.com/apps/giscus> → `Install`
2. 选择 `Only select repositories` → 选中刚建的 `blog-comments` → 确认

### 11.4 去 giscus.app 生成四个值

打开 <https://giscus.app/zh-CN>，按页面从上往下填：

| 页面上的项目 | 怎么填 | 对应到 `.env` 的变量 |
| --- | --- | --- |
| 仓库 | 填 `你的用户名/blog-comments`，页面会校验通过 | `COMMENTS_REPO` |
| Discussion 分类 | 选 `Announcements` | `COMMENTS_CATEGORY` |
| 页面 ↔ Discussion 映射 | 保持默认 `pathname` | — |

填完后页面下方「启用 giscus」区域会给出一段配置，里面有两个 id：

| 配置里的字段 | 对应到 `.env` |
| --- | --- |
| `data-repo-id` | `COMMENTS_REPO_ID` |
| `data-category-id` | `COMMENTS_CATEGORY_ID` |

### 11.5 填进 .env 并生效

【服务器】

```bash
cd /srv/blog
nano .env
```

```env
COMMENTS_REPO=yourname/blog-comments
COMMENTS_REPO_ID=R_kgDOxxxxxxx
COMMENTS_CATEGORY=Announcements
COMMENTS_CATEGORY_ID=DIC_kwDOxxxxxxxx
```

```bash
docker compose up -d
docker compose logs --tail=20 web
```

✅ **验收**：打开任意一篇文章，页面底部出现评论区（第一次会提示用 GitHub 登录并创建 discussion）。

### 11.6 不显示怎么查

| 现象 | 处理 |
| --- | --- |
| 完全没有评论区 | 四个变量有没有空着的；`.env` 改完有没有 `docker compose up -d` |
| 提示 `giscus is not installed` | 11.3 那步没做，或 App 没勾选这个仓库 |
| 提示 `Discussion not found` | 11.2 的分类不对，或分类是 `General` 而不是 `Announcements` |
| 控制台报 403 | 评论仓库是私有的；改成 Public |

---

## 第 12 章 备份

### 12.1 要备份的四样东西

| 备份什么 | 路径 | 丢了会怎样 |
| --- | --- | --- |
| 文章与图片 | `/srv/blog/content` | 文章、图片全没 |
| 运行时数据 | `/srv/blog/data` | 阅读量、站点设置、库存、体检记录没了 |
| 配置 | `/srv/blog/.env` | 要重新填一遍（含后台密码） |
| git 历史 | `/srv/blog.git` | 提交历史没了（内容还在） |

> 如果图片没进 git（默认如此），**content/images 是唯一副本** —— 这就是备份最重要的原因。

### 12.2 装 rclone 并配一个远端

【服务器】

```bash
curl https://rclone.org/install.sh | bash
rclone version
```

配置（交互式，按提示回答）：

```bash
rclone config
```

典型流程：

1. 输入 `n`（新建远端）
2. `name` 输入 `bg`（名字随便，记住它就行）
3. `Storage` 里选你的网盘类型（例如 `webdav`、`s3`、`sftp`、`onedrive` 等，输入前面的编号）
4. 按提示填地址、账号、密码
5. 一路回车到最后 `Keep this remote? y`
6. 输入 `q` 退出

✅ **验收**：

```bash
rclone lsd bg:
```

能列出目录（空也行）就说明配好了。

### 12.3 手动跑一次备份脚本

仓库里带了脚本 `deploy/backup-rclone.sh`：它把工作副本与裸仓库同步到远端，并额外打一份带时间戳的 `tar.gz` 快照 + `SHA256SUMS`，按份数轮转。

```bash
cd /srv/blog
RCLONE_REMOTE=bg:/blog sh deploy/backup-rclone.sh
```

✅ **验收**：

```bash
cat data/backup-status.json
rclone lsf bg:/blog | head
```

能看到 `ok: true` 与远端文件。

### 12.4 挂成定时任务（每 4 小时）

```bash
cp /srv/blog/deploy/blog-backup.service /etc/systemd/system/
cp /srv/blog/deploy/blog-backup.timer /etc/systemd/system/
nano /etc/systemd/system/blog-backup.service   # 按需改 RCLONE_REMOTE / SRC / GIT_DIR_SRC
systemctl daemon-reload
systemctl enable --now blog-backup.timer
systemctl list-timers | grep blog
```

看结果：

```bash
journalctl -u blog-backup -n 50 --no-pager
systemctl start blog-backup.service      # 立刻跑一次
```

### 12.5 恢复（真的演练一次）

**只恢复文章和数据**（最常见）：

```bash
docker compose down
rclone copy bg:/blog/site/content /srv/blog/content
rclone copy bg:/blog/site/data    /srv/blog/data
docker compose up -d
```

**用快照恢复整站**：

```bash
rclone copy bg:/blog/archive ./restore
ls ./restore
tar -xzf ./restore/blog-site-YYYYMMDD-HHMM.tar.gz -C /srv/blog
docker compose up -d --build
```

**换一台服务器重建**：装 Docker → 恢复 `/srv/blog` 与 `/srv/blog.git` → `docker compose up -d --build` → 改 DNS 指向新机。

### 12.6 备份失败的常见原因

| 现象 | 处理 |
| --- | --- |
| `401 Unauthorized` | 网盘授权过期，重跑 `rclone config` 重新授权 |
| 一直提示文件变化 | `data/` 被容器持续写入导致的**良性警告**，脚本已用 `--warning=no-file-changed` 忽略 |
| 状态文件显示失败 | `cat data/backup-status.json` 里的 `logTail` 有具体报错 |
| 备份太慢/配额超限 | 排除 `node_modules`、`.next`（脚本已排除）；清理远端旧快照 |

---

## 第 13 章 日常运维

### 13.1 更新站点

```bash
cd /srv/blog
git pull --rebase                       # 同步最新代码（先做，避免被拒）
docker compose up -d --build           # 重建并重启
docker compose logs --tail=30 web
```

- 只改了文章/图片：**不用**重建，钩子会检出，站点热更新
- 改了 `.env`：`docker compose up -d`（不需要 `--build`）

### 13.2 回滚到上一个版本

```bash
cd /srv/blog
git log --oneline -10                  # 找到要回到的提交
git reset --hard <提交号>
docker compose up -d --build
```

`content/`、`data/`、`.env` 不在镜像里，回滚代码**不会**丢文章与数据。

### 13.3 看资源与清理

```bash
df -h                                  # 磁盘
free -h                                # 内存
docker stats --no-stream               # 容器占用
docker system df                       # 镜像/缓存占用
docker system prune -a                 # 清理无用镜像与缓存（会中断正在跑的容器？不会，但会删掉未使用的镜像）
```

### 13.4 改端口 / 改绑定地址

| 想干什么 | 怎么做 |
| --- | --- |
| 站点端口换 8080 | 编辑 `docker-compose.yml` 的端口映射，或改 `.env` 后 `up -d`；反代里的端口同步改 |
| 让组网能直连 | `.env` 设 `BIND_ADDR=<隧道网卡 IP>`，`docker compose up -d`（见[附录 B](#附录-b-应用在家公网机只做反代)） |
| 改 MQTT 端口 | `.env` 的 `MQTT_PORT` 与 `docker-compose.yml` 保持一致 |

### 13.5 HTTPS 证书要不要管

不用。Caddy 会在到期前自动续期。想确认：

```bash
journalctl -u caddy -n 30 --no-pager | grep -i -E "renew|certificate"
```

### 13.6 日志占满磁盘怎么办

Docker 默认按 `json-file` 记录且不限制大小。长期跑建议给容器加限制：在 `docker-compose.yml` 的 `web` 服务下加

```yaml
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

然后 `docker compose up -d`。

---

## 第 14 章 安全检查清单

部署完，对照这张表过一遍（每一条都能在本文找到对应章节）：

- [ ] `ADMIN_PASSWORD` 不是 `change-me`，也不和其他站点复用（第 4 章）
- [ ] `AUTH_SECRET` 是 `openssl rand -hex 32` 生成的随机串（第 4 章）
- [ ] `.env` 权限 `600`，且**没有**提交进 git（第 4 章 / 第 9 章）
- [ ] 站点端口只绑 `127.0.0.1`，外网只开 80 / 443（第 6 章）
- [ ] HTTPS 正常、证书自动续期（第 6 章）
- [ ] `/admin` 与 `/w` 未登录时会被跳到 `/login`（第 7 章）
- [ ] 反代转发了真实 IP（`X-Forwarded-For`），否则接口限流形同虚设（第 6.8 节）
- [ ] 用 ESP32 OTA 的话 `OTA_TOKEN` 非空（附录 D）
- [ ] MQTT 给每台设备单独账号，不共用（附录 D）
- [ ] 备份在跑，且**真的恢复演练过一次**（第 12 章）
- [ ] 备份里含 `.env`，所以云端目录权限要收紧（第 12 章）
- [ ] 定期看一眼 `git log --stat`，确认没把密钥写进代码

---

## 第 15 章 故障排查大全

| 症状 | 先做什么 | 常见原因 |
| --- | --- | --- |
| 网站打不开（超时） | `curl -I http://127.0.0.1:3000` | 安全组没放行、域名没解析、Caddy 没启动 |
| 502 Bad Gateway | `docker compose ps` + 上面那条 curl | 容器挂了或没起来 |
| 网页样式全乱 | 浏览器 `Ctrl` + `F5` 强刷 | 静态资源缓存 |
| 文章 404 | 看 `visibility` 与文件名 | 不是 `public`、或 frontmatter 写坏 |
| 文章不更新 | `docker compose logs --tail=30 web` | 文件没同步到服务器、watcher 报错 |
| 评论区不显示 | `grep COMMENTS_ /srv/blog/.env` | 四个变量没配全 |
| 后台登录不上 | 改 `.env` 后 `docker compose up -d` | 变量没生效、密码里有空格 |
| 上传图片失败 | 看反代 `client_max_body_size` | Nginx 默认 1M 限制 |
| 构建失败 | `docker compose up -d --build` 的前 100 行输出 | 依赖下载失败、磁盘满 |
| 磁盘满 | `df -h` + `docker system prune -a` | 镜像与日志堆积 |
| 内存不足被杀 | `free -h`、`dmesg` | 1G 内存跑构建会紧张，建议加 swap |
| 时间不对 | `date`、`grep TZ .env` | 容器时区没设 |
| `git push` 被拒 | `git pull --rebase` | 服务器端有网页改动（第 9.7 节） |
| 推送成功但没重建 | `tail -5 data/deploy.log` | 只改了内容/文档（正常），或钩子没装 |
| 设备连不上 MQTT | `docker compose logs`（搜 mqtt） | `MQTT_ENABLED=false`、端口没放行 |
| 备份一直失败 | `cat data/backup-status.json` | 网盘授权过期 |

---

## 附录 A 不用 Docker 的部署方式

适合：机器很小、或者你就是不想装 Docker（比如已经用宝塔/1Panel 管理）。

### A.1 装 Node 与 pnpm

```bash
# Node 20 以上；用 nvm 或系统包都行，这里用 NodeSource 举例（Debian/Ubuntu）
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node -v            # 期望 v22.x
corepack enable    # 启用 pnpm（仓库锁定 pnpm 11）
pnpm -v
```

### A.2 装依赖并构建

```bash
cd /srv/blog
pnpm install --frozen-lockfile     # 慢就加 --registry=https://registry.npmmirror.com
cp .env.example .env && nano .env  # 同第 4 章
pnpm build
```

✅ **验收**：`.next` 目录生成，末尾无报错。

### A.3 先手工跑一次

```bash
pnpm start                         # 默认 3000 端口
curl -I http://127.0.0.1:3000      # 另开一个终端
```

### A.4 交给 systemd 常驻

```bash
nano /etc/systemd/system/blog.service
```

```ini
[Unit]
Description=blog
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/srv/blog
EnvironmentFile=/srv/blog/.env
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOSTNAME=127.0.0.1
Environment=NODE_OPTIONS=--dns-result-order=ipv4first
ExecStart=/usr/bin/pnpm start
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now blog
systemctl status blog --no-pager
```

> 注意：非 Docker 方式下 `pnpm start` 需要 `node_modules` 常驻，别执行 `pnpm store prune` 之后又删目录。
> 反过来，容器里跑的是 `.next/standalone`（自带精简依赖），两种方式的数据目录都是 `content/` 与 `data/`，可以互换。

---

## 附录 B 应用在家、公网机只做反代

适合：家里有台常开的机器（NAS / 小主机），但又没有公网 IPv4。

### B.1 三种常见做法

| 做法 | 说明 |
| --- | --- |
| 家里有公网 IPv6 | 域名加一条 `AAAA` 记录指向家里 IPv6 地址，公网机可以不参与（注意家里防火墙放行 80/443） |
| 虚拟组网 | EasyTier / Tailscale / ZeroTier 把两台机器连成一个虚拟内网，公网机反代到家里的虚拟 IP |
| 内网穿透 | frp / cloudflared / nps：家里主动连出去，公网机把流量转回来 |

下面以**虚拟组网**为例（其它两种只是把「虚拟 IP」换成「隧道地址」，步骤一样）。

### B.2 步骤

1. 【两台机器】都加入同一个虚拟网络，记下**家里那台的虚拟 IP**（例：`10.0.0.2`）
2. 【家里】在 `.env` 里设 `BIND_ADDR=10.0.0.2`，然后：

```bash
docker compose up -d
ss -lntp | grep 3000        # 应看到监听在 10.0.0.2:3000
```

3. 【公网机】装 Caddy（第 6.2 节），Caddyfile 写：

```
example.com {
    encode zstd gzip
    reverse_proxy 10.0.0.2:3000
}
```

4. 【公网机】只放行 80 / 443；家里路由器**不用**做端口映射

### B.3 两个坑

- **IPv6 优先导致外链抓取失败**：家宽有 IPv6 但 Docker 默认桥没有 IPv6 出口时，Node 可能先试 IPv6。compose 里已设 `NODE_OPTIONS=--dns-result-order=ipv4first`，手工部署（附录 A）也要带上。
- **DNS 解析**：域名指向公网机，不要指到家里（家宽 IP 会变）。

---

## 附录 C 环境变量全表

### C.1 必填

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `ADMIN_USERNAME` | `admin` | 后台用户名 |
| `ADMIN_PASSWORD` | `change-me` | 后台密码，务必修改 |
| `AUTH_SECRET` | 占位串 | 会话签名密钥，`openssl rand -hex 32` |

### C.2 站点身份（留空即隐藏）

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `SITE_NAME` | `我的博客` | 站点名 |
| `SITE_SLOGAN` | 空 | 口号 |
| `SITE_URL` | `http://localhost:3000` | 站点地址，末尾不带斜杠 |
| `SITE_START_DATE` | 空 | 建站日 `YYYY-MM-DD` |
| `SITE_GITHUB` | 空 | GitHub 用户名 |
| `SITE_ICP` | 空 | ICP 备案号文本 |
| `SITE_POLICE` | 空 | 公安备案号文本 |
| `SITE_POLICE_CODE` | 空 | 公安备案查询码 |

### C.3 可选功能

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `COMMENTS_REPO` | 空 | giscus 评论仓库 `user/repo` |
| `COMMENTS_REPO_ID` | 空 | giscus repo id |
| `COMMENTS_CATEGORY` | `Announcements` | 评论分类名 |
| `COMMENTS_CATEGORY_ID` | 空 | 分类 id |
| `GITHUB_TOKEN` | 空 | 提高 GitHub 接口限额 |
| `GEOIP_URL` | 空 | MaxMind 数据库下载地址，留空不做地区解析 |
| `IMGTOOL_SSH` | 空 | 本地素材台的 ssh 目标 `user@host` |
| `IMGTOOL_SITE` | 空 | 素材台校验用的站点地址 |
| `IMGTOOL_REMOTE` | 空 | 服务器图片目录 |

### C.4 运行 / 部署

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `BIND_ADDR` | `127.0.0.1` | 端口绑定地址（docker-compose 用） |
| `TZ` | `Asia/Shanghai` | 容器时区 |
| `NPM_REGISTRY` | `https://registry.npmmirror.com` | 构建时 npm 源 |
| `MQTT_ENABLED` | `false` | 是否启用内嵌 MQTT broker |
| `MQTT_PORT` | `18830` | MQTT TCP 端口 |
| `MQTT_WS_ENABLED` | `false` | 是否启用 MQTT over WebSocket |
| `MQTT_WS_PORT` | `18831` | MQTT-WS 端口 |
| `MQTT_WS_PATH` | `/mqtt-ws` | MQTT-WS 路径（反代要一致） |
| `OTA_TOKEN` | 空 | ESP32 固件下载令牌，留空则不校验 |

### C.5 部署钩子专用（写在推送命令前，见第 9.8 节）

| 变量 | 说明 |
| --- | --- |
| `BLOG_SKIP_REBUILD` | `1` = 本次不重建 |
| `BLOG_FORCE_REBUILD` | `1` = 强制重建 |
| `BLOG_REBUILD_CMD` | 自定义重建命令 |
| `BLOG_GIT_DIR` / `BLOG_WORK_TREE` | 裸仓库 / 工作副本路径 |
| `BLOG_DEPLOY_LOG` | 部署日志路径（默认 `<工作副本>/data/deploy.log`） |

### C.6 备份脚本专用

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `RCLONE_REMOTE` | `bg:/blog` | 远端路径 |
| `SRC` | `/srv/blog` | 工作副本 |
| `GIT_DIR_SRC` | `/srv/blog.git` | 裸仓库 |
| `STATUS_FILE` | `$SRC/data/backup-status.json` | 备份状态文件 |

---

## 附录 D 工作站 /w 逐项开启

登录后导航会出现「工作站」。所有能力**都是可选的**：不配置就没有那些数据，公开站完全不受影响。

| 页面 | 需要做什么 |
| --- | --- |
| 服务器状态 | 不用配置；容器里读宿主机 CPU / 内存 / 磁盘 / 温度 |
| 机器体检 | 装两个 systemd 单元：`cp /srv/blog/deploy/blog-health.service /etc/systemd/system/ && cp /srv/blog/deploy/blog-health.timer /etc/systemd/system/ && systemctl daemon-reload && systemctl enable --now blog-health.timer` |
| 阅读统计 | 不用配置；数据在 `data/` 下 |
| 素材台 | 配 `IMGTOOL_*`（第 10.4 节）或直接用后台粘贴 |
| 元器件库存 | 不用配置；数据在 `data/` 下 |
| ESP32 OTA | `.env` 设 `OTA_TOKEN=一串随机值`，然后 `docker compose up -d` |
| MQTT | `.env` 设 `MQTT_ENABLED=true`，需要 WebSocket 再设 `MQTT_WS_ENABLED=true`；端口记得在安全组/反代放行 |
| 备份浏览 | 跑过备份脚本后自动有数据（第 12 章） |
| 热点信息 | 不用配置，走公开接口 |
| 片段备忘 | 不用配置 |
| 项目文档 | 把 `.md` 放进仓库 `文档/` 目录（容器只读挂载），例如本文件就在 `/w/docs/DEPLOY` |

> 体检脚本只读 `/proc`、`/sys/class/hwmon`、`df`、`lsblk`、`smartctl`，除 `data/health.jsonl` 外不写任何东西；没装 `smartmontools` 也能跑，只是硬盘温度为空。
> 小坑：`/w/docs` 的文件名白名单只允许字母数字和 `._-`，**中文名的文档打不开**，所以本指南文件名是 `DEPLOY.md`。

---

## 附录 E 目录与文件说明

| 路径 | 作用 |
| --- | --- |
| `app/` | 页面与路由：公开站、`/admin` 后台、`/w` 工作站、RSS / sitemap / OG 图 |
| `components/` | UI 组件（`components/ui/` 是 shadcn 源码） |
| `lib/` | 内容解析、搜索、认证、MQTT、库存、备份状态等逻辑 |
| `content/posts/` | 文章（Markdown，唯一数据源） |
| `content/pages/` | 单页：关于 / 免责声明 / 隐私政策 / 开源说明 |
| `content/images/` | 图片（默认不进 git） |
| `data/` | 运行时数据：阅读量、站点设置、库存、体检、备份状态（不进 git，**要备份**） |
| `public/` | 静态文件：头像、logo、字体、地图 JSON |
| `scripts/` | 辅助脚本：内容体检、站点体检、素材台、迁移 |
| `deploy/` | 部署物：`post-receive.sh`（钩子）、`rebuild.sh`、`backup-rclone.sh`、`health-sample.py`、`blog-*.service/timer`、`Caddyfile.example` |
| `文档/` | 文档目录（容器只读挂载，工作站可浏览） |
| `Dockerfile` / `docker-compose.yml` | 容器构建与编排 |
| `.env.example` | 环境变量样例（复制成 `.env`） |
| `next.config.ts` | Next.js 配置（standalone 输出、缓存头、自定义跳转） |
| `proxy.ts` | 中间件：未登录访问 `/admin`、`/w` 会跳 `/login` |
| `instrumentation.ts` | 启动时拉起内容 watcher、MQTT、库存定时任务 |

---

## 附录 F 常用命令速查

```bash
# ── 站点 ──────────────────────────────────────────────
docker compose up -d --build      # 构建并启动（改代码后）
docker compose up -d              # 重启（改 .env 后）
docker compose ps                 # 状态
docker compose logs -f web        # 实时日志
docker compose down               # 停止

# ── 内容 ──────────────────────────────────────────────
ls content/posts                  # 看文章
nano content/posts/xxx.md         # 改文章（保存即生效）
tail -5 data/deploy.log           # 看自动部署日志

# ── 反向代理 ──────────────────────────────────────────
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
journalctl -u caddy -n 50 --no-pager

# ── 备份 / 体检 ───────────────────────────────────────
sh deploy/backup-rclone.sh
sh deploy/rebuild.sh
cat data/backup-status.json
systemctl start blog-backup.service
systemctl list-timers | grep blog

# ── 排查 ──────────────────────────────────────────────
curl -I http://127.0.0.1:3000     # 后端是否活着
curl -I https://example.com       # 反代是否通
df -h ; free -h                   # 资源
ss -lntp                          # 端口占用
docker system df                  # 镜像占用
```

---

## 附录 G 许可与致谢

- 本仓库代码：**MIT**，见 [LICENSE](../LICENSE)，可自由使用、修改、分发
- 仓库里**不含原站文章与图片**：内容请写你自己的，不要搬别人的文章
- 直接引用 / 改写的开源项目与运行时依赖：见 [content/pages/opensource.md](../content/pages/opensource.md)
- 分享卡片字体「得意黑 Smiley Sans」：SIL OFL 1.1，见 [public/fonts/README.md](../public/fonts/README.md)

如果你在部署过程中发现文档有错、或者某处许可标注不当，欢迎提 issue 补正。

