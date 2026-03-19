type Heading = { id: string; text: string; level: number };

export function TableOfContents({ headings }: { headings: Heading[] }) {
  if (headings.length === 0) return null;

  return (
    <nav className="sticky top-24" aria-label="Table of contents">
      <h4 className="font-display text-sm text-muted-foreground mb-3 uppercase tracking-wide">
        On this page
      </h4>
      <ul className="space-y-1.5 text-sm border-l border-border">
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              className={`block py-0.5 text-muted-foreground hover:text-foreground transition-colors ${
                h.level === 2 ? "pl-4" : "pl-7"
              }`}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
