import { useEffect } from "react";
import { cn } from "@/lib/cn";

const SECTIONS = [
  { id: "reading", label: "Reading" },
  { id: "writing", label: "Writing" },
  { id: "integrations", label: "Integrations" },
] as const;

interface SettingsNavProps {
  activeSection: string;
  onSelect: (section: string) => void;
  onClose: () => void;
}

export function SettingsNav({ activeSection, onSelect, onClose }: SettingsNavProps) {
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
            aria-current={activeSection === section.id ? "true" : undefined}
            className={cn(
              "rounded-[var(--radius-sm)] px-3 py-2 text-left text-[length:var(--text-sm)] font-medium transition-colors duration-150",
              activeSection === section.id
                ? "bg-[var(--color-surface-subtle)] text-[var(--color-text-primary)] font-semibold"
                : "text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]",
            )}
          >
            {section.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
