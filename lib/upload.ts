export const MAX_IMAGE_UPLOAD = 10 * 1024 * 1024;
export const MAX_VIDEO_UPLOAD = 60 * 1024 * 1024;

export interface UploadProgressInfo {
  loaded: number;
  total: number;
  /** 0–100 */
  percent: number;
  /** 字节/秒 */
  speed: number;
  /** 预计剩余秒数 */
  eta: number;
  /** 数据已发送完（服务端还在处理） */
  sent: boolean;
}

export interface UploadResult {
  path: string;
  name: string;
}

export interface UploadTask {
  promise: Promise<UploadResult>;
  abort: () => void;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function formatSpeed(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return "";
  return `${formatBytes(bytesPerSecond)}/s`;
}

/**
 * 带进度/速度的上传：fetch 拿不到上传进度，用 XHR 的 upload 事件。
 * 返回可 abort 的任务，便于「取消」。
 */
export function uploadWithProgress(
  file: File,
  onProgress: (info: UploadProgressInfo) => void,
  endpoint = "/api/admin/upload",
): UploadTask {
  const startedAt = Date.now();
  let xhr: XMLHttpRequest | null = new XMLHttpRequest();

  const promise = new Promise<UploadResult>((resolve, reject) => {
    const request = xhr;
    if (!request) {
      reject(new Error("上传初始化失败"));
      return;
    }
    request.open("POST", endpoint);
    request.timeout = 10 * 60 * 1000;

    request.upload.onprogress = (event) => {
      const loaded = event.loaded;
      const total = event.lengthComputable ? event.total : file.size;
      const elapsed = Math.max((Date.now() - startedAt) / 1000, 0.05);
      const speed = loaded / elapsed;
      const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
      onProgress({
        loaded,
        total,
        percent,
        speed,
        eta: speed > 0 ? Math.max(0, (total - loaded) / speed) : 0,
        sent: total > 0 && loaded >= total,
      });
    };

    request.onload = () => {
      let data: { path?: string; name?: string; error?: string } = {};
      try {
        data = JSON.parse(request.responseText || "{}") as typeof data;
      } catch {
        reject(new Error("上传响应解析失败"));
        return;
      }
      if (request.status >= 200 && request.status < 300 && data.path) {
        resolve({ path: data.path, name: data.name ?? file.name });
      } else {
        reject(new Error(data.error ?? `上传失败（HTTP ${request.status}）`));
      }
    };
    request.onerror = () => reject(new Error("网络错误，上传失败"));
    request.ontimeout = () => reject(new Error("上传超时，请重试或换更小的文件"));
    request.onabort = () => reject(new Error("已取消上传"));

    const form = new FormData();
    form.append("file", file);
    request.send(form);
  });

  return {
    promise,
    abort: () => {
      xhr?.abort();
      xhr = null;
    },
  };
}
