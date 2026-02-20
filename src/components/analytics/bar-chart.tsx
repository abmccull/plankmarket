"use client";

import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface BarChartProps {
  data: Array<{ name: string; value: number; color?: string }>;
  color?: string;
  height?: number;
  layout?: "horizontal" | "vertical";
  formatValue?: (value: number) => string;
  onBarClick?: (name: string) => void;
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--secondary))",
  "hsl(142 76% 36%)",   // emerald
  "hsl(38 92% 50%)",    // amber
  "hsl(217 91% 60%)",   // blue
  "hsl(280 67% 51%)",   // violet
  "hsl(0 72% 51%)",     // red
];

export function BarChart({
  data,
  color,
  height = 300,
  layout = "vertical",
  formatValue = (v) => v.toLocaleString(),
  onBarClick,
}: BarChartProps) {
  if (!data.length) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground"
        style={{ height }}
      >
        No data yet
      </div>
    );
  }

  if (layout === "horizontal") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <RechartsBarChart data={data} layout="vertical" margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
          <XAxis type="number" tickFormatter={formatValue} tick={{ fontSize: 12 }} />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 12 }}
            width={100}
          />
          <Tooltip
            formatter={(value) => [formatValue(Number(value ?? 0)), "Value"]}
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              fontSize: "12px",
            }}
          />
          <Bar
            dataKey="value"
            radius={[0, 4, 4, 0]}
            cursor={onBarClick ? "pointer" : undefined}
            onClick={(entry) => onBarClick?.(String(entry?.name ?? ""))}
          >
            {data.map((entry, i) => (
              <Cell key={entry.name} fill={entry.color ?? color ?? COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </RechartsBarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsBarChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
        <YAxis tickFormatter={formatValue} tick={{ fontSize: 12 }} width={60} />
        <Tooltip
          formatter={(value) => [formatValue(Number(value ?? 0)), "Value"]}
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            fontSize: "12px",
          }}
        />
        <Bar
          dataKey="value"
          radius={[4, 4, 0, 0]}
          cursor={onBarClick ? "pointer" : undefined}
          onClick={(entry) => onBarClick?.(String(entry?.name ?? ""))}
        >
          {data.map((entry, i) => (
            <Cell key={entry.name} fill={entry.color ?? color ?? COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </RechartsBarChart>
    </ResponsiveContainer>
  );
}
