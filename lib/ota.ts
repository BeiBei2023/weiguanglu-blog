import fs from "node:fs";
import path from "node:path";
import { createHash, timingSafeEqual } from "node:crypto";

// 固件存 data/（持久卷 + 云盘备份；gitignore，不进 git）
const OTA_DIR = path.join(process.cwd(), "data", "ota");
const PROJECT_RE = /^[A-Za-z0-9_-]{1,64}$/;
const TS_RE = /^\d{8}_\d{6}$/;

export interface FirmwareInfo {
  /** 版本标识（时间戳，YYYYMMDD_HHMMSS） */
  version: string;
  timestamp: string;
  uploadTime: string;
  sizeBytes: number;
  sizeStr: string;
  md5: string;
  isEsp32: boolean;
  chip?: string;
  segments?: number;
  flashMode?: string;
  flashSize?: string;
  flashFreq?: string;
  entryAddr?: string;
  appVersion?: string;
  projectName?: string;
  idfVer?: string;
  compileTime?: string;
  /** 上传时自定义版本号（覆盖显示） */
  customVersion?: string;
  notes?: string;
  originalName?: string;
}

export interface SaveOptions {
  customVersion?: string;
  notes?: string;
  originalName?: string;
}

export function isValidProject(name: string): boolean {
  return PROJECT_RE.test(name);
}

export function isValidTimestamp(ts: string): boolean {
  return TS_RE.test(ts);
}

