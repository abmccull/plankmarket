"use client";

import {
  AreaChart as RechartsAreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format, parseISO } from "date-fns";

interface AreaChartProps {
  data: Array<{ date: string; [key: string]: string | number }>;
  dataKey: string;
  secondaryDataKey?: string;
  color?: string;
  secondaryColor?: string;
  height?: number;
  formatValue?: (value: number) => string;
  formatDate?: (date: string) => string;
}

export function AreaChart({
  data,
  dataKey,
  secondaryDataKey,
  color = "hsl(var(--primary))",
  secondaryColor = "hsl(var(--muted-foreground))",
  height = 300,
  formatValue = (v) => v.toLocaleString(),
  formatDate,
}: AreaChartProps) {
  const defaultFormatDate = (dateStr: string) => {
    try {
      const d = parseISO(dateStr);
      return format(d, "MMM d");
    } catch {
      return dateStr;
    }
  };

  const fmtDate = formatDate ?? defaultFormatDate;

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

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsAreaChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
        <defs>
          <linearGradient id={`gradient-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.2} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="date"
          tickFormatter={fmtDate}
          tick={{ fontSize: 12 }}
          className="text-muted-foreground"
        />
        <YAxis
          tickFormatter={(v) => formatValue(v)}
          tick={{ fontSize: 12 }}
          className="text-muted-foreground"
          width={60}
        />
        <Tooltip
          formatter={(value) => [formatValue(Number(value ?? 0)), dataKey]}
          labelFormatter={(label) => fmtDate(String(label))}
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            fontSize: "12px",
          }}
        />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          fillOpacity={1}
          fill={`url(#gradient-${dataKey})`}
          strokeWidth={2}
        />
        {secondaryDataKey && (
          <Area
            type="monotone"
            dataKey={secondaryDataKey}
            stroke={secondaryColor}
            fill="none"
            strokeWidth={1.5}
            strokeDasharray="5 5"
          />
        )}
      </RechartsAreaChart>
    </ResponsiveContainer>
  );
}
