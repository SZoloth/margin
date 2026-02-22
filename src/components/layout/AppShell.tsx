import { useState, useEffect, useCallback, useRef } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Menu01Icon, Download01Icon } from "@hugeicons/core-free-icons";
import type { Document } from "@/types/document";
import type { Tab } from "@/types/tab";
import type { KeepLocalItem } from "@/types/keep-local";
import { Sidebar } from "@/components/layout/Sidebar";
import { TabBar } from "@/components/layout/TabBar";
import type { useKeepLocal } from "@/hooks/useKeepLocal";
import type { useSearch } from "@/hooks/useSearch";

interface AppShellProps {
  children: React.ReactNode;
  currentDoc: Document | null;
  recentDocs: Document[];
  onOpenFile: () => void;
  onSelectRecentDoc: (doc: Document, newTab: boolean) => void;
  isDirty: boolean;
  keepLocal: ReturnType<typeof useKeepLocal>;
  onSelectKeepLocalItem: (item: KeepLocalItem, newTab: boolean) => void;
  search: ReturnType<typeof useSearch>;
  hasAnnotations?: boolean;
  onExport?: () => void;
  onOpenFilePath: (path: string, newTab: boolean) => void;
  onRenameFile?: (doc: Document, newName: string) => void;
  tocElement?: React.ReactNode;
  // Tab props
  tabs: Tab[];
  activeTabId: string | null;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onReorderTabs: (fromIndex: number, toIndex: number) => void;
  onNewTab: () => void;
}

export function AppShell({
  children,
  currentDoc,
  recentDocs,
  onOpenFile,
  onSelectRecentDoc,
  isDirty: _isDirty,
  keepLocal,
  onSelectKeepLocalItem,
  search,
  hasAnnotations,
  onExport,
  onOpenFilePath,
  onRenameFile,
  tocElement,
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onReorderTabs,
  onNewTab,
}: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 768);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [isTablet, setIsTablet] = useState(() => {
    const w = window.innerWidth;
    return w >= 768 && w <= 1024;
  });
  const prevWidthRef = useRef(window.innerWidth);

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      const prev = prevWidthRef.current;
      prevWidthRef.current = w;
      setIsMobile(w < 768);
      setIsTablet(w >= 768 && w <= 1024);
      if (w < 768 && prev >= 768) setSidebarOpen(false);
    };
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const defaultWidth = isTablet ? 220 : 260;
  const MIN_WIDTH = 160;
  const MAX_WIDTH = 400;
  const COLLAPSE_THRESHOLD = 100;

  const [sidebarWidth, setSidebarWidth] = useState(defaultWidth);
  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(0);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((v) => {
      if (!v) setSidebarWidth(defaultWidth);
      return !v;
    });
  }, [defaultWidth]);

  const closeSidebar = useCallback(() => {
    if (isMobile) setSidebarOpen(false);
  }, [isMobile]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    dragStartXRef.current = e.clientX;
    dragStartWidthRef.current = sidebarWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [sidebarWidth]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current) return;
      const delta = e.clientX - dragStartXRef.current;
      const newWidth = dragStartWidthRef.current + delta;
      if (newWidth < COLLAPSE_THRESHOLD) {
        isDraggingRef.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        setSidebarOpen(false);
        return;
      }
      setSidebarWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, newWidth)));
    };
    const handleMouseUp = () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const hasContent = currentDoc !== null;

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
        <div style={{ width: sidebarWidth, flexShrink: 0 }} />
      )}
      <div
        className={`flex flex-shrink-0 h-full${
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
        <div className="flex flex-col flex-1 min-w-0 border-r" style={{ borderColor: "var(--color-border)" }}>
        <Sidebar
          onOpenFile={() => { onOpenFile(); closeSidebar(); }}
          onSelectRecentDoc={(doc, newTab) => { onSelectRecentDoc(doc, newTab); closeSidebar(); }}
          currentDoc={currentDoc}
          recentDocs={recentDocs}
          searchQuery={search.query}
          onSearch={search.search}
          fileResults={search.fileResults}
          isSearching={search.isSearching}
          onOpenFilePath={(path, newTab) => { onOpenFilePath(path, newTab); closeSidebar(); }}
          onRenameFile={onRenameFile}
          keepLocalItems={keepLocal.items}
          keepLocalIsOnline={keepLocal.isOnline}
          keepLocalIsLoading={keepLocal.isLoading}
          keepLocalQuery={keepLocal.query}
          onKeepLocalSearch={keepLocal.search}
          onSelectKeepLocalItem={(item, newTab) => { onSelectKeepLocalItem(item, newTab); closeSidebar(); }}
        />
        </div>

        {/* Resize handle */}
        {!isMobile && (
          <div
            onMouseDown={handleResizeStart}
            style={{
              width: 6,
              cursor: "col-resize",
              flexShrink: 0,
              position: "relative",
            }}
          >
            {/* Visible line on hover */}
            <div
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: 2,
                width: 2,
                borderRadius: 1,
                backgroundColor: "var(--color-text-secondary)",
                opacity: 0,
                transition: "opacity 120ms ease",
              }}
              className="resize-handle-line"
            />
          </div>
        )}
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
          <button
            type="button"
            onClick={toggleSidebar}
            className="toolbar-hamburger p-1.5"
            aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          >
            <HugeiconsIcon icon={Menu01Icon} size={18} color="currentColor" strokeWidth={1.5} />
          </button>

          {/* Tab bar (inline) */}
          <TabBar
            tabs={tabs}
            activeTabId={activeTabId}
            onSelectTab={onSelectTab}
            onCloseTab={onCloseTab}
            onReorderTabs={onReorderTabs}
            onNewTab={onNewTab}
          />

          {/* Spacer — only when no tabs */}
          {tabs.length === 0 && <div className="flex-1" />}

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
          {!hasContent ? (
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
            <div className="reader-grid">
              <div className="toc-column">{tocElement}</div>
              <div className="reader-content-column">{children}</div>
              <div />
            </div>
          )}
        </div>
      </div>

      {/* Dev mode indicator */}
      {import.meta.env.DEV && (
        <div
          style={{
            position: "fixed",
            bottom: 10,
            right: 10,
            fontSize: 9,
            fontWeight: 700,
            fontFamily: "ui-monospace, 'SF Mono', SFMono-Regular, monospace",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#FF5722",
            backgroundColor: "rgba(255, 87, 34, 0.08)",
            border: "1px solid rgba(255, 87, 34, 0.25)",
            borderRadius: 4,
            padding: "2px 6px",
            pointerEvents: "none",
            userSelect: "none",
            zIndex: 9999,
          }}
        >
          dev
        </div>
      )}
    </div>
  );
}
