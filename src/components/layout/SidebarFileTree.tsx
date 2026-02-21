import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, File01Icon } from "@hugeicons/core-free-icons";
import type { FileEntry } from "@/types/document";

interface SidebarFileTreeProps {
  entries: FileEntry[];
  onSelectFile: (path: string) => void;
  selectedPath: string | null;
}

export function SidebarFileTree({ entries, onSelectFile, selectedPath }: SidebarFileTreeProps) {
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set());

  function toggleDir(path: string) {
    setCollapsedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  function fileName(entry: FileEntry): string {
    return entry.name;
  }

  return (
    <div className="flex flex-col gap-0.5">
      {entries.map((entry) => {
        const isSelected = entry.path === selectedPath;
        const isCollapsed = collapsedDirs.has(entry.path);

        if (entry.is_dir) {
          return (
            <button
              key={entry.path}
              onClick={() => toggleDir(entry.path)}
              className="interactive-item flex items-center gap-2 px-3 py-1.5 text-sm text-left w-full"
              style={{ color: "var(--color-text-secondary)" }}
            >
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                size={14}
                color="currentColor"
                strokeWidth={1.5}
                className="flex-shrink-0 transition-transform"
                style={{
                  transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                }}
              />
              <span className="truncate">{fileName(entry)}</span>
            </button>
          );
        }

        return (
          <button
            key={entry.path}
            onClick={() => onSelectFile(entry.path)}
            className="interactive-item flex items-center gap-2 px-3 py-1.5 text-sm text-left w-full"
            style={{
              backgroundColor: isSelected ? "var(--active-bg)" : "transparent",
              color: isSelected
                ? "var(--color-text-primary)"
                : "var(--color-text-secondary)",
              fontWeight: isSelected ? 500 : 400,
            }}
          >
            <HugeiconsIcon
              icon={File01Icon}
              size={14}
              color="var(--color-text-secondary)"
              strokeWidth={1.5}
              className="flex-shrink-0"
            />
            <span className="truncate">{fileName(entry)}</span>
          </button>
        );
      })}
    </div>
  );
}
