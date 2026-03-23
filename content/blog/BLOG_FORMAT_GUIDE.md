# PlankMarket Blog Format Guide

Canonical reference for all blog content in `content/blog/`.

---

## Frontmatter Schema

Every markdown file requires YAML frontmatter between `---` fences.

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | H1 headline. 50-65 chars for SEO. |
| `slug` | string | URL path segment (`/blog/{slug}`). Lowercase, hyphenated. |
| `target_keyword` | string | Primary SEO keyword this post targets. |
| `secondary_keywords` | string | Comma-separated related keywords. |
| `search_intent` | string | `informational`, `transactional`, or `informational/transactional`. |
| `type` | `post` or `pillar` | Regular posts go in `posts/`, pillar pages in `pillars/`. |
| `cluster` | string | Topical group. Must match one of the 6 clusters (see below). |
| `publish_date` | string | ISO date in quotes: `'2026-04-15'`. |
| `status` | string | `published` or `draft`. Drafts are excluded in production. |
| `audience` | `Sellers`, `Buyers`, or `Both` | Who this content serves. Drives related post matching and badge display. |
| `description` | string | Meta description. 120-155 chars. No em-dashes. |

### Clusters

Every post and pillar must belong to exactly one cluster:

| Cluster | Description |
|---------|-------------|
| `surplus-liquidation` | Selling, pricing, and managing excess flooring inventory |
| `closeout-buying` | Purchasing closeout flooring: costs, quality, process |
| `contractor-sourcing` | Contractor-focused material sourcing and margins |
| `trends-authority` | Material trends, product spotlights, market authority |
| `real-estate` | Flooring for flips, rentals, and investment properties |
| `b2b-marketplace` | B2B platforms, marketplace comparison, industry tools |

### Example Frontmatter (Regular Post)

```yaml
---
title: How to Price Closeout Flooring for Distributors
slug: how-to-price-closeout-flooring-distributors
target_keyword: price closeout flooring
secondary_keywords: 'flooring closeout pricing, surplus flooring price, distributor pricing guide'
search_intent: informational
type: post
cluster: surplus-liquidation
publish_date: '2026-05-15'
status: published
audience: Sellers
description: >-
  Pricing closeout flooring too high means it sits. Too low means you lose
  margin. Here's how to find the number that moves product.
---
```

### Example Frontmatter (Pillar Page)

```yaml
---
title: The Complete Guide to Buying Closeout Flooring
slug: closeout-flooring-guide
target_keyword: closeout flooring
secondary_keywords: 'closeout flooring deals, surplus flooring, discount flooring wholesale'
search_intent: informational/transactional
type: pillar
cluster: closeout-buying
publish_date: '2026-03-27'
status: published
audience: Both
description: >-
  Closeout flooring is the same product at a better price. The only difference:
  someone needs it gone.
---
```

---

## Content Structure

### Required Sections (in order)

1. **Intro paragraph** (2-4 sentences) -- Hook the reader. State the problem or promise.
2. **H2 sections** -- Main topics. 3-8 per post; pillar pages may have more.
3. **H3 subsections** -- Break up long H2 sections. Optional but recommended for 200+ word sections.
4. **Conclusion** -- Summarize key takeaways in 2-3 sentences.
5. **CTA** -- Handled automatically by the `<BlogCta>` component. Do not add CTAs in markdown.

### Heading Rules

- Start content with `# Title` matching the frontmatter `title`.
- Use `##` for main sections and `###` for subsections.
- Do NOT use `####` or deeper. Restructure content instead.
- Headings should be descriptive and keyword-relevant.
- Posts with 3+ headings automatically get a Table of Contents sidebar.

---

## Supported Markdown

### Text Formatting

```markdown
**Bold text** for emphasis on key terms.

*Italic text* for product names or light emphasis.

Regular paragraph text. Keep paragraphs to 3-4 sentences max.
```

### Lists

```markdown
- Unordered list item
- Another item
- Nested items are fine

1. Ordered list item
2. Another item
```

### Links

```markdown
[Link text](/blog/other-post-slug)
[External link](https://example.com)
```

### Tables

```markdown
| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Data     | Data     | Data     |
```

### Horizontal Rules

```markdown
---
```

---

## What NOT to Use

These elements are either unsupported by the renderer or break visual consistency:

- **Images** -- No `![alt](src)` in post content. Images are handled at the page level.
- **Blockquotes** -- No `>` blockquotes. Rephrase as regular text or a bold callout.
- **Code blocks** -- No fenced code blocks in published content. This is a flooring blog.
- **H4+ headings** -- No `####` or deeper. Use H2/H3 only.
- **Raw HTML** -- No inline HTML tags. Markdown only.
- **Em-dashes** -- Never use `--` or `---` as punctuation. Use colons, commas, or periods instead.

---

## New Post Template

Copy this template when creating a new post:

```markdown
---
title: Your Post Title Here
slug: your-post-slug-here
target_keyword: primary keyword
secondary_keywords: 'keyword two, keyword three, keyword four'
search_intent: informational
type: post
cluster: CLUSTER_NAME
publish_date: 'YYYY-MM-DD'
status: draft
audience: Buyers
description: >-
  A compelling 120-155 character meta description that includes the target
  keyword and tells readers what they'll learn.
---

# Your Post Title Here

Opening paragraph that hooks the reader. State the problem this post solves or the question it answers. 2-4 sentences.

## First Main Section

Content for the first major topic. Break into paragraphs of 3-4 sentences.

### Subsection If Needed

More detailed content under the first section.

## Second Main Section

Continue with the next major topic.

## Conclusion

Summarize the key takeaways in 2-3 sentences. Reinforce the main point.
```

---

## File Naming

- **Regular posts:** `content/blog/posts/{slug}.md`
- **Pillar pages:** `content/blog/pillars/{slug-without-guide-suffix}.md`
- Filename should match or closely relate to the `slug` field.

## Related Posts

Related posts are automatically generated based on:
1. Cluster match (strongest signal)
2. Audience match
3. Keyword token overlap
4. Pillar boost (pillars in the same cluster rank higher)

To improve related post quality, ensure `cluster`, `audience`, `target_keyword`, and `secondary_keywords` are accurate.