function projectDir(project: string): string {
  return path.join(OTA_DIR, project);
}
function activeBin(project: string): string {
  return path.join(projectDir(project), "active.bin");
}
function activeJson(project: string): string {
  return path.join(projectDir(project), "active.json");
}
function historyDir(project: string): string {
  return path.join(projectDir(project), "history");
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

function nowTs(d = new Date()): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function fmtDateTime(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function tsReadable(ts: string): string {
  const m = ts.match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}` : ts;
}

function writeJsonAtomic(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ── ESP32 固件解析（image header + esp_app_desc_t） ──
const CHIP_ID_MAP: Record<number, string> = {
  0x0000: "ESP32",
  0x0002: "ESP32-S2",
  0x0005: "ESP32-C3",
  0x0009: "ESP32-S3",
  0x000a: "ESP32-H2",
  0x000c: "ESP32-C2",
  0x000d: "ESP32-C6",
  0x0010: "ESP32-P4",
};
const FLASH_MODE_MAP: Record<number, string> = {
  0x00: "QIO",
  0x01: "QOUT",
  0x02: "DIO",
  0x03: "DOUT",
  0xff: "Fast Read",
};
const FLASH_FREQ_MAP: Record<number, string> = {
  0x0: "40 MHz",
  0x1: "26 MHz",
  0x2: "20 MHz",
  0xf: "80 MHz",
};
const FLASH_SIZE_MAP: Record<number, string> = {
  0x0: "1 MB",
  0x1: "2 MB",
  0x2: "4 MB",
  0x3: "8 MB",
  0x4: "16 MB",
  0x5: "32 MB",
  0x6: "64 MB",
};

function cstr(buf: Buffer, off: number, len: number): string {
  if (off + len > buf.length) return "";
  const raw = buf.subarray(off, off + len);
  const zero = raw.indexOf(0);
  return (zero >= 0 ? raw.subarray(0, zero) : raw).toString("utf8").trim();
}

export function parseFirmware(buf: Buffer): Omit<FirmwareInfo, "version" | "timestamp" | "uploadTime"> {
  const out: Omit<FirmwareInfo, "version" | "timestamp" | "uploadTime"> = {
    sizeBytes: buf.length,
    sizeStr: fmtSize(buf.length),
    md5: createHash("md5").update(buf).digest("hex"),
    isEsp32: false,
  };
  if (buf.length < 32 || buf[0] !== 0xe9) return out;

  const segCount = buf[1];
  const flashMode = buf[2];
  const sizeFreq = buf[3];
  const entryPoint = buf.readUInt32LE(4);
  const flashSizeNibble = (sizeFreq >> 4) & 0x0f;
  const flashFreqNibble = sizeFreq & 0x0f;
  const chipId = buf.readUInt16LE(20);

  out.isEsp32 = true;
  out.chip = CHIP_ID_MAP[chipId] ?? `Unknown(0x${chipId.toString(16).toUpperCase().padStart(4, "0")})`;
  out.segments = segCount;
  out.flashMode = FLASH_MODE_MAP[flashMode] ?? `0x${flashMode.toString(16).toUpperCase().padStart(2, "0")}`;
  out.flashSize = FLASH_SIZE_MAP[flashSizeNibble] ?? `0x${flashSizeNibble.toString(16).toUpperCase()}`;
  out.flashFreq = FLASH_FREQ_MAP[flashFreqNibble] ?? `0x${flashFreqNibble.toString(16).toUpperCase()}`;
  out.entryAddr = `0x${entryPoint.toString(16).toUpperCase().padStart(8, "0")}`;

  const pos = buf.indexOf(Buffer.from([0x32, 0x54, 0xcd, 0xab]));
  if (pos !== -1 && pos + 256 <= buf.length) {
    out.appVersion = cstr(buf, pos + 16, 32);
    out.projectName = cstr(buf, pos + 48, 32);
    const time = cstr(buf, pos + 80, 16);
    const date = cstr(buf, pos + 96, 16);
    out.idfVer = cstr(buf, pos + 112, 32);
    if (date && time) out.compileTime = `${date} ${time}`;
    else if (date) out.compileTime = date;
  }
  return out;
}

// ── 项目 / 版本操作 ──
export function listProjects(): string[] {
  try {
    return fs
      .readdirSync(OTA_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && PROJECT_RE.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

export function createProject(name: string): boolean {
  if (!isValidProject(name)) return false;
  fs.mkdirSync(historyDir(name), { recursive: true });
  return true;
}

export function deleteProject(name: string): boolean {
  if (!isValidProject(name)) return false;
  try {
    fs.rmSync(projectDir(name), { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

function infoFromMeta(project: string, fallbackTs: string, stat: fs.Stats): FirmwareInfo {
  const meta = readJson(activeJson(project));
  if (meta && typeof meta.version === "string") return meta as unknown as FirmwareInfo;
  return {
    version: fallbackTs,
    timestamp: fallbackTs,
    uploadTime: fmtDateTime(stat.mtime),
    sizeBytes: stat.size,
    sizeStr: fmtSize(stat.size),
    md5: "",
    isEsp32: false,
  };
}

export function getActiveInfo(project: string): FirmwareInfo | null {
  const bin = activeBin(project);
  if (!fs.existsSync(bin)) return null;
  const stat = fs.statSync(bin);
  return infoFromMeta(project, nowTs(stat.mtime), stat);
}

export function getHistory(project: string): FirmwareInfo[] {
  const dir = historyDir(project);
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir).filter((f) => /^firmware_\d{8}_\d{6}\.bin$/.test(f));
  } catch {
    return [];
  }
  const items = files.map((file) => {
    const stem = file.replace(/\.bin$/, "");
    const ts = stem.replace(/^firmware_/, "");
    const stat = fs.statSync(path.join(dir, file));
    const meta = readJson(path.join(dir, `${stem}.json`));
    if (meta && typeof meta.version === "string") return meta as unknown as FirmwareInfo;
    return {
      version: ts,
      timestamp: ts,
      uploadTime: tsReadable(ts),
      sizeBytes: stat.size,
      sizeStr: fmtSize(stat.size),
      md5: "",
      isEsp32: false,
    } satisfies FirmwareInfo;
  });
  return items.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function saveFirmware(project: string, buf: Buffer, opts: SaveOptions): FirmwareInfo {
  if (!isValidProject(project)) throw new Error("非法项目名");
  createProject(project);
  // 版本号精确到秒：同秒内多次上传会撞名 → 顺延到下一个空闲秒
  let ts = nowTs();
  let guard = 0;
  while (fs.existsSync(path.join(historyDir(project), `firmware_${ts}.bin`)) && guard < 300) {
    guard += 1;
    ts = nowTs(new Date(Date.now() + guard * 1000));
  }
  const parsed = parseFirmware(buf);
  const info: FirmwareInfo = {
    version: ts,
    timestamp: ts,
    uploadTime: tsReadable(ts),
    ...parsed,
    customVersion: opts.customVersion?.trim() || undefined,
    notes: opts.notes?.trim() || undefined,
    originalName: opts.originalName?.trim() || undefined,
  };
  const histBin = path.join(historyDir(project), `firmware_${ts}.bin`);
  fs.writeFileSync(histBin, buf);
  writeJsonAtomic(path.join(historyDir(project), `firmware_${ts}.json`), info);
  // 自动激活
  fs.copyFileSync(histBin, activeBin(project));
  writeJsonAtomic(activeJson(project), info);
  return info;
}

export function switchFirmware(project: string, ts: string): { ok: boolean; error?: string } {
  if (!isValidProject(project) || !isValidTimestamp(ts)) return { ok: false, error: "参数非法" };
  const srcBin = path.join(historyDir(project), `firmware_${ts}.bin`);
  if (!fs.existsSync(srcBin)) return { ok: false, error: `版本 ${ts} 不存在` };
  fs.copyFileSync(srcBin, activeBin(project));
  const srcJson = path.join(historyDir(project), `firmware_${ts}.json`);
  if (fs.existsSync(srcJson)) {
    fs.copyFileSync(srcJson, activeJson(project));
  } else {
    fs.rmSync(activeJson(project), { force: true });
  }
  return { ok: true };
}

export function deleteHistory(project: string, ts: string): { ok: boolean; error?: string } {
  if (!isValidProject(project) || !isValidTimestamp(ts)) return { ok: false, error: "参数非法" };
  const active = getActiveInfo(project);
  if (active && active.version === ts) return { ok: false, error: "当前激活版本不能删除" };
  const bin = path.join(historyDir(project), `firmware_${ts}.bin`);
  if (!fs.existsSync(bin)) return { ok: false, error: `版本 ${ts} 不存在` };
  fs.rmSync(bin, { force: true });
  fs.rmSync(path.join(historyDir(project), `firmware_${ts}.json`), { force: true });
  return { ok: true };
}

export function readActiveFirmware(project: string): Buffer | null {
  if (!isValidProject(project)) return null;
  const bin = activeBin(project);
  if (!fs.existsSync(bin)) return null;
  try {
    return fs.readFileSync(bin);
  } catch {
    return null;
  }
}

/** 兼容旧路径 /firmware.bin：返回第一个有固件的项目名 */
export function firstProjectWithFirmware(): string | null {
  for (const project of listProjects()) {
    if (fs.existsSync(activeBin(project))) return project;
  }
  return null;
}

// ── 设备鉴权（对外 OTA 接口） ──

/** 是否启用了设备令牌校验（.env 里 OTA_TOKEN 非空即启用；留空 = 向后兼容不校验） */
export function otaTokenEnabled(): boolean {
  return (process.env.OTA_TOKEN ?? "").trim().length > 0;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * 校验设备请求的 OTA 令牌。
 * 优先 `Authorization: Bearer <OTA_TOKEN>`；也兼容 `?token=<OTA_TOKEN>`（部分嵌入式 HTTP 客户端不方便加头）。
 * 未配置 OTA_TOKEN 时一律放行（老部署不受影响）。
 */
export function isOtaAuthorized(request: Request): boolean {
  const expected = (process.env.OTA_TOKEN ?? "").trim();
  if (!expected) return true;

  const header = request.headers.get("authorization") ?? "";
  const bearer = header.replace(/^Bearer\s+/i, "").trim();
  if (bearer && safeEqual(bearer, expected)) return true;

  try {
    const query = new URL(request.url).searchParams.get("token") ?? "";
    return Boolean(query) && safeEqual(query, expected);
  } catch {
    return false;
  }
}

/** 统一的 401 响应 */
export function otaUnauthorized(): Response {
  return new Response("Unauthorized: 设备令牌缺失或不正确\n", {
    status: 401,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "WWW-Authenticate": 'Bearer realm="ota"',
      "Cache-Control": "no-store",
    },
  });
}

