import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

const blogRoot = path.join(process.cwd(), "content", "blog");
const contentDirectories = ["posts", "pillars"].map((directory) =>
  path.join(blogRoot, directory),
);
const requiredStringFields = ["title", "slug", "status"];
const failures = [];
let checked = 0;

function parseFrontmatter(source) {
  const normalized = source.replace(/^\uFEFF/, "");
  const match =
    /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(normalized);

  if (!match) {
    throw new Error("Missing or unterminated YAML frontmatter");
  }

  const data = parseYaml(match[1]);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Blog frontmatter must be a YAML object");
  }

  return data;
}

for (const directory of contentDirectories) {
  if (!fs.existsSync(directory)) continue;

  for (const filename of fs.readdirSync(directory)) {
    if (!filename.endsWith(".md")) continue;

    const filePath = path.join(directory, filename);
    checked += 1;

    try {
      const source = fs.readFileSync(filePath, "utf8");
      const data = parseFrontmatter(source);

      for (const field of requiredStringFields) {
        if (typeof data[field] !== "string" || data[field].trim() === "") {
          failures.push(`${filePath}: missing or invalid ${field}`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${filePath}: ${message}`);
    }
  }
}

if (failures.length > 0) {
  console.error(`Blog frontmatter validation failed (${failures.length}):`);
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Blog frontmatter validation passed for ${checked} files.`);
}
