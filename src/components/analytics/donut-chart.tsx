"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

interface DonutChartProps {
  data: Array<{ name: string; value: number; color?: string }>;
  height?: number;
  formatValue?: (value: number) => string;
}

const COLORS = [
  "hsl(142 76% 36%)",   // emerald
  "hsl(var(--primary))",
  "hsl(217 91% 60%)",   // blue
  "hsl(38 92% 50%)",    // amber
  "hsl(280 67% 51%)",   // violet
  "hsl(0 72% 51%)",     // red
  "hsl(var(--muted-foreground))",
];

export function DonutChart({
  data,
  height = 300,
  formatValue = (v) => v.toLocaleString(),
}: DonutChartProps) {
  if (!data.length || data.every((d) => d.value === 0)) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground"
        style={{ height }}
      >
        No data yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={90}
          paddingAngle={2}
          dataKey="value"
          nameKey="name"
        >
          {data.map((entry, i) => (
            <Cell key={entry.name} fill={entry.color ?? COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value) => [formatValue(Number(value ?? 0))]}
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            fontSize: "12px",
          }}
        />
        <Legend
          verticalAlign="bottom"
          height={36}
          formatter={(value) => (
            <span className="text-xs text-foreground">{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
