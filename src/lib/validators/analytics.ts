import { z } from "zod";

export const dateRangeInput = z.object({
  period: z.enum(["7d", "30d", "90d", "12m", "all"]).default("30d"),
});

export type DateRangeInput = z.infer<typeof dateRangeInput>;

export const periods = ["7d", "30d", "90d", "12m", "all"] as const;
export type Period = (typeof periods)[number];

/** Compute start date and truncation interval from a period string. */
export function periodToDateRange(period: Period) {
  const now = new Date();
  let start: Date | null = null;
  let trunc: "day" | "week" | "month" = "day";

  switch (period) {
    case "7d":
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      trunc = "day";
      break;
    case "30d":
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      trunc = "day";
      break;
    case "90d":
      start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      trunc = "week";
      break;
    case "12m":
      start = new Date(now);
      start.setFullYear(start.getFullYear() - 1);
      trunc = "month";
      break;
    case "all":
      start = null;
      trunc = "month";
      break;
  }

  // Previous period for trend comparison (same duration, ending at start)
  let prevStart: Date | null = null;
  if (start) {
    const durationMs = now.getTime() - start.getTime();
    prevStart = new Date(start.getTime() - durationMs);
  }

  return { start, prevStart, end: now, trunc };
}
