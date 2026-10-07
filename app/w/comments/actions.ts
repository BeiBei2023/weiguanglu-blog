"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "@/lib/auth/server";
import { markCommentsSeen } from "@/lib/comments-feed";

export interface CommentsActionResult {
  ok: boolean;
  error?: string;
  notice?: string;
}

/** 把「评论动态」标记为已读：记下当前时间，之前的条目不再算未读 */
export async function markCommentsSeenAction(): Promise<CommentsActionResult> {
  const session = await getServerSession();
  if (!session) return { ok: false, error: "登录已失效，请重新登录" };

  markCommentsSeen();
  revalidatePath("/w/comments");
  return { ok: true, notice: "已全部标为已读" };
}
