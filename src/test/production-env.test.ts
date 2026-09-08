/** @vitest-environment node */
import { expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

it("fails missing production services, handles tax policy and never prints supplied secrets", () => {
  const dir = mkdtempSync(join(tmpdir(), "plankmarket-env-"));
  try {
    const path = join(dir, ".env");
    const secret = "sensitive-secret-must-never-appear";
    writeFileSync(path, `STRIPE_SECRET_KEY=${secret}\nSTRIPE_TAX_MODE=platform_liable\n`);
    const result = spawnSync(process.execPath, ["scripts/check-production-env.mjs", "--file", path], { encoding: "utf8" });
    const output = result.stdout + result.stderr;
    expect(result.status).toBe(1);
    expect(output).not.toContain(secret);
    expect(output).not.toContain("is not defined");
    for (const key of ["RESEND_API_KEY", "INNGEST_EVENT_KEY", "INNGEST_SIGNING_KEY", "CRON_SECRET", "VERIFICATION_DOC_ALLOWED_HOSTS", "PRIORITY1_DOCUMENT_ALLOWED_HOSTS"]) expect(output).toContain(key);
    expect(output).toContain("requires legal acknowledgement");
  } finally { rmSync(dir, { recursive: true }); }
});


it.each(["", "STRIPE_TAX_MODE=disabled\n"])("rejects production tax disabled or omitted", (content) => {
  const dir = mkdtempSync(join(tmpdir(), "plankmarket-tax-env-"));
  try {
    const path = join(dir, ".env");
    writeFileSync(path, content);
    const result = spawnSync(process.execPath, ["scripts/check-production-env.mjs", "--file", path], { encoding: "utf8" });
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain("disabled tax blocks checkout");
  } finally { rmSync(dir, { recursive: true }); }
});
