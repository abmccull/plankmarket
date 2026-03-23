import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";

const CONTENT_DIR = path.join(process.cwd(), "content/blog");
const POSTS_DIR = path.join(CONTENT_DIR, "posts");
const PILLARS_DIR = path.join(CONTENT_DIR, "pillars");

export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  type: "post" | "pillar";
  audience: "Sellers" | "Buyers" | "Both";
  publishDate: string;
  status: string;
  targetKeyword: string;
  secondaryKeywords: string;
  searchIntent: string;
  cluster: string;
  readingTime: number;
  content: string;
};

export type BlogPostMeta = Omit<BlogPost, "content">;

function parseFrontmatter(filePath: string): BlogPost | null {
  const raw = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(raw);

  if (data.status === "draft" && process.env.NODE_ENV === "production") {
    return null;
  }

  const wordCount = content.split(/\s+/).filter(Boolean).length;

  return {
    slug: data.slug,
    title: data.title,
    description: data.description || "",
    type: data.type || "post",
    audience: data.audience || "Both",
    publishDate: data.publish_date || "",
    status: data.status || "draft",
    targetKeyword: data.target_keyword || "",
    secondaryKeywords: data.secondary_keywords || "",
    searchIntent: data.search_intent || "",
    cluster: data.cluster || "uncategorized",
    readingTime: Math.ceil(wordCount / 200),
    content,
  };
}

function loadAllFromDir(dir: string): BlogPost[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => parseFrontmatter(path.join(dir, f)))
    .filter((p): p is BlogPost => p !== null);
}

export function getAllPosts(): BlogPostMeta[] {
  const posts = loadAllFromDir(POSTS_DIR);
  return posts
    .map(({ content: _, ...meta }) => meta)
    .sort(
      (a, b) =>
        new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime()
    );
}

export function getPillarPages(): BlogPostMeta[] {
  const pillars = loadAllFromDir(PILLARS_DIR);
  return pillars
    .map(({ content: _, ...meta }) => meta)
    .sort(
      (a, b) =>
        new Date(a.publishDate).getTime() - new Date(b.publishDate).getTime()
    );
}

export function getAllContent(): BlogPostMeta[] {
  return [...getPillarPages(), ...getAllPosts()];
}

export function getPostBySlug(slug: string): BlogPost | null {
  const allFiles = [
    ...fs
      .readdirSync(POSTS_DIR)
      .map((f) => path.join(POSTS_DIR, f)),
    ...fs
      .readdirSync(PILLARS_DIR)
      .map((f) => path.join(PILLARS_DIR, f)),
  ].filter((f) => f.endsWith(".md"));

  for (const filePath of allFiles) {
    const post = parseFrontmatter(filePath);
    if (post && post.slug === slug) return post;
  }
  return null;
}

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "for", "to", "in", "of", "on", "is", "it",
  "by", "at", "from", "with", "as", "how", "what", "when", "where", "why",
  "your", "you", "that", "this", "are", "was", "be", "do", "does", "vs",
]);

function tokenizeKeywords(
  targetKeyword: string,
  secondaryKeywords: string
): Set<string> {
  const raw = `${targetKeyword}, ${secondaryKeywords}`;
  return new Set(
    raw
      .toLowerCase()
      .split(/[\s,]+/)
      .filter((t) => t.length > 1 && !STOP_WORDS.has(t))
  );
}

export function getRelatedPosts(
  post: BlogPostMeta,
  limit = 3
): BlogPostMeta[] {
  const all = [...getAllPosts(), ...getPillarPages()];
  const postTokens = tokenizeKeywords(post.targetKeyword, post.secondaryKeywords);

  return all
    .filter((p) => p.slug !== post.slug)
    .map((candidate) => {
      let score = 0;

      // Cluster match (+3)
      if (candidate.cluster === post.cluster && post.cluster !== "uncategorized") {
        score += 3;
      }

      // Audience match (+1 full, +0.5 partial for "Both")
      if (candidate.audience === post.audience) {
        score += 1;
      } else if (candidate.audience === "Both" || post.audience === "Both") {
        score += 0.5;
      }

      // Keyword overlap (+0.5 per shared token)
      const candidateTokens = tokenizeKeywords(
        candidate.targetKeyword,
        candidate.secondaryKeywords
      );
      for (const token of postTokens) {
        if (candidateTokens.has(token)) score += 0.5;
      }

      // Pillar boost (+1) — pillar in same cluster gets a bonus
      if (candidate.type === "pillar" && candidate.cluster === post.cluster) {
        score += 1;
      }

      return { candidate, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.candidate);
}

const processor = unified()
  .use(remarkParse)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeSlug)
  .use(rehypeAutolinkHeadings, { behavior: "wrap" })
  .use(rehypeStringify, { allowDangerousHtml: true });

export async function renderMarkdown(content: string): Promise<string> {
  const result = await processor.process(content);
  return String(result);
}

export function extractHeadings(
  content: string
): { id: string; text: string; level: number }[] {
  const headingRegex = /^(#{2,3})\s+(.+)$/gm;
  const headings: { id: string; text: string; level: number }[] = [];
  let match;
  while ((match = headingRegex.exec(content)) !== null) {
    const text = match[2].replace(/\*\*/g, "").trim();
    const id = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-");
    headings.push({ id, text, level: match[1].length });
  }
  return headings;
}
