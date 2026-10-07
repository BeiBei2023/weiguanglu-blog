import path from "node:path";

const globalFlags = globalThis as unknown as { __wglWatcherStarted?: boolean };

/**
 * 监听 content/ 变化：失效内容/搜索缓存并预热索引。
 * 由 instrumentation.ts 在 Node 运行时启动一次。
 */
export async function startContentWatcher(): Promise<void> {
  if (globalFlags.__wglWatcherStarted) return;
  globalFlags.__wglWatcherStarted = true;

  const { watch } = await import("chokidar");
  const { invalidateContentCache } = await import("./index");
  const { invalidateSearchCache, getPrivateIndexJson, getPublicIndexJson } = await import(
    "../search"
  );

  const contentDir = path.join(process.cwd(), "content");
  const watcher = watch(contentDir, { ignoreInitial: true, persistent: true });

  let timer: NodeJS.Timeout | null = null;
  function schedule(event: string, file: string) {
    if (!/\.(md|markdown|png|jpe?g|gif|webp|svg)$/i.test(file)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      invalidateContentCache();
      invalidateSearchCache();
      try {
        getPublicIndexJson();
        getPrivateIndexJson();
      } catch {
        // 预热失败忽略，下一次请求会重建
      }
      console.log(
        `[watcher] ${event} ${path.relative(process.cwd(), file)} → 缓存与索引已重建`,
      );
    }, 150);
  }

  watcher.on("add", (file) => schedule("add", file));
  watcher.on("change", (file) => schedule("change", file));
  watcher.on("unlink", (file) => schedule("unlink", file));
  watcher.on("error", (error) => console.error("[watcher] error", error));

  console.log(`[watcher] 正在监听 ${contentDir}`);
}
