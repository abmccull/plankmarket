import { cn } from "@/lib/utils";

interface Metric {
  label: string;
  value: string | number;
  trend?: { value: number; label: string };
}

interface MetricRowProps {
  metrics: Metric[];
  className?: string;
}

export function MetricRow({ metrics, className }: MetricRowProps) {
  return (
    <div className={cn("grid gap-4", className)} style={{ gridTemplateColumns: `repeat(${metrics.length}, 1fr)` }}>
      {metrics.map((m) => (
        <div key={m.label} className="space-y-1">
          <p className="text-xs text-muted-foreground">{m.label}</p>
          <p className="text-xl font-bold font-display">{m.value}</p>
          {m.trend && (
            <p
              className={cn(
                "text-xs",
                m.trend.value >= 0 ? "text-emerald-600" : "text-red-600"
              )}
            >
              {m.trend.value >= 0 ? "+" : ""}
              {m.trend.value}% {m.trend.label}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
