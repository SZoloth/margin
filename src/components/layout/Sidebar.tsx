import type { Document } from "@/types/document";

interface SidebarProps {
  onOpenFile: () => void;
  currentDoc: Document | null;
}

export function Sidebar({ onOpenFile }: SidebarProps) {
  return (
    <div className="flex flex-col h-full px-4 py-5">
      {/* App header */}
      <div className="mb-6">
        <h1
          className="text-lg font-semibold tracking-tight"
          style={{ color: "var(--color-text-primary)" }}
        >
          Margin
        </h1>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-1 mb-6">
        <button
          onClick={onOpenFile}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md text-left transition-colors cursor-pointer"
          style={{ color: "var(--color-text-primary)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(0, 0, 0, 0.05)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 13.5H2a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3.586a1 1 0 0 1 .707.293L8 4.5h6a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1Z" />
          </svg>
          Open File
        </button>

        <button
          disabled
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md text-left cursor-not-allowed opacity-40"
          style={{ color: "var(--color-text-secondary)" }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 13.5H2a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3.586a1 1 0 0 1 .707.293L8 4.5h6a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1Z" />
            <path d="M5 8.5h6" />
          </svg>
          Open Folder
        </button>
      </div>

      {/* Recent section */}
      <div className="flex-1">
        <h2
          className="text-xs font-semibold uppercase tracking-wider mb-3 px-3"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Recent
        </h2>
        <div
          className="px-3 text-sm italic"
          style={{ color: "var(--color-text-secondary)" }}
        >
          No recent documents
        </div>
      </div>
    </div>
  );
}
