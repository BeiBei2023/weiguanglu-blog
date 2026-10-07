"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TrendPoint, TypeStat } from "@/lib/inventory/domain";

const trendConfig: ChartConfig = {
  value: { label: "总库存", color: "var(--primary)" },
};

const typeConfig: ChartConfig = {
  quantity: { label: "库存数量", color: "var(--primary)" },
};

export function TrendChart({
  trend7,
  trend30,
}: {
  trend7: TrendPoint[];
  trend30: TrendPoint[];
}) {
  const [range, setRange] = useState<"7" | "30">("7");
  const data = range === "7" ? trend7 : trend30;

  return (
    <section className="glass rounded-2xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-base font-semibold">库存趋势</h2>
        <Tabs value={range} onValueChange={(value) => setRange(value as "7" | "30")}>
          <TabsList>
            <TabsTrigger value="7">近 7 天</TabsTrigger>
            <TabsTrigger value="30">近 30 天</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        按库存流水从当前总量回推（启用元件合计数量）
      </p>
      <ChartContainer config={trendConfig} className="mt-3 h-[240px] w-full">
        <AreaChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
          <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--color-value)"
            fill="var(--color-value)"
            fillOpacity={0.18}
            strokeWidth={2}
          />
        </AreaChart>
      </ChartContainer>
    </section>
  );
}

export function TypeChart({ stats }: { stats: TypeStat[] }) {
  const data = useMemo(
    () =>
      stats.map((item) => ({
        label: item.label.replace(/大盒$/, ""),
        quantity: item.quantity,
        items: item.itemCount,
      })),
    [stats],
  );

  return (
    <section className="glass rounded-2xl p-5">
      <h2 className="font-heading text-base font-semibold">类型分布</h2>
      <p className="mt-1 text-xs text-muted-foreground">各容器类型的启用库存合计</p>
      <ChartContainer config={typeConfig} className="mt-3 h-[240px] w-full">
        <BarChart data={data} margin={{ left: 4, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="quantity" fill="var(--color-quantity)" radius={6} />
        </BarChart>
      </ChartContainer>
    </section>
  );
}
