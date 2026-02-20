import { useState } from "react";
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
              className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md text-left w-full transition-colors cursor-pointer"
              style={{ color: "var(--color-text-secondary)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "rgba(0, 0, 0, 0.05)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="flex-shrink-0 transition-transform"
                style={{
                  transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                }}
              >
                <path d="M4 6l4 4 4-4" />
              </svg>
              <span className="truncate">{fileName(entry)}</span>
            </button>
          );
        }

        return (
          <button
            key={entry.path}
            onClick={() => onSelectFile(entry.path)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-md text-left w-full transition-colors cursor-pointer"
            style={{
              backgroundColor: isSelected ? "rgba(0, 0, 0, 0.08)" : "transparent",
              color: isSelected
                ? "var(--color-text-primary)"
                : "var(--color-text-secondary)",
              fontWeight: isSelected ? 500 : 400,
            }}
            onMouseEnter={(e) => {
              if (!isSelected) {
                e.currentTarget.style.backgroundColor = "rgba(0, 0, 0, 0.05)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isSelected) {
                e.currentTarget.style.backgroundColor = "transparent";
              }
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="flex-shrink-0"
              style={{ color: "var(--color-text-secondary)" }}
            >
              <path d="M9 1.5H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5.5L9 1.5Z" />
              <path d="M9 1.5V5.5h4" />
            </svg>
            <span className="truncate">{fileName(entry)}</span>
          </button>
        );
      })}
    </div>
  );
}
