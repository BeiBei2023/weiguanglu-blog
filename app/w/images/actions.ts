"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "@/lib/auth/server";
import { purgeMedia, purgeTrashAll, restoreMedia, saveMediaAlt, trashMedia } from "@/lib/images";

export interface ImagesActionResult {
  ok: boolean;
  error?: string;
  notice?: string;
}

async function guard(): Promise<ImagesActionResult | null> {
  const session = await getServerSession();
  if (!session) return { ok: false, error: "登录已失效，请重新登录" };
  return null;
}

function clean(names: unknown): string[] {
  return (Array.isArray(names) ? names : []).filter(
    (name): name is string => typeof name === "string" && name.length > 0,
  );
}

/** 把选中的素材移入回收站（服务器上的 data/image-trash/，可还原或彻底删除） */
export async function trashImagesAction(names: string[]): Promise<ImagesActionResult> {
  const blocked = await guard();
  if (blocked) return blocked;

  const list = clean(names);
  if (list.length === 0) return { ok: false, error: "没有选中任何文件" };

  const { moved, failed } = trashMedia(list);
  revalidatePath("/w/images");

  if (moved.length === 0) {
    const detail = failed.map((item) => `${item.name}（${item.error}）`).join("；");
    return { ok: false, error: `移入回收站失败：${detail || "未知错误"}` };
  }
  return {
    ok: true,
    notice: `已移入回收站 ${moved.length} 个文件${
      failed.length > 0 ? `，失败 ${failed.length} 个` : ""
    }`,
  };
}

/** 从回收站还原（同名已存在时自动加 -1、-2…） */
export async function restoreImagesAction(names: string[]): Promise<ImagesActionResult> {
  const blocked = await guard();
  if (blocked) return blocked;

  const list = clean(names);
  if (list.length === 0) return { ok: false, error: "没有选中任何文件" };

  const { moved, failed } = restoreMedia(list);
  revalidatePath("/w/images");

  if (moved.length === 0) {
    const detail = failed.map((item) => `${item.name}（${item.error}）`).join("；");
    return { ok: false, error: `还原失败：${detail || "未知错误"}` };
  }
  return {
    ok: true,
    notice: `已还原 ${moved.length} 个文件${
      failed.length > 0 ? `，失败 ${failed.length} 个` : ""
    }`,
  };
}

/** 彻底删除回收站里的文件（不可恢复） */
export async function purgeImagesAction(names: string[]): Promise<ImagesActionResult> {
  const blocked = await guard();
  if (blocked) return blocked;

  const list = clean(names);
  if (list.length === 0) return { ok: false, error: "没有选中任何文件" };

  const { removed, failed } = purgeMedia(list);
  revalidatePath("/w/images");

  if (removed.length === 0) {
    const detail = failed.map((item) => `${item.name}（${item.error}）`).join("；");
    return { ok: false, error: `删除失败：${detail || "未知错误"}` };
  }
  return {
    ok: true,
    notice: `已彻底删除 ${removed.length} 个文件${failed.length > 0 ? `，失败 ${failed.length} 个` : ""}`,
  };
}

/** 清空回收站 */
export async function purgeTrashAllAction(): Promise<ImagesActionResult> {
  const blocked = await guard();
  if (blocked) return blocked;

  const count = purgeTrashAll();
  revalidatePath("/w/images");
  return { ok: true, notice: count > 0 ? `已清空回收站（删除 ${count} 个文件）` : "回收站本来就是空的" };
}

/** 保存一张图的 alt 文本（空串 = 清除） */
export async function saveAltAction(name: string, alt: string): Promise<ImagesActionResult> {
  const blocked = await guard();
  if (blocked) return blocked;
  if (typeof name !== "string" || !name) return { ok: false, error: "文件名缺失" };
  if (!name.startsWith("/") && !/^[A-Za-z0-9._-]+$/.test(name)) return { ok: false, error: "文件名不合法" };

  try {
    saveMediaAlt(name, typeof alt === "string" ? alt : "");
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
  revalidatePath("/w/images");
  return { ok: true, notice: alt.trim() ? "alt 已保存" : "已清除 alt" };
}
