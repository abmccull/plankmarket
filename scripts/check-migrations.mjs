import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const drizzleDir = join(root, "drizzle");
const journalPath = join(drizzleDir, "meta", "_journal.json");
const baselinePath = join(drizzleDir, "migration-baseline.json");

const journal = JSON.parse(readFileSync(journalPath, "utf8"));
const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));

const sqlFiles = readdirSync(drizzleDir)
  .filter((file) => /^\d{4}_.+\.sql$/.test(file))
  .sort();
const sqlFileSet = new Set(sqlFiles);
const journalSql = journal.entries
  .map((entry) => `${entry.tag}.sql`)
  .sort();
const journalSqlSet = new Set(journalSql);

const actualMissingJournalSql = journalSql
  .filter((file) => !sqlFileSet.has(file))
  .sort();
const actualUnjournaledSql = sqlFiles
  .filter((file) => !journalSqlSet.has(file))
  .sort();

const expectedMissingJournalSql = [...baseline.knownMissingJournalSql].sort();
const expectedUnjournaledSql = [...baseline.knownUnjournaledSql].sort();
const errors = [];

function sameFiles(actual, expected) {
  return (
    actual.length === expected.length &&
    actual.every((file, index) => file === expected[index])
  );
}

if (!sameFiles(actualMissingJournalSql, expectedMissingJournalSql)) {
  errors.push(
    `Journal entries without SQL changed.\n  expected: ${expectedMissingJournalSql.join(", ")}\n  actual:   ${actualMissingJournalSql.join(", ")}`,
  );
}

if (!sameFiles(actualUnjournaledSql, expectedUnjournaledSql)) {
  errors.push(
    `SQL files outside the journal changed.\n  expected: ${expectedUnjournaledSql.join(", ")}\n  actual:   ${actualUnjournaledSql.join(", ")}`,
  );
}

for (const file of baseline.forwardMigrations) {
  if (!sqlFileSet.has(file)) {
    errors.push(`Required forward migration is missing: drizzle/${file}`);
  }
}

for (const file of sqlFiles) {
  try {
    execFileSync(
      "git",
      ["check-ignore", "--no-index", "--quiet", join("drizzle", file)],
      { cwd: root, stdio: "ignore" },
    );
    errors.push(`Migration is ignored by Git: drizzle/${file}`);
  } catch {
    // Exit code 1 means the file is not ignored, which is the required state.
  }
}

const forwardNumbers = baseline.forwardMigrations.map((file) =>
  Number.parseInt(basename(file).slice(0, 4), 10),
);
for (let index = 1; index < forwardNumbers.length; index += 1) {
  if (forwardNumbers[index] <= forwardNumbers[index - 1]) {
    errors.push("forwardMigrations must be strictly ordered by numeric prefix");
    break;
  }
}

if (errors.length > 0) {
  console.error("Migration integrity check failed:\n");
  errors.forEach((error) => console.error(`- ${error}`));
  console.error(
    "\nDo not fabricate missing history. Review drizzle/BASELINE_STRATEGY.md and update the manifest only for an intentional migration change.",
  );
  process.exit(1);
}

console.log(
  `Migration integrity check passed (${sqlFiles.length} SQL files; ${actualMissingJournalSql.length} documented historical gaps).`,
);
if (baseline.baselineRequired) {
  console.warn(
    "Fresh-database migration remains blocked pending the verified live-schema baseline in drizzle/BASELINE_STRATEGY.md.",
  );
}
