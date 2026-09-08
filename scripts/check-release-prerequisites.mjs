import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const issues = [];
for (const role of ["BUYER", "SELLER", "ADMIN"]) {
  const file = process.env[`E2E_${role}_STORAGE_STATE`];
  if (!file || !existsSync(file)) {
    issues.push(`E2E_${role}_STORAGE_STATE must point to a dedicated staging session file`);
    continue;
  }
  try {
    const state = JSON.parse(readFileSync(file, "utf8"));
    if (!state.cookies?.length && !state.origins?.some(origin => origin.localStorage?.length)) {
      issues.push(`${role} session file is empty`);
    }
  } catch { issues.push(`${role} session file is invalid`); }
}
if (!process.env.PLAYWRIGHT_BASE_URL) issues.push("PLAYWRIGHT_BASE_URL must identify the acceptance environment");
if (issues.length) {
  console.error(`Release acceptance prerequisites missing:\n${issues.map(x => `- ${x}`).join("\n")}`);
  process.exit(1);
}
const result = spawnSync(process.execPath, ["node_modules/playwright/cli.js", "test"], { stdio: "inherit", env: process.env });
process.exit(result.status ?? 1);
