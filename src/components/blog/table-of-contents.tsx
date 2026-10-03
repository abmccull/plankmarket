import type { ArticleHeading } from "@/lib/blog";

export function TableOfContents({ headings }: { headings: ArticleHeading[] }) {
  if (headings.length === 0) return null;

  return (
    <nav aria-label="Table of contents">
      <ul className="space-y-1 text-sm border-l border-border">
        {headings.map((heading) => (
          <li key={heading.id}>
            <a
              href={`#${encodeURIComponent(heading.id)}`}
              className={`block min-h-11 py-3 text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 transition-colors ${
                heading.level === 2 ? "pl-4" : "pl-7"
              }`}
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
