import { useState, useEffect, useCallback } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Menu01Icon, Download01Icon } from "@hugeicons/core-free-icons";
import type { Document } from "@/types/document";
import type { KeepLocalItem } from "@/types/keep-local";
import { Sidebar } from "@/components/layout/Sidebar";
import { SidebarKeepLocal } from "@/components/layout/SidebarKeepLocal";
import type { useKeepLocal } from "@/hooks/useKeepLocal";
import type { useSearch } from "@/hooks/useSearch";

interface AppShellProps {
  children: React.ReactNode;
  currentDoc: Document | null;
  recentDocs: Document[];
  onOpenFile: () => void;
  onSelectRecentDoc: (doc: Document) => void;
  isDirty: boolean;
  keepLocal: ReturnType<typeof useKeepLocal>;
  onSelectKeepLocalItem: (item: KeepLocalItem) => void;
  search: ReturnType<typeof useSearch>;
  hasAnnotations?: boolean;
  onExport?: () => void;
  onOpenFilePath: (path: string) => void;
}

export function AppShell({
  children,
  currentDoc,
  recentDocs,
  onOpenFile,
  onSelectRecentDoc,
  isDirty,
  keepLocal,
  onSelectKeepLocalItem,
  search,
  hasAnnotations,
  onExport,
  onOpenFilePath,
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
            searchQuery={search.query}
            onSearch={search.search}
            fileResults={search.fileResults}
            isSearching={search.isSearching}
            onOpenFilePath={(path) => { onOpenFilePath(path); closeSidebar(); }}
          />
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
              className="toolbar-hamburger p-1.5"
              aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
            >
              <HugeiconsIcon icon={Menu01Icon} size={18} color="currentColor" strokeWidth={1.5} />
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

          {/* Spacer */}
          <div className="flex-1" />

          {hasAnnotations && onExport && (
            <button
              type="button"
              onClick={onExport}
              className="btn-sm p-1"
              style={{ color: "var(--color-text-secondary)" }}
              aria-label="Export annotations"
              title="Export annotations (⌘⇧E)"
            >
              <HugeiconsIcon icon={Download01Icon} size={16} color="currentColor" strokeWidth={1.5} />
            </button>
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

    </div>
  );
}
