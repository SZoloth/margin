import type { Document } from "@/types/document";
import type { KeepLocalItem } from "@/types/keep-local";
import { Sidebar } from "@/components/layout/Sidebar";
import { SidebarKeepLocal } from "@/components/layout/SidebarKeepLocal";
import { SearchBar } from "@/components/common/SearchBar";
import type { useKeepLocal } from "@/hooks/useKeepLocal";
import type { useSearch } from "@/hooks/useSearch";

interface AppShellProps {
  children: React.ReactNode;
  threadPanel?: React.ReactNode;
  currentDoc: Document | null;
  recentDocs: Document[];
  onOpenFile: () => void;
  onSelectRecentDoc: (doc: Document) => void;
  isDirty: boolean;
  keepLocal: ReturnType<typeof useKeepLocal>;
  onSelectKeepLocalItem: (item: KeepLocalItem) => void;
  search: ReturnType<typeof useSearch>;
}

export function AppShell({
  children,
  threadPanel,
  currentDoc,
  recentDocs,
  onOpenFile,
  onSelectRecentDoc,
  isDirty,
  keepLocal,
  onSelectKeepLocalItem,
  search,
}: AppShellProps) {
  const title = currentDoc?.title ?? "Untitled";

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <div
        className="flex flex-col flex-shrink-0 h-full border-r"
        style={{
          width: 260,
          backgroundColor: "var(--color-sidebar)",
          borderColor: "var(--color-border)",
        }}
      >
        {/* Top section: files + search */}
        <div className="flex-shrink-0">
          <Sidebar
            onOpenFile={onOpenFile}
            onSelectRecentDoc={onSelectRecentDoc}
            currentDoc={currentDoc}
            recentDocs={recentDocs}
          />

          {/* Search */}
          <div className="px-4">
            <SearchBar
              query={search.query}
              onSearch={search.search}
              results={search.results}
              isSearching={search.isSearching}
              onSelectResult={(documentId) => {
                // TODO: open document by ID from search results
                console.log("Open document:", documentId);
              }}
            />
          </div>
        </div>

        {/* Bottom section: keep-local */}
        <div
          className="flex-1 overflow-hidden border-t"
          style={{ borderColor: "var(--color-border)" }}
        >
          <SidebarKeepLocal
            items={keepLocal.items}
            isOnline={keepLocal.isOnline}
            isLoading={keepLocal.isLoading}
            query={keepLocal.query}
            onSearch={keepLocal.search}
            onSelectItem={onSelectKeepLocalItem}
          />
        </div>
      </div>

      {/* Main reader pane */}
      <div className="flex flex-1 flex-col h-full" style={{ minWidth: 0 }}>
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
          {!currentDoc ? (
            <div
              className="flex h-full items-center justify-center"
              style={{ color: "var(--color-text-secondary)" }}
            >
              <div className="text-center">
                <p className="text-lg" style={{ fontFamily: "'Newsreader', Georgia, serif" }}>
                  Open a file or select an article to start reading
                </p>
                <p className="mt-2 text-sm opacity-60">
                  Cmd+O to open a file
                </p>
              </div>
            </div>
          ) : (
            children
          )}
        </div>
      </div>

      {/* Thread panel — in-flow flex sibling so reader shrinks */}
      {threadPanel}
    </div>
  );
}
