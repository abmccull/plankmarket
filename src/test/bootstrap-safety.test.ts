/** @vitest-environment node */
import { expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

it("rejects remote bootstrap and mismatched export targets before database access", () => {
  const directory = mkdtempSync(join(tmpdir(), "plankmarket-bootstrap-"));
  try {
    const file = join(directory, ".env");
    const output = join(directory, "export");
    writeFileSync(file, "DATABASE_URL=postgresql://postgres.projectone:private-password@aws-1.pooler.supabase.com:5432/postgres\nNEXT_PUBLIC_SUPABASE_URL=https://projecttwo.supabase.co\n");
    const bootstrap = spawnSync(process.execPath, ["scripts/bootstrap-local-database.mjs", "--file", file, "--disposable-cluster"], { encoding: "utf8" });
    expect(bootstrap.status).toBe(1);
    expect(bootstrap.stderr).toContain("remote databases are forbidden");
    expect(bootstrap.stderr).not.toContain("private-password");
    const exported = spawnSync(process.execPath, ["scripts/export-schema-baseline.mjs", "--file", file, "--out", output], { encoding: "utf8" });
    expect(exported.status).toBe(1);
    expect(exported.stderr).toContain("Database and Auth project references differ");
    expect(exported.stderr).not.toContain("private-password");
    expect(existsSync(output)).toBe(false);
  } finally { rmSync(directory, { recursive: true }); }
});
