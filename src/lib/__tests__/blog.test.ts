import { describe, expect, it } from "vitest";
import { renderMarkdown, serializeJsonLd } from "@/lib/blog";

describe("blog rendering", () => {
  it("sanitizes raw HTML and unsafe links from markdown content", async () => {
    const html = await renderMarkdown([
      "# Title",
      "",
      "<script>alert('xss')</script>",
      "",
      '[bad link](javascript:alert("xss"))',
      "",
      "## Section",
    ].join("\n"));

    expect(html).not.toContain("<script");
    expect(html).not.toContain("javascript:alert");
    expect(html).toContain('<h2 id="user-content-section">');
    expect(html).toContain('<a href="#section">Section</a>');
  });

  it("escapes less-than characters in JSON-LD payloads", () => {
    expect(
      serializeJsonLd({
        headline: "</script><script>alert(1)</script>",
      }),
    ).toBe(
      '{"headline":"\\u003c/script>\\u003cscript>alert(1)\\u003c/script>"}',
    );
  });
});
