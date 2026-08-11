/** @vitest-environment node */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("vercel cron configuration", () => {
  it("schedules the privacy retention sweep daily", () => {
    const vercelConfig = JSON.parse(
      readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"),
    ) as {
      crons?: Array<{ path: string; schedule: string }>;
    };

    expect(vercelConfig.crons).toContainEqual({
      path: "/api/cron/privacy-retention",
      schedule: "30 3 * * *",
    });
  });
});
