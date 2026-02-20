import type { Document } from "@/types/document";
import { Sidebar } from "@/components/layout/Sidebar";

interface AppShellProps {
  children: React.ReactNode;
  currentDoc: Document | null;
  onOpenFile: () => void;
  isDirty: boolean;
}

export function AppShell({ children, currentDoc, onOpenFile, isDirty }: AppShellProps) {
  const title = currentDoc?.title ?? "Untitled";

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <div
        className="flex-shrink-0 h-full overflow-y-auto border-r"
        style={{
          width: 260,
          backgroundColor: "var(--color-sidebar)",
          borderColor: "var(--color-border)",
        }}
      >
        <Sidebar onOpenFile={onOpenFile} currentDoc={currentDoc} />
      </div>

      {/* Main reader pane */}
      <div className="flex flex-1 flex-col minw-0 h-full" style={{ minWidth: 0 }}>
        {/* Title bar */}
        <div
          className="flex items-center gap-2 px-6 py-3 flex-shrink-0 border-b select-none"
          style={{
            borderColor: "var(--color-border)",
          }}
        >
          <span
            className="text-sm font-medium truncate"
            style={{ color: "var(--color-text-primary)" }}
          >
            {title}
          </span>
          {isDirty && (
            <span
              className="inline-block w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: "var(--color-text-secondary)" }}
              title="Unsaved changes"
            />
          )}
        </div>

        {/* Scrollable reader area */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
