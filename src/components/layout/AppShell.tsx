import { useState, useEffect, useCallback } from "react";
import type { Document } from "@/types/document";
import type { KeepLocalItem } from "@/types/keep-local";
import { Sidebar } from "@/components/layout/Sidebar";
import { SidebarKeepLocal } from "@/components/layout/SidebarKeepLocal";
import { SearchBar } from "@/components/common/SearchBar";
import type { useKeepLocal } from "@/hooks/useKeepLocal";
import type { useSearch } from "@/hooks/useSearch";

interface AppShellProps {
  children: React.ReactNode;
  marginPanel?: React.ReactNode;
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
  marginPanel,
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      setIsMobile(w < 768);
      setIsTablet(w >= 768 && w <= 1024);
      if (w < 768) setSidebarOpen(false);
      else setSidebarOpen(true);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), []);

  const closeSidebar = useCallback(() => {
    if (isMobile) setSidebarOpen(false);
  }, [isMobile]);

  const sidebarWidth = isTablet ? 220 : 260;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile overlay backdrop */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={closeSidebar}
          style={{ transition: "opacity 200ms ease" }}
        />
      )}

      {/* Sidebar (left) */}
      {!isMobile && sidebarOpen && (
        <div style={{ width: sidebarWidth, flexShrink: 0, transition: "width 200ms ease" }} />
      )}
      <div
        className={`flex flex-col flex-shrink-0 h-full border-r${
          isMobile ? " fixed z-50 top-0 left-0" : " fixed left-0 top-0"
        }`}
        style={{
          width: sidebarWidth,
          backgroundColor: "var(--color-sidebar)",
          borderColor: "var(--color-border)",
          transform: sidebarOpen ? "translateX(0)" : `translateX(-${sidebarWidth}px)`,
          transition: "transform 200ms ease",
          ...(isMobile ? { boxShadow: sidebarOpen ? "4px 0 12px rgba(0,0,0,0.15)" : "none" } : {}),
        }}
      >
        {/* Top section: files + search */}
        <div className="flex-shrink-0">
          <Sidebar
            onOpenFile={() => { onOpenFile(); closeSidebar(); }}
            onSelectRecentDoc={(doc) => { onSelectRecentDoc(doc); closeSidebar(); }}
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
                closeSidebar();
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
            onSelectItem={(item) => { onSelectKeepLocalItem(item); closeSidebar(); }}
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
            paddingLeft: isMobile ? "0.75rem" : undefined,
          }}
        >
          {/* Hamburger toggle (left side) */}
          {(isMobile || isTablet) && (
            <button
              type="button"
              onClick={toggleSidebar}
              className="toolbar-hamburger p-1.5 rounded"
              aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 5H15M3 9H15M3 13H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          )}

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
        <div className="flex-1 overflow-y-auto" data-scroll-container>
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

      {/* Margin notes panel (right) */}
      {marginPanel && (
        <div
          className="flex-shrink-0 border-l h-full overflow-y-auto"
          style={{
            width: 280,
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-page)",
          }}
        >
          {marginPanel}
        </div>
      )}
    </div>
  );
}
