/**
 * 博客 · 素材台（imgtool）— 本地服务
 *
 * 用法：pnpm imgtool   → 自动打开 http://127.0.0.1:4318
 * 界面在 scripts/imgtool/page.html，共享逻辑在 scripts/imgtool/lib.ts
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  ALT_FILE,
  COMMIT_SCOPE,
  HOST,
  IMAGES,
  MAX_FETCH_MB,
  MAX_UPLOAD_MB,
  MIME,
  PAGE_FILE,
  PORT,
  REMOTE_TTL,
  SITE,
  SSH_HOST,
  EXT_OK,
  BACKUP_DIR,
  buildHashIndex,
  checkPublic,
  emptyTrash,
  hashIndexSize,
  importBuffer,
  invalidateRefs,
  libraryView,
  listPosts,
  listTrash,
  markdownFor,
  postRefs,
  purgeTrash,
  pushHistory,
  readBody,
  readHistory,
  restoreNames,
  runGit,
  send,
  setAlt,
  trashNames,
  uploadToServer,
  validSlug,
  postFile,
  stamp,
  diffText,
  remotePostText,
  syncPlan,
  syncRun,
} from "./lib.js";

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);

  try {
    // ── 页面 ──
    if (req.method === "GET" && url.pathname === "/") {
      const html = fs.readFileSync(PAGE_FILE, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }
    // ── 本地图片静态服务（给页面的缩略图 / 预览用） ──
    if (req.method === "GET" && url.pathname.startsWith("/content-images/")) {
      const rel = decodeURIComponent(url.pathname.slice("/content-images/".length));
      const name = path.basename(rel);
      const ext = path.extname(name).toLowerCase();
      const file = path.join(IMAGES, name);
      if (!name || name !== rel || !EXT_OK.has(ext) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        return send(res, 404, { error: "not found" });
      }
      const stat = fs.statSync(file);
      res.writeHead(200, {
        "Content-Type": MIME[ext] ?? "application/octet-stream",
        "Content-Length": String(stat.size),
        "Cache-Control": "no-cache",
      });
      fs.createReadStream(file).pipe(res);
      return;
    }

    // ── 配置与总览 ──
    if (req.method === "GET" && url.pathname === "/api/config") {
      return send(res, 200, {
        site: SITE,
        host: HOST,
        port: PORT,
        sshHost: SSH_HOST,
        fetchMb: MAX_FETCH_MB,
        uploadMb: MAX_UPLOAD_MB,
        remoteTtl: REMOTE_TTL,
      });
    }
    if (req.method === "GET" && url.pathname === "/api/summary") {
      const view = await libraryView(url.searchParams.get("refresh") === "1");
      return send(res, 200, {
        count: view.count,
        totalBytes: view.totalBytes,
        missing: view.missing,
        unused: view.unused,
        remoteAt: view.remoteAt,
        trashCount: listTrash().length,
        history: readHistory().slice(0, 5),
      });
    }
    if (req.method === "GET" && url.pathname === "/api/images") {
      const view = await libraryView(url.searchParams.get("refresh") === "1");
      return send(res, 200, view);
    }
    if (req.method === "GET" && url.pathname === "/api/history") {
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 50) || 50, 200);
      return send(res, 200, { entries: readHistory().slice(0, limit) });
    }

    // ── 回收站 ──
    if (req.method === "GET" && url.pathname === "/api/trash") {
      return send(res, 200, { files: listTrash() });
    }
    if (req.method === "POST" && url.pathname === "/api/trash") {
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}") as { names?: string[] };
      return send(res, 200, { results: trashNames(body.names ?? []) });
    }
    if (req.method === "POST" && url.pathname === "/api/trash/restore") {
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}") as { names?: string[] };
      return send(res, 200, { results: restoreNames(body.names ?? []) });
    }
    if (req.method === "POST" && url.pathname === "/api/trash/purge") {
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}") as { names?: string[] };
      return send(res, 200, { results: purgeTrash(body.names ?? []) });
    }
    if (req.method === "POST" && url.pathname === "/api/trash/empty") {
      return send(res, 200, { removed: emptyTrash() });
    }
    if (req.method === "POST" && url.pathname === "/api/images/alt") {
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}") as { name?: string; alt?: string };
      const name = path.basename(String(body.name ?? ""));
      if (!name) return send(res, 400, { error: "缺少 name" });
      const map = setAlt(name, String(body.alt ?? ""));
      return send(res, 200, { ok: true, alt: map[name] ?? "", markdown: markdownFor(name, map[name] ?? "") });
    }

    // ── 导入 / 下载 / 替换 ──
    if (req.method === "POST" && url.pathname === "/api/import") {
      const declared = Number(req.headers["content-length"] ?? 0);
      if (declared > MAX_UPLOAD_MB * 1024 * 1024) {
        req.resume();
        return send(res, 413, { error: `文件过大（${(declared / 1048576).toFixed(1)} MB > ${MAX_UPLOAD_MB} MB）` });
      }
      const buf = await readBody(req);
      if (buf.length === 0) return send(res, 400, { error: "空文件" });
      if (buf.length > MAX_UPLOAD_MB * 1024 * 1024) {
        return send(res, 413, { error: `文件过大（${(buf.length / 1048576).toFixed(1)} MB > ${MAX_UPLOAD_MB} MB）` });
      }
      const original = decodeURIComponent(String(req.headers["x-filename"] ?? "image.png"));
      const prefix = decodeURIComponent(String(req.headers["x-prefix"] ?? ""));
      const alt = decodeURIComponent(String(req.headers["x-alt"] ?? ""));
      const keepName = String(req.headers["x-keepname"] ?? "") === "1";
      const out = importBuffer(buf, original, prefix, keepName);
      if (alt) setAlt(out.name, alt);
      if (!out.deduped) {
        pushHistory({ at: new Date().toISOString(), kind: "import", name: out.name, bytes: out.bytes, ok: true });
      }
      return send(res, 200, {
        name: out.name,
        url: `/content-images/${out.name}`,
        markdown: markdownFor(out.name, alt),
        bytes: out.bytes,
        deduped: out.deduped,
      });
    }
    if (req.method === "POST" && url.pathname === "/api/fetch") {
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}") as {
        url?: string; prefix?: string; keepName?: boolean; alt?: string;
      };
      if (!body.url) return send(res, 400, { error: "缺少 url" });
      let r: Response;
      try {
        r = await fetch(body.url, { headers: { "User-Agent": "blog-imgtool" }, signal: AbortSignal.timeout(30000) });
      } catch (e) {
        return send(res, 400, { error: `下载失败：${e instanceof Error ? e.message : String(e)}` });
      }
      if (!r.ok) return send(res, 400, { error: `下载失败 HTTP ${r.status}` });
      const maxBytes = MAX_FETCH_MB * 1024 * 1024;
      const declared = Number(r.headers.get("content-length") ?? 0);
      if (declared > maxBytes) {
        return send(res, 413, { error: `文件过大（${(declared / 1048576).toFixed(1)} MB > ${MAX_FETCH_MB} MB）` });
      }
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > maxBytes) {
        return send(res, 413, { error: `文件过大（${(buf.length / 1048576).toFixed(1)} MB > ${MAX_FETCH_MB} MB）` });
      }
      const base = decodeURIComponent((body.url.split("/").pop() ?? "image").split("?")[0]) || "image";
      const ext = path.extname(base) || ".png";
      const original = path.extname(base) ? base : base + ext;
      const out = importBuffer(buf, original, body.prefix ?? "", Boolean(body.keepName));
      if (body.alt) setAlt(out.name, body.alt);
      if (!out.deduped) {
        pushHistory({ at: new Date().toISOString(), kind: "fetch", name: out.name, bytes: out.bytes, ok: true, note: body.url });
      }
      return send(res, 200, {
        name: out.name,
        url: `/content-images/${out.name}`,
        markdown: markdownFor(out.name, body.alt ?? ""),
        source: body.url,
        bytes: out.bytes,
        deduped: out.deduped,
      });
    }
    if (req.method === "POST" && url.pathname === "/api/replace") {
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}") as {
        slug?: string; pairs?: { from: string; to: string }[];
      };
      const slug = String(body.slug ?? "");
      if (!validSlug(slug)) return send(res, 400, { error: "非法 slug" });
      const file = postFile(slug);
      if (!fs.existsSync(file)) return send(res, 404, { error: "文章不存在" });
      const original = fs.readFileSync(file, "utf8");
      let text = original;
      let changed = 0;
      for (const p of body.pairs ?? []) {
        if (!p.from || !p.to) continue;
        const parts = text.split(p.from);
        if (parts.length > 1) changed += parts.length - 1;
        text = parts.join(p.to);
      }
      let backup = "";
      if (changed > 0) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        const file2 = path.join(BACKUP_DIR, `${slug}-${stamp()}.md`);
        fs.writeFileSync(file2, original, "utf8");
        fs.writeFileSync(file, text, "utf8");
        backup = path.relative(process.cwd(), file2).replace(/\\/g, "/");
        invalidateRefs();
      }
      return send(res, 200, { changed, backup });
    }

    // ── 上传服务器 ──
    if (req.method === "POST" && url.pathname === "/api/upload-server") {
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}") as { names?: string[]; all?: boolean };
      let names = Array.isArray(body.names) ? body.names.map(String) : [];
      if (body.all) {
        names = fs
          .readdirSync(IMAGES, { withFileTypes: true })
          .filter((e) => e.isFile() && e.name !== ".gitkeep")
          .map((e) => e.name);
      }
      if (names.length === 0) return send(res, 400, { error: "没有要上传的文件" });
      const results = await uploadToServer(names);
      return send(res, 200, {
        ok: results.every((r) => r.ok),
        uploaded: results.filter((r) => r.ok && !r.skipped).length,
        skipped: results.filter((r) => r.skipped).length,
        failed: results.filter((r) => !r.ok).length,
        total: results.length,
        results,
      });
    }

    // ── 文章 ──
    if (req.method === "GET" && url.pathname === "/api/posts") {
      return send(res, 200, { posts: listPosts() });
    }
    if (req.method === "GET" && url.pathname === "/api/post-refs") {
      const slug = String(url.searchParams.get("slug") ?? "");
      if (!validSlug(slug)) return send(res, 400, { error: "非法 slug" });
      const refs = await postRefs(slug, url.searchParams.get("refresh") === "1");
      return send(res, 200, refs);
    }
    if (req.method === "POST" && url.pathname === "/api/publish") {
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}") as {
        slug?: string; message?: string; dryRun?: boolean; allowMissingLocal?: boolean;
      };
      const slug = String(body.slug ?? "");
      if (!validSlug(slug)) return send(res, 400, { error: "非法 slug" });
      const refs = await postRefs(slug, true);
      if (!refs.exists) return send(res, 404, { error: "文章不存在" });
      const steps: { name: string; code: number; out: string }[] = [];
      const summary = {
        refs: refs.counts,
        uploaded: 0,
        skipped: 0,
        failed: 0,
        publicOk: 0,
        publicFail: [] as string[],
      };
      const missingLocal = refs.images.filter((i) => !i.local).map((i) => i.name);
      if (missingLocal.length && !body.allowMissingLocal) {
        return send(res, 200, {
          ok: false,
          stage: "refs",
          steps: [{ name: "检查文章引用", code: 1, out: `有 ${missingLocal.length} 个引用在本地找不到文件：\n${missingLocal.map((n) => `  ${n}`).join("\n")}` }],
          summary,
          blockers: { missingLocal },
        });
      }
      const toUpload = refs.images.filter((i) => i.local && i.state !== "ok").map((i) => i.name);
      if (toUpload.length) {
        const up = await uploadToServer(toUpload);
        summary.uploaded = up.filter((r) => r.ok && !r.skipped).length;
        summary.skipped = up.filter((r) => r.skipped).length;
        summary.failed = up.filter((r) => !r.ok).length;
        steps.push({
          name: `上传缺失的图片（${toUpload.length} 张）`,
          code: summary.failed ? 1 : 0,
          out: up.map((r) => `${r.ok ? (r.skipped ? "跳过" : "✅") : "❌"} ${r.name}${r.out ? `：${r.out}` : ""}`).join("\n"),
        });
        if (summary.failed) return send(res, 200, { ok: false, stage: "upload", steps, summary });
      } else {
        steps.push({ name: "上传缺失的图片", code: 0, out: "无需上传（文章引用的图都已在服务器上）" });
      }
      if (body.dryRun) return send(res, 200, { ok: true, dryRun: true, steps, summary });
      // git：add（限范围）→ commit → pull → push
      const message = (body.message ?? "").trim() || `content: 更新文章 ${slug}`;
      const add = await runGit(["add", "-A", "--", ...COMMIT_SCOPE]);
      steps.push({ name: `git add -A -- ${COMMIT_SCOPE.join(" ")}`, ...add });
      const st = await runGit(["--no-pager", "status", "--short"]);
      steps.push({ name: "git status --short", ...st });
      const staged = await runGit(["diff", "--cached", "--name-only", "--", ...COMMIT_SCOPE]);
      if (staged.out) {
        const commit = await runGit(["commit", "-m", message, "--", ...COMMIT_SCOPE]);
        steps.push({ name: `git commit -m "${message}" -- ${COMMIT_SCOPE.join(" ")}`, ...commit });
      } else {
        steps.push({ name: "git commit", code: 0, out: `暂存区为空（只提交 ${COMMIT_SCOPE.join("、")} 下的改动）` });
      }
      const pull = await runGit(["pull", "--no-rebase", "--no-edit"]);
      steps.push({ name: "git pull", ...pull });
      if (pull.code !== 0) return send(res, 200, { ok: false, stage: "pull", steps, summary, hint: "pull 失败（可能有冲突），请手动处理" });
      const push = await runGit(["push"]);
      steps.push({ name: "git push", ...push });
      if (push.code !== 0) return send(res, 200, { ok: false, stage: "push", steps, summary });
      // 发布后：公网可访问性校验
      const checkNames = refs.images.filter((i) => i.local).map((i) => i.name);
      const checks = await checkPublic(checkNames);
      summary.publicOk = checks.filter((c) => c.ok).length;
      summary.publicFail = checks.filter((c) => !c.ok).map((c) => c.name);
      steps.push({
        name: `公网校验（${checks.length} 张）`,
        code: summary.publicFail.length ? 1 : 0,
        out: summary.publicFail.length
          ? `以下图片线上暂时访问不到：\n${summary.publicFail.map((n) => `  ${n}`).join("\n")}`
          : `✅ 全部可访问（${summary.publicOk}/${checks.length}）`,
      });
      pushHistory({
        at: new Date().toISOString(),
        kind: "publish",
        name: slug,
        ok: summary.publicFail.length === 0,
        note: `上传 ${summary.uploaded} · 跳过 ${summary.skipped} · 公网 ${summary.publicOk}/${checks.length}`,
      });
      return send(res, 200, { ok: summary.publicFail.length === 0, steps, summary });
    }

    // ── 文章同步（不走 git：直接跟服务器 content/posts 对拷） ──
    if (req.method === "GET" && url.pathname === "/api/sync/plan") {
      return send(res, 200, await syncPlan());
    }
    if (req.method === "GET" && url.pathname === "/api/sync/diff") {
      const slug = String(url.searchParams.get("slug") ?? "");
      if (!validSlug(slug)) return send(res, 400, { error: "非法 slug" });
      const file = postFile(slug);
      const local = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
      const remote = await remotePostText(slug);
      return send(res, 200, { slug, local, remote, diff: await diffText(remote, local) });
    }
    if (req.method === "POST" && url.pathname === "/api/sync/run") {
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}") as {
        direction?: string;
        slugs?: unknown[];
        images?: boolean;
        dryRun?: boolean;
      };
      const direction = body.direction === "push" ? "push" : "pull";
      const slugs = Array.isArray(body.slugs) ? body.slugs.map(String) : [];
      if (slugs.length === 0) return send(res, 400, { error: "没有选中任何文章" });
      const result = await syncRun(direction, slugs, { images: Boolean(body.images), dryRun: Boolean(body.dryRun) });
      return send(res, 200, result);
    }

    // ── git ──
    if (req.method === "GET" && url.pathname === "/api/git/status") {
      const r = await runGit(["--no-pager", "status", "--short", "--branch"]);
      return send(res, 200, { code: r.code, out: r.out });
    }
    if (req.method === "POST" && url.pathname === "/api/git/pull") {
      const r = await runGit(["pull", "--no-rebase", "--no-edit"]);
      return send(res, 200, { ok: r.code === 0, steps: [{ name: "git pull", code: r.code, out: r.out }] });
    }
    if (req.method === "POST" && url.pathname === "/api/git/commit") {
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}") as { message?: string };
      const message = (body.message ?? "").trim() || `content: 更新 ${new Date().toISOString().slice(0, 10)}`;
      const steps: { name: string; code: number; out: string }[] = [];
      const add = await runGit(["add", "-A", "--", ...COMMIT_SCOPE]);
      steps.push({ name: `git add -A -- ${COMMIT_SCOPE.join(" ")}`, ...add });
      const st = await runGit(["--no-pager", "status", "--short"]);
      steps.push({ name: "git status --short（未列出的改动不会提交）", ...st });
      const staged = await runGit(["diff", "--cached", "--name-only", "--", ...COMMIT_SCOPE]);
      if (staged.out) {
        const commit = await runGit(["commit", "-m", message, "--", ...COMMIT_SCOPE]);
        steps.push({ name: `git commit -m "${message}" -- ${COMMIT_SCOPE.join(" ")}`, ...commit });
      } else {
        steps.push({ name: "git commit", code: 0, out: `暂存区为空（只提交 ${COMMIT_SCOPE.join("、")} 下的改动）` });
      }
      const pull = await runGit(["pull", "--no-rebase", "--no-edit"]);
      steps.push({ name: "git pull", ...pull });
      if (pull.code !== 0) return send(res, 200, { ok: false, steps, hint: "pull 失败（可能有冲突），请手动处理" });
      const push = await runGit(["push"]);
      steps.push({ name: "git push", ...push });
      return send(res, 200, { ok: push.code === 0, steps });
    }

    send(res, 404, { error: "not found" });
  } catch (err) {
    send(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
});

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}`;
  buildHashIndex();
  console.log(`[imgtool] 素材台 ${url}  (Ctrl+C 退出)`);
  console.log(`[imgtool] 去重索引：${hashIndexSize()} 张 · 图片目录：${path.relative(process.cwd(), IMAGES).replace(/\\/g, "/")}`);
  console.log(`[imgtool] 上传目标：${SSH_HOST} · 对外站点：${SITE} · 记录文件：${path.relative(process.cwd(), ALT_FILE).replace(/\\/g, "/")}`);
  openBrowser(url);
});

server.on("error", (err: NodeJS.ErrnoException) => {
  const url = `http://${HOST}:${PORT}`;
  if (err.code === "EADDRINUSE") {
    console.log(`[imgtool] 端口 ${PORT} 已在运行，直接打开页面：${url}`);
    openBrowser(url);
    process.exit(0);
  }
  console.error("[imgtool] 启动失败：", err.message);
  process.exit(1);
});

function openBrowser(url: string): void {
  if (process.env.IMGTOOL_NO_OPEN) return;
  try {
    if (process.platform === "win32") spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    else if (process.platform === "darwin") spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    else spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
  } catch {
    /* 打不开浏览器就算了，手动访问 */
  }
}
