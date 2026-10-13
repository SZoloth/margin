import { cn } from "@/lib/cn";

/** Shared look for the Writing rules section: Notes, Suggested and Rules. */

/** Margin's reading face, for rule and note text. */
export const SERIF = "font-['Newsreader',Georgia,serif]";

export const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]";

export const FIELD_CLASS = cn(
  "w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-page)] px-2 py-1 text-[length:var(--text-sm)] text-[var(--color-text-primary)]",
  FOCUS_RING,
);

export const LINK_BUTTON_CLASS = cn(
  "cursor-pointer rounded-[var(--radius-xs)] text-[length:var(--text-xs)] text-[var(--color-text-secondary)] underline underline-offset-2 transition-colors duration-100 hover:text-[var(--color-text-primary)]",
  FOCUS_RING,
);

export const BUTTON_SECONDARY_CLASS = cn(
  "cursor-pointer rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-page)] px-2.5 py-1 text-[length:var(--text-xs)] text-[var(--color-text-secondary)] transition-colors duration-100 hover:bg-[var(--hover-bg)] disabled:cursor-default disabled:opacity-50",
  FOCUS_RING,
);

export const BUTTON_PRIMARY_CLASS = cn(
  "cursor-pointer rounded-[var(--radius-sm)] border border-[var(--color-text-primary)] bg-[var(--color-text-primary)] px-2.5 py-1 text-[length:var(--text-xs)] font-medium text-[var(--color-page)] transition-opacity duration-100 hover:opacity-90 disabled:cursor-default disabled:opacity-50",
  FOCUS_RING,
);

export const SEARCH_CLASS = cn(
  FIELD_CLASS,
  "py-1.5 pr-8 [&::-webkit-search-cancel-button]:appearance-none",
);

export function Chip({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      title={title}
      className={cn(
        "cursor-pointer rounded-[var(--radius-pill)] border border-[var(--color-border)] px-2.5 py-[3px] text-[length:var(--text-xs)] transition-colors duration-100",
        FOCUS_RING,
        active
          ? "bg-[var(--color-text-primary)] text-[var(--color-page)]"
          : "bg-[var(--color-page)] text-[var(--color-text-secondary)] hover:bg-[var(--hover-bg)]",
      )}
    >
      {children}
    </button>
  );
}

export function Chevron({ open }: { open: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 text-[length:var(--text-xs)] text-[var(--color-text-secondary)] transition-transform duration-150 ease-[var(--ease-micro)]"
      style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
    >
      {"▾"}
    </span>
  );
}

/** The "/" hint inside a search field, hidden once the user types. */
export function SlashHint() {
  return (
    <kbd
      aria-hidden="true"
      className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-[var(--radius-xs)] border border-[var(--color-border)] px-1 text-[length:var(--text-xs)] text-[var(--color-text-secondary)]"
    >
      /
    </kbd>
  );
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** An empty state that teaches the next step instead of announcing absence. */
export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="max-w-[480px] py-12">
      <p className={cn(SERIF, "text-[length:var(--text-lg)] text-[var(--color-text-primary)]")}>{title}</p>
      {children && (
        <div className="mt-2 text-[length:var(--text-sm)] leading-[1.6] text-[var(--color-text-secondary)]">
          {children}
        </div>
      )}
    </div>
  );
}
