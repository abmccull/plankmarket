import fs from "fs";
import path from "path";
import { parse as parseYaml } from "yaml";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import rehypeSlug from "rehype-slug";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

const CONTENT_DIR = path.join(process.cwd(), "content/blog");
const POSTS_DIR = path.join(CONTENT_DIR, "posts");
const PILLARS_DIR = path.join(CONTENT_DIR, "pillars");

function splitFrontmatter(source: string): {
  data: Record<string, unknown>;
  content: string;
} {
  const normalized = source.replace(/^\uFEFF/, "");
  const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(
    normalized,
  );

  if (!match) {
    throw new Error("Missing or unterminated YAML frontmatter");
  }

  const parsed = parseYaml(match[1]);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Blog frontmatter must be a YAML object");
  }

  return {
    data: parsed as Record<string, unknown>,
    content: normalized.slice(match[0].length),
  };
}

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
  const { data, content } = splitFrontmatter(raw);

  if (data.status === "draft" && process.env.NODE_ENV === "production") {
    return null;
  }

  const wordCount = content.split(/\s+/).filter(Boolean).length;

  return {
    slug: String(data.slug ?? ""),
    title: String(data.title ?? ""),
    description: String(data.description ?? ""),
    type: data.type === "pillar" ? "pillar" : "post",
    audience:
      data.audience === "Sellers" || data.audience === "Buyers"
        ? data.audience
        : "Both",
    publishDate: String(data.publish_date ?? ""),
    status: String(data.status ?? "draft"),
    targetKeyword: String(data.target_keyword ?? ""),
    secondaryKeywords: String(data.secondary_keywords ?? ""),
    searchIntent: String(data.search_intent ?? ""),
    cluster: String(data.cluster ?? "uncategorized"),
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
    .map(({ content, ...meta }) => {
      void content;
      return meta;
    })
    .sort(
      (a, b) =>
        new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime(),
    );
}

export function getPillarPages(): BlogPostMeta[] {
  const pillars = loadAllFromDir(PILLARS_DIR);
  return pillars
    .map(({ content, ...meta }) => {
      void content;
      return meta;
    })
    .sort(
      (a, b) =>
        new Date(a.publishDate).getTime() - new Date(b.publishDate).getTime(),
    );
}

export function getAllContent(): BlogPostMeta[] {
  return [...getPillarPages(), ...getAllPosts()];
}

export function getPostBySlug(slug: string): BlogPost | null {
  const allFiles = [
    ...fs.readdirSync(POSTS_DIR).map((f) => path.join(POSTS_DIR, f)),
    ...fs.readdirSync(PILLARS_DIR).map((f) => path.join(PILLARS_DIR, f)),
  ].filter((f) => f.endsWith(".md"));

  for (const filePath of allFiles) {
    const post = parseFrontmatter(filePath);
    if (post && post.slug === slug) return post;
  }
  return null;
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "for",
  "to",
  "in",
  "of",
  "on",
  "is",
  "it",
  "by",
  "at",
  "from",
  "with",
  "as",
  "how",
  "what",
  "when",
  "where",
  "why",
  "your",
  "you",
  "that",
  "this",
  "are",
  "was",
  "be",
  "do",
  "does",
  "vs",
]);

function tokenizeKeywords(
  targetKeyword: string,
  secondaryKeywords: string,
): Set<string> {
  const raw = `${targetKeyword}, ${secondaryKeywords}`;
  return new Set(
    raw
      .toLowerCase()
      .split(/[\s,]+/)
      .filter((t) => t.length > 1 && !STOP_WORDS.has(t)),
  );
}

