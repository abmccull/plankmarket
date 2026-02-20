"use client";

import { type Period, periods } from "@/lib/validators/analytics";
import { cn } from "@/lib/utils";

const labels: Record<Period, string> = {
  "7d": "7D",
  "30d": "30D",
  "90d": "90D",
  "12m": "12M",
  all: "All",
};

interface DateRangeSelectorProps {
  value: Period;
  onChange: (period: Period) => void;
}

export function DateRangeSelector({ value, onChange }: DateRangeSelectorProps) {
  return (
    <div className="inline-flex items-center rounded-lg bg-muted p-1 gap-0.5">
      {periods.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={cn(
            "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
            value === p
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {labels[p]}
        </button>
      ))}
    </div>
  );
}
