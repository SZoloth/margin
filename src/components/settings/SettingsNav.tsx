import { useEffect } from "react";
import { cn } from "@/lib/cn";
import { useTestRunContext } from "@/hooks/useTestRunContext";

export type Section = "reading" | "writing" | "style-memory" | "dashboard" | "integrations" | "help" | "about";

// "writing" folded into Reading; "dashboard" (rule tests against Claude)
// lives under Writing rules. Both ids stay valid for old deep links.
export const SECTIONS: { id: Section; label: string }[] = [
  { id: "reading", label: "Reading" },
  { id: "style-memory", label: "Writing rules" },
  { id: "integrations", label: "Integrations" },
  { id: "help", label: "Help" },
  { id: "about", label: "About" },
];

/** The nav item a section belongs to. */
function navIdFor(section: Section): Section {
  if (section === "dashboard") return "style-memory";
  if (section === "writing") return "reading";
  return section;
}

interface SettingsNavProps {
  activeSection: Section;
  onSelect: (section: Section) => void;
  onClose: () => void;
}

export function SettingsNav({ activeSection, onSelect, onClose }: SettingsNavProps) {
  const { isTestRunning } = useTestRunContext();
  const current = navIdFor(activeSection);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <nav className="flex w-[200px] shrink-0 flex-col bg-[var(--color-sidebar)]">
      <button
        type="button"
        onClick={onClose}
        aria-label="Back to app"
        className="flex items-center gap-2 px-5 pt-5 pb-4 text-[length:var(--text-sm)] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors duration-150"
      >
        <span aria-hidden="true">&larr;</span>
        Settings
      </button>

      <div className="flex flex-col gap-0.5 px-3">
        {SECTIONS.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => onSelect(section.id)}
            aria-current={current === section.id ? "true" : undefined}
            className={cn(
              "rounded-[var(--radius-sm)] px-3 py-2 text-left text-[length:var(--text-sm)] font-medium transition-colors duration-150",
              current === section.id
                ? "bg-[var(--color-surface-subtle)] text-[var(--color-text-primary)] font-semibold"
                : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]",
            )}
          >
            <span className="flex items-center gap-2">
              {section.label}
              {section.id === "style-memory" && isTestRunning && (
                <span
                  className="inline-block h-2 w-2 animate-pulse rounded-full bg-[var(--color-accent)]"
                  title="Rule test running"
                  aria-label="Rule test running"
                />
              )}
            </span>
          </button>
        ))}
      </div>
    </nav>
  );
}
