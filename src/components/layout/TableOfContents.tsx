import type { TocHeading } from "@/hooks/useTableOfContents";

interface TableOfContentsProps {
  headings: TocHeading[];
  activeHeadingId: string | null;
  onScrollToHeading: (id: string) => void;
}

export function TableOfContents({
  headings,
  activeHeadingId,
  onScrollToHeading,
}: TableOfContentsProps) {
  if (headings.length === 0) return null;

  return (
    <nav className="toc" aria-label="Table of contents">
      <ul>
        {headings.map((h) => (
          <li key={h.id} data-level={h.level}>
            <button
              type="button"
              className={activeHeadingId === h.id ? "toc-active" : ""}
              onClick={() => onScrollToHeading(h.id)}
              data-tooltip={h.text}
            >
              <span className="toc-label">{h.text}</span>
              <span className="toc-dot" />
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