export function getRelatedPosts(post: BlogPostMeta, limit = 3): BlogPostMeta[] {
  const all = [...getAllPosts(), ...getPillarPages()];
  const postTokens = tokenizeKeywords(
    post.targetKeyword,
    post.secondaryKeywords,
  );

  return all
    .filter((p) => p.slug !== post.slug)
    .map((candidate) => {
      let score = 0;

      // Cluster match (+3)
      if (
        candidate.cluster === post.cluster &&
        post.cluster !== "uncategorized"
      ) {
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
        candidate.secondaryKeywords,
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

export type ArticleHeading = { id: string; text: string; level: number };

// Structural types keep traversal independent of transitive AST dependencies.
type BlogNode = {
  type: string;
  value?: string;
  alt?: string;
  depth?: number;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: BlogNode[];
};

function walk(node: BlogNode, visit: (node: BlogNode) => void): void {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

function visibleText(node: BlogNode): string {
  if (node.type === "text" || node.type === "inlineCode")
    return node.value ?? "";
  if (node.type === "image") return node.alt ?? "";
  if (node.tagName === "img") return String(node.properties?.alt ?? "");
  if (node.type === "break" || node.tagName === "br") return " ";
  return (node.children ?? []).map(visibleText).join("");
}

function normalizedText(node: BlogNode): string {
  return visibleText(node).replace(/\s+/g, " ").trim();
}

function headingLevel(node: BlogNode): number | null {
  return node.type === "element" && /^h[1-6]$/.test(node.tagName ?? "")
    ? Number(node.tagName!.slice(1))
    : null;
}

function createArticleProcessor(title?: string) {
  const rawHeadingIds: string[] = [];
  const headings: ArticleHeading[] = [];

  const processor = unified()
    .use(remarkParse)
    .use(() => (tree: BlogNode) => {
      if (title === undefined) return;
      const first = tree.children?.[0];
      if (
        first?.type === "heading" &&
        first.depth === 1 &&
        normalizedText(first) === title.replace(/\s+/g, " ").trim()
      ) {
        tree.children!.shift();
      }
      walk(tree, (node) => {
        if (node.type === "heading" && node.depth === 1) node.depth = 2;
      });
    })
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(() => (tree: BlogNode) => {
      walk(tree, (node) => {
        if (headingLevel(node) !== null) {
          rawHeadingIds.push(String(node.properties?.id ?? ""));
        }
      });
    })
    // Retain default protocol filtering and DOM clobber protection. Raw HTML is
    // deliberately not enabled in remarkRehype.
    .use(rehypeSanitize, {
      ...defaultSchema,
      attributes: {
        ...defaultSchema.attributes,
        h1: [...(defaultSchema.attributes?.h1 ?? []), "id"],
        h2: [...(defaultSchema.attributes?.h2 ?? []), "id"],
        h3: [...(defaultSchema.attributes?.h3 ?? []), "id"],
        h4: [...(defaultSchema.attributes?.h4 ?? []), "id"],
        h5: [...(defaultSchema.attributes?.h5 ?? []), "id"],
        h6: [...(defaultSchema.attributes?.h6 ?? []), "id"],
      },
    })
    .use(() => (tree: BlogNode) => {
      const rawToFinal = new Map<string, string>();
      const headingNodes: BlogNode[] = [];
      walk(tree, (node) => {
        const level = headingLevel(node);
        if (level === null) return;
        const id = String(node.properties?.id ?? "");
        const rawId = rawHeadingIds[headingNodes.length];
        headingNodes.push(node);
        if (rawId !== undefined) rawToFinal.set(rawId, id);
        if (level === 2 || level === 3) {
          headings.push({ id, text: normalizedText(node), level });
        }
      });

      walk(tree, (node) => {
        const href = node.properties?.href;
        if (
          node.tagName !== "a" ||
          typeof href !== "string" ||
          !href.startsWith("#") ||
          href === "#"
        )
          return;
        let fragment: string;
        try {
          fragment = decodeURIComponent(href.slice(1));
        } catch {
          return;
        }
        // Raw IDs win when namespaces overlap. Non-heading and already-final
        // fragments that are not raw heading IDs are left untouched.
        const target = rawToFinal.get(fragment);
        if (target) node.properties!.href = `#${encodeURIComponent(target)}`;
      });

      // These controlled links are added only after sanitizing authored content.
      // Appending avoids nested anchors when a heading already contains a link.
      for (const node of headingNodes) {
        const id = String(node.properties?.id ?? "");
        const label = normalizedText(node) || "this section";
        node.children ??= [];
        node.children.push({
          type: "element",
          tagName: "a",
          properties: {
            href: `#${encodeURIComponent(id)}`,
            ariaLabel: `Link to ${label}`,
            className: [
              "ml-2",
              "inline-flex",
              "min-h-8",
              "min-w-8",
              "items-center",
              "justify-center",
              "text-muted-foreground",
              "no-underline",
              "focus-visible:outline",
              "focus-visible:outline-2",
              "focus-visible:outline-offset-2",
            ],
          },
          children: [{ type: "text", value: "#" }],
        });
      }
    })
    .use(rehypeStringify);

  return { processor, headings };
}

export async function renderArticle(
  content: string,
  title: string,
): Promise<{ html: string; headings: ArticleHeading[] }> {
  const { processor, headings } = createArticleProcessor(title);
  const result = await processor.process(content);
  return { html: String(result), headings };
}

// Preserve the existing generic Markdown API and H1 behavior for other callers.
export async function renderMarkdown(content: string): Promise<string> {
  const { processor } = createArticleProcessor();
  return String(await processor.process(content));
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
