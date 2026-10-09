import { describe, expect, it } from "vitest";
import { getAllContent, getPostBySlug, renderArticle } from "@/lib/blog";
import { PUBLIC_COMMERCIAL_COPY } from "@/lib/public-commercial-copy";
import { TableOfContents } from "@/components/blog/table-of-contents";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

describe("published marketplace articles", () => {
  for (const slug of [
    "b2b-flooring-marketplaces-comparison",
    "b2b-flooring-marketplaces-guide",
  ]) {
    it(`${slug} explains the current marketplace fees`, async () => {
      const post = getPostBySlug(slug);
      expect(post).not.toBeNull();
      const { html } = await renderArticle(post!.content, post!.title);
      const article = document.createElement("article");
      article.innerHTML = html;
      const text = article.textContent!;
      expect(text).toContain(PUBLIC_COMMERCIAL_COPY.sellerMarketplaceFeeLabel);
      expect(text).toContain(PUBLIC_COMMERCIAL_COPY.buyerMarketplaceFeeLabel);
      expect(text).toContain(PUBLIC_COMMERCIAL_COPY.sellerProcessingLabel);
      expect(text).toMatch(/inventory subtotal/i);
      expect(text).toMatch(/freight.*quoted separately/i);
      expect(text).not.toMatch(/2% seller|3% buyer/i);
    });
  }

  it("every article permalink and table-of-contents link resolves to a unique heading", async () => {
    for (const meta of getAllContent()) {
      const post = getPostBySlug(meta.slug)!;
      const { html, headings } = await renderArticle(post.content, post.title);
      const article = document.createElement("article");
      article.innerHTML = html + renderToStaticMarkup(createElement(TableOfContents, { headings }));
      const nodes = Array.from(article.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6"));
      expect(new Set(nodes.map(node => node.id)).size, post.slug).toBe(nodes.length);
      for (const link of article.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
        const fragment = decodeURIComponent(link.getAttribute("href")!.slice(1));
        expect(nodes.filter(node => node.id === fragment), `${post.slug}: ${fragment}`).toHaveLength(1);
      }
    }
  });

  it("keeps duplicate, formatted and encoded authored fragments aligned after sanitizing", async () => {
    const { html, headings } = await renderArticle([
      "# Example",
      "[First](#same) [Second](#same-1) [Unicode](#caf%C3%A9--code)",
      "## Same",
      "## Same",
      "### Café & `code`",
    ].join("\n\n"), "Example");
    const article = document.createElement("article");
    article.innerHTML = html + renderToStaticMarkup(createElement(TableOfContents, { headings }));
    expect(headings.map(heading => heading.id)).toEqual([
      "user-content-same", "user-content-same-1", "user-content-café--code",
    ]);
    for (const link of article.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
      const fragment = decodeURIComponent(link.getAttribute("href")!.slice(1));
      expect(Array.from(article.querySelectorAll("h2,h3")).some(node => node.id === fragment)).toBe(true);
    }
  });
});
