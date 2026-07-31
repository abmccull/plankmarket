import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { describe, expect, it } from "vitest";

import { getAllContent, getAllPosts, getPillarPages } from "@/lib/blog";

const BLOG_ROOT = path.join(process.cwd(), "content", "blog");

function getMarkdownFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      return getMarkdownFiles(entryPath);
    }

    return entry.name.endsWith(".md") ? [entryPath] : [];
  });
}

describe("blog frontmatter", () => {
  it("parses every markdown file under content/blog with gray-matter", () => {
    const files = getMarkdownFiles(BLOG_ROOT);

    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      expect(() => matter(fs.readFileSync(file, "utf8"))).not.toThrow();
    }
  });

  it("loads blog metadata from posts and pillar pages", () => {
    const posts = getAllPosts();
    const pillars = getPillarPages();
    const all = getAllContent();

    expect(posts.length).toBeGreaterThan(0);
    expect(pillars.length).toBeGreaterThan(0);
    expect(all).toHaveLength(posts.length + pillars.length);

    for (const entry of all) {
      expect(entry.slug).toBeTruthy();
      expect(entry.title).toBeTruthy();
      expect(entry.publishDate).toBeTruthy();
    }
  });
});
