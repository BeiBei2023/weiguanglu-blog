import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { LookupRateLimitError, lookup, toInventoryFields } from "@/lib/inventory/lookup";
import { mutate, readInventory } from "@/lib/inventory/store";

export const dynamic = "force-dynamic";

/** 每次请求最多处理几个元件 / 最长耗时（超出留给下一次，可断点续传） */
const PER_STEP = 6;
const MAX_STEP_MS = 25000;

interface Target {
  id: number;
  query: string;
  label: string;
  /** true = 用立创编号精确查；false = 用型号关键词搜（只接受唯一命中） */
  byCode: boolean;
}

interface ComponentLike {
  lcscId: string;
  lcscCode: string;
  mpn: string;
  partNo: string;
}

function querySourceOf(component: ComponentLike): { query: string; byCode: boolean } | null {
  // 备注里带着立创商品 ID：直接取商品页，少一次请求，也绕开立创EDA 的限流
  const lcscId = component.lcscId.trim();
  if (/^\d{3,}$/.test(lcscId)) {
    return { query: `https://item.szlcsc.com/${lcscId}.html`, byCode: true };
  }
  const lcscCode = component.lcscCode.trim();
  if (lcscCode) return { query: lcscCode, byCode: true };
  const partNo = component.partNo.trim();
  if (/^c\d{4,}$/i.test(partNo)) return { query: partNo.toUpperCase(), byCode: true };
  const mpn = component.mpn.trim() || partNo;
  if (mpn) return { query: mpn, byCode: false };
  return null;
}

/** 还没补齐（缺参数表或参考图）且能查到源头的元件；位置、数量、备注一律不参与 */
async function pendingTargets(): Promise<Target[]> {
  const data = await readInventory();
  const targets: Target[] = [];
  for (const component of data.components) {
    if (component.params.length > 0 && component.imageUrl) continue;
    const source = querySourceOf(component);
    if (!source) continue;
    targets.push({
      id: component.id,
      query: source.query,
      label: component.partNo || source.query,
      byCode: source.byCode,
    });
  }
  // 商城 / 立创编号的目标排前面（绕开立创EDA 限流），关键词目标排最后
  targets.sort((a, b) => Number(b.byCode) - Number(a.byCode));
  return targets;
}

/** GET：还有多少元件待升级 */
export async function GET(request: Request) {
  if (!(await getSession(request))) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const data = await readInventory();
  const pending = await pendingTargets();
  return NextResponse.json({ ok: true, total: data.components.length, pending: pending.length });
}

/** POST：升级一小批（客户端循环调用直到 remaining = 0） */
export async function POST(request: Request) {
  if (!(await getSession(request))) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { exclude?: unknown } | null;
  const excluded = new Set(
    Array.isArray(body?.exclude)
      ? body.exclude.filter((id): id is number => typeof id === "number")
      : [],
  );

  const all = (await pendingTargets()).filter((target) => !excluded.has(target.id));
  if (!all.length) {
    return NextResponse.json({
      ok: true,
      upgraded: 0,
      skipped: 0,
      failed: 0,
      failedIds: [],
      errors: [],
      remaining: 0,
      rateLimited: false,
      samples: [],
    });
  }

  const batch = all.slice(0, PER_STEP);
  const startedAt = Date.now();
  const patches: { id: number; fields: ReturnType<typeof toInventoryFields> }[] = [];
  const samples: string[] = [];
  const failedIds: number[] = [];
  const errors: string[] = [];
  let skipped = 0;
  let failed = 0;
  let rateLimited = false;

  for (const target of batch) {
    if (Date.now() - startedAt > MAX_STEP_MS) break;
    try {
      const result = await lookup(target.query);
      const first = result.items[0];
      if (!first) {
        failed += 1;
        failedIds.push(target.id);
        continue;
      }
      let full = first;
      if (!target.byCode && result.partial) {
        // 关键词搜索：只有唯一命中才自动采用，避免张冠李戴
        if (result.items.length > 1) {
          skipped += 1;
          failedIds.push(target.id);
          if (samples.length < 5) samples.push(target.label);
          continue;
        }
        if (first.lcscCode) {
          const expanded = await lookup(first.lcscCode);
          full = expanded.items[0] ?? first;
        }
      }
      patches.push({ id: target.id, fields: toInventoryFields(full) });
    } catch (error) {
      if (error instanceof LookupRateLimitError) {
        rateLimited = true;
        break;
      }
      failed += 1;
      failedIds.push(target.id);
      if (errors.length < 3) {
        const message = error instanceof Error && error.message ? error.message : "查询失败";
        errors.push(`${target.label}：${message}`);
      }
    }
  }

  let upgraded = 0;
  if (patches.length) {
    await mutate((data) => {
      for (const patch of patches) {
        const component = data.components.find((item) => item.id === patch.id);
        if (!component) continue;
        const fields = patch.fields;
        let changed = false;
        // 只补空字段；boxId / slotIndex / quantity / note / enabled 一律不动
        if (!component.mpn && fields.mpn) { component.mpn = fields.mpn; changed = true; }
        if (!component.brand && fields.brand) { component.brand = fields.brand; changed = true; }
        if (!component.packageName && fields.packageName) { component.packageName = fields.packageName; changed = true; }
        if (!component.category && fields.category) { component.category = fields.category; changed = true; }
        if (!component.lcscCode && fields.lcscCode) { component.lcscCode = fields.lcscCode; changed = true; }
        if (!component.lcscId && fields.lcscId) { component.lcscId = fields.lcscId; changed = true; }
        if (!component.params.length && fields.params.length) { component.params = fields.params; changed = true; }
        if (!component.datasheetUrl && fields.datasheetUrl) { component.datasheetUrl = fields.datasheetUrl; changed = true; }
        if (!component.imageUrl && fields.imageUrl) { component.imageUrl = fields.imageUrl; changed = true; }
        if (!component.name && fields.name) { component.name = fields.name; changed = true; }
        if (!component.packType && fields.packType) { component.packType = fields.packType; changed = true; }
        if (!component.packQty && fields.packQty) { component.packQty = fields.packQty; changed = true; }
        if (!component.unit && fields.unit) { component.unit = fields.unit; changed = true; }
        // 真的补上了才算「升级」；否则算没进展（客户端会据此停下，避免空转）
        if (changed) upgraded += 1;
        else failed += 1;
      }
    });
  }

  const remaining = (await pendingTargets()).filter((target) => !excluded.has(target.id));
  return NextResponse.json({
    ok: true,
    upgraded,
    skipped,
    failed,
    failedIds,
    errors,
    remaining: remaining.length,
    rateLimited,
    samples,
  });
}
