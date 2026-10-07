import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "views.json");
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type ViewMap = Record<string, number>;

let cache: ViewMap | null = null;
let signature = "";

function fileSignature(): string {
  try {
    const st = fs.statSync(FILE);
    return `${st.mtimeMs}:${st.size}`;
  } catch {
    return "missing";
  }
}

function readFromDisk(): ViewMap {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: ViewMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const n = Number(value);
      if (Number.isFinite(n) && n >= 0) out[key] = Math.floor(n);
    }
    return out;
  } catch {
    // 文件不存在或损坏 → 视为空
    return {};
  }
}

/** 读取（带 mtime/size 签名缓存，文件被外部改动会自动重载） */
function load(): ViewMap {
  const sig = fileSignature();
  if (!cache || sig !== signature) {
    cache = readFromDisk();
    signature = sig;
  }
  return cache;
}

export function getAllViews(): ViewMap {
  return { ...load() };
}

export function getViews(slug: string): number {
  return load()[slug] ?? 0;
}

function writeAtomic(data: ViewMap): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${FILE}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, FILE);
}

// 串行化自增，避免并发写丢计数
let queue: Promise<unknown> = Promise.resolve();

export function incrementViews(slug: string): Promise<number> {
  if (!SLUG_RE.test(slug)) return Promise.reject(new Error("非法 slug"));
  const run = (): number => {
    // 每次从磁盘重新读取最新值再 +1：页面与路由处理器是不同的模块实例，
    // 各自缓存可能不同步，直接用缓存会导致并发/跨实例丢计数
    const data = readFromDisk();
    const next = (data[slug] ?? 0) + 1;
    data[slug] = next;
    writeAtomic(data);
    cache = data;
    signature = fileSignature();
    return next;
  };
  const result = queue.then(run, run);
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
