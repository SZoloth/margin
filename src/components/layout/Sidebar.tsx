import type { Document } from "@/types/document";

interface SidebarProps {
  onOpenFile: () => void;
  currentDoc: Document | null;
  recentDocs: Document[];
}

export function Sidebar({ onOpenFile, currentDoc, recentDocs }: SidebarProps) {
  return (
    <div className="flex flex-col px-4 py-5">
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
          aria-label="Open markdown file"
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
      </div>

      {/* Recent documents */}
      <div>
        <h2
          className="text-xs font-semibold uppercase tracking-wider mb-3 px-3"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Recent
        </h2>
        {recentDocs.length === 0 ? (
          <div
            className="px-3 text-sm italic"
            style={{ color: "var(--color-text-secondary)" }}
          >
            No recent documents
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {recentDocs.map((doc) => {
              const isActive = currentDoc?.id === doc.id;
              return (
                <div
                  key={doc.id}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm truncate"
                  style={{
                    color: isActive ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                    backgroundColor: isActive ? "rgba(0, 0, 0, 0.06)" : "transparent",
                    fontWeight: isActive ? 500 : 400,
                  }}
                  title={doc.file_path ?? doc.title ?? "Untitled"}
                >
                  <span
                    style={{
                      fontSize: 11,
                      opacity: 0.5,
                      flexShrink: 0,
                    }}
                  >
                    {doc.source === "keep-local" ? "KL" : "F"}
                  </span>
                  <span className="truncate">
                    {doc.title ?? "Untitled"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
