import fs from "node:fs";
import path from "node:path";

const FILE = path.join(process.cwd(), "data", "backup-index.txt");

/** 归档分卷命名：blog-site-20260930-0118.tar.gz.part-aa */
const SNAPSHOT_RE = /^blog-(site|git)-(\d{8}-\d{4})\.tar\.gz\.part-([A-Za-z0-9]+)$/;

export interface SnapshotFile {
  name: string;
  bytes: number;
  modtime: string;
}

export interface Snapshot {
  stamp: string;
  kind: "site" | "git";
  files: SnapshotFile[];
  bytes: number;
}

export interface BackupIndex {
  /** 清单生成时间（备份脚本每轮写入） */
  at: string | null;
  snapshots: Snapshot[];
  checksums: SnapshotFile[];
  totalBytes: number;
  error?: string;
}

function parseLine(line: string): SnapshotFile | null {
  const parts = line.split("|");
  if (parts.length < 3) return null;
  const modtime = parts[0].trim();
  const bytes = Number(parts[1]);
  const name = parts.slice(2).join("|").trim();
  if (!name || !Number.isFinite(bytes)) return null;
  return { name, bytes, modtime };
}

/** 把 `20260930-0118` 变成 `2026-09-30 01:18` */
export function stampLabel(stamp: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(stamp);
  if (!match) return stamp;
  return `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}`;
}

/** 读取备份脚本写下的归档清单（data/backup-index.txt） */
export function readBackupIndex(): BackupIndex {
  try {
    const raw = fs.readFileSync(FILE, "utf8");
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const at = lines.shift() ?? null;
    const snapshots = new Map<string, Snapshot>();
    const checksums: SnapshotFile[] = [];
    for (const line of lines) {
      const file = parseLine(line);
      if (!file) continue;
      if (file.name.startsWith("SHA256SUMS-")) {
        checksums.push(file);
        continue;
      }
      const match = SNAPSHOT_RE.exec(file.name);
      if (!match) continue;
      const kind = match[1] as "site" | "git";
      const stamp = match[2];
      const key = `${kind}-${stamp}`;
      const entry = snapshots.get(key) ?? { stamp, kind, files: [], bytes: 0 };
      entry.files.push(file);
      entry.bytes += file.bytes;
      snapshots.set(key, entry);
    }
    const list = [...snapshots.values()].sort((a, b) =>
      a.stamp === b.stamp ? a.kind.localeCompare(b.kind) : b.stamp.localeCompare(a.stamp),
    );
    return {
      at,
      snapshots: list,
      checksums: checksums.sort((a, b) => b.name.localeCompare(a.name)),
      totalBytes: list.reduce((sum, item) => sum + item.bytes, 0),
    };
  } catch (error) {
    return {
      at: null,
      snapshots: [],
      checksums: [],
      totalBytes: 0,
      error: error instanceof Error ? error.message : "读取备份清单失败",
    };
  }
}
