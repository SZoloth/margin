import { useState, useEffect, useCallback, useRef } from "react";
import { useAnimatedPresence } from "@/hooks/useAnimatedPresence";
import { useChrome } from "@/hooks/useChrome";
import { HugeiconsIcon } from "@hugeicons/react";
import { Download01Icon, Add01Icon } from "@hugeicons/core-free-icons";
import type { Document } from "@/types/document";
import type { Tab } from "@/types/tab";
import { Sidebar } from "@/components/layout/Sidebar";
import { TabBar } from "@/components/layout/TabBar";
import { CommandPalette } from "@/components/layout/CommandPalette";
import type { useSearch } from "@/hooks/useSearch";
import { useMcpStatus } from "@/hooks/useMcpStatus";
import type { Editor } from "@tiptap/core";
import { FindBar } from "@/components/editor/FindBar";

interface AppShellProps {
  children: React.ReactNode;
  onOpenSettings: () => void;
  currentDoc: Document | null;
  recentDocs: Document[];
  onOpenFile: () => void;
  onSelectRecentDoc: (doc: Document, newTab: boolean) => void;
  isDirty: boolean;
  search: ReturnType<typeof useSearch>;
  hasAnnotations?: boolean;
  onExport?: () => void;
  onOpenFilePath: (path: string, newTab: boolean) => void;
  onRenameFile?: (doc: Document, newName: string) => void;
  tocElement?: React.ReactNode;
  marginIndicators?: React.ReactNode;
  // Tab props
  tabs: Tab[];
  activeTabId: string | null;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onReorderTabs: (fromIndex: number, toIndex: number) => void;
  onNewTab: () => void;
  // Find bar
  editor: Editor | null;
  findBarOpen: boolean;
  onCloseFindBar: () => void;
  // Onboarding
  welcomeBar?: React.ReactNode;
  hasSampleContent?: boolean;
}

export function AppShell({
  children,
  onOpenSettings,
  currentDoc,
  recentDocs,
  onOpenFile,
  onSelectRecentDoc,
  isDirty: _isDirty,
  search,
  hasAnnotations,
  onExport,
  onOpenFilePath,
  onRenameFile,
  tocElement,
  marginIndicators,
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onReorderTabs,
  onNewTab,
  editor,
  findBarOpen,
  onCloseFindBar,
  welcomeBar,
  hasSampleContent,
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

  const { connected: mcpConnected } = useMcpStatus();

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

  // ── Chrome auto-collapse ──────────────────────────────────────────
  const { visible: chromeVisible, show: showChrome, showThenHide: showChromeThenHide, hide: hideChrome, cancelHide: cancelChromeHide } = useChrome(2000);

  // Reveal chrome when a new tab is opened
  const prevTabCountRef = useRef(tabs.length);
  useEffect(() => {
    if (tabs.length > prevTabCountRef.current) {
      showChromeThenHide(2000);
    }
    prevTabCountRef.current = tabs.length;
  }, [tabs.length, showChromeThenHide]);

  // Chrome hover handlers
  const handleHotzoneEnter = useCallback(() => {
    showChrome();
    cancelChromeHide();
  }, [showChrome, cancelChromeHide]);

  const handleChromeLeave = useCallback(() => {
    hideChrome();
  }, [hideChrome]);

  // ── Command palette ───────────────────────────────────────────────
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key === "k" && !e.shiftKey) {
        e.preventDefault();
        setCmdPaletteOpen((v) => !v);
      }
      // Cmd+\ — toggle sidebar
      if (isMod && e.key === "\\") {
        e.preventDefault();
        toggleSidebar();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  // ── Content animations ────────────────────────────────────────────
  const backdrop = useAnimatedPresence(isMobile && sidebarOpen, 200);
  const hasContent = currentDoc !== null || !!hasSampleContent;
  const showExport = !!hasAnnotations && !!onExport;
  const exportBtn = useAnimatedPresence(showExport, 150);
  const emptyState = useAnimatedPresence(!hasContent, 300);
  const [contentEntranceDone, setContentEntranceDone] = useState(false);

  useEffect(() => {
    if (hasContent) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setContentEntranceDone(true);
        });
      });
    } else {
      setContentEntranceDone(false);
    }
  }, [hasContent]);

  // Tab crossfade
  const [tabFadeVisible, setTabFadeVisible] = useState(true);
  const prevTabIdRef = useRef(activeTabId);
  const tabFadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (activeTabId && activeTabId !== prevTabIdRef.current) {
      prevTabIdRef.current = activeTabId;
      if (tabFadeTimeoutRef.current) clearTimeout(tabFadeTimeoutRef.current);
      setTabFadeVisible(false);
      tabFadeTimeoutRef.current = setTimeout(() => {
        setTabFadeVisible(true);
      }, 80);
    }
    return () => {
      if (tabFadeTimeoutRef.current) clearTimeout(tabFadeTimeoutRef.current);
    };
  }, [activeTabId]);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const hasTabs = tabs.length > 0;
  const singleTab = tabs.length === 1;
  // Show the standalone + button when there are 0 or 1 tabs (multi-tab mode has it inside TabBar)
  const showStandaloneNewTab = tabs.length <= 1;

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Mobile overlay backdrop */}
      {backdrop.isMounted && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={closeSidebar}
          style={{
            opacity: backdrop.isVisible ? 1 : 0,
            transition: backdrop.isVisible
              ? "opacity 200ms var(--ease-entrance)"
              : "opacity 150ms var(--ease-exit)",
          }}
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
          transition: sidebarOpen
            ? "transform 200ms var(--ease-entrance)"
            : "transform 150ms var(--ease-exit)",
          ...(isMobile ? { boxShadow: sidebarOpen ? "var(--shadow-lg)" : "none" } : {}),
        }}
      >
        <div className="flex flex-col flex-1 min-w-0">
          <Sidebar
            onOpenFile={() => { onOpenFile(); closeSidebar(); }}
            onSelectRecentDoc={(doc, newTab) => { onSelectRecentDoc(doc, newTab); closeSidebar(); }}
            currentDoc={currentDoc}
            recentDocs={recentDocs}
            searchQuery={search.query}
            onSearch={search.search}
            searchResults={search.results}
            fileResults={search.fileResults}
            isSearching={search.isSearching}
            onOpenFilePath={(path, newTab) => { onOpenFilePath(path, newTab); closeSidebar(); }}
            onRenameFile={onRenameFile}
            onOpenSettings={onOpenSettings}
            tabs={tabs}
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
            <div
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: 2,
                width: 2,
                borderRadius: 1,
                backgroundColor: "var(--color-text-secondary)",
                opacity: 0.15,
                transition: "opacity 120ms ease",
              }}
              className="resize-handle-line"
            />
          </div>
        )}
      </div>

      {/* Main reader pane */}
      <div className="flex flex-1 flex-col h-full" style={{ minWidth: 0, position: "relative" }}>

        {/* ── Auto-collapsing chrome bar ──────────────────────────────── */}

        {/* Invisible hover hotzone — sits just above the chrome bar at all times */}
        <div
          className="chrome-hotzone"
          onMouseEnter={handleHotzoneEnter}
        />

        {/* Chrome bar — slides in/out */}
        <div
          className={`chrome-bar ${chromeVisible ? "chrome-bar-visible" : "chrome-bar-hidden"}`}
          onMouseEnter={handleHotzoneEnter}
          onMouseLeave={handleChromeLeave}
          data-tauri-drag-region
        >
          {/* Traffic-light inset — empty zone reserved for macOS native controls */}
          <div className="chrome-titlebar-inset" data-tauri-drag-region />

          {/* Chrome content row */}
          <div className="chrome-content-row">
            {/* Tabs */}
            {hasTabs && (
              <div className="chrome-tab-area">
                {singleTab ? (
                  /* Single tab: minimal pill label */
                  <div className="chrome-tab-single">
                    {activeTab?.isDirty && (
                      <span
                        style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--color-text-secondary)", flexShrink: 0 }}
                      />
                    )}
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {activeTab?.title || "Untitled"}
                    </span>
                  </div>
                ) : (
                  /* Multiple tabs: full tab bar */
                  <TabBar
                    tabs={tabs}
                    activeTabId={activeTabId}
                    onSelectTab={onSelectTab}
                    onCloseTab={onCloseTab}
                    onReorderTabs={onReorderTabs}
                    onNewTab={onNewTab}
                  />
                )}
              </div>
            )}

            {/* Spacer when no tabs */}
            {!hasTabs && <div style={{ flex: 1 }} />}

            {/* New tab button (shown in 0/1-tab mode; multi-tab mode has it inside TabBar) */}
            {showStandaloneNewTab && (
              <button
                type="button"
                className="chrome-new-tab"
                onClick={onNewTab}
                aria-label="Open file in new tab"
                title="Open file (⌘O)"
              >
                <HugeiconsIcon icon={Add01Icon} size={14} color="currentColor" strokeWidth={2} />
              </button>
            )}

            {/* Export button */}
            {onExport && (
              <button
                type="button"
                onClick={onExport}
                className="chrome-action-btn"
                style={{
                  opacity: exportBtn.isVisible ? 1 : 0,
                  transform: exportBtn.isVisible ? "scale(1)" : "scale(0.9)",
                  transition: exportBtn.isVisible
                    ? "opacity 150ms var(--ease-entrance), transform 150ms var(--ease-entrance)"
                    : "opacity 100ms var(--ease-exit), transform 100ms var(--ease-exit)",
                  pointerEvents: showExport ? "auto" : "none",
                  marginLeft: 6,
                }}
                aria-label="Export annotations"
                title="Export annotations (⌘⇧E)"
                aria-hidden={!showExport}
                disabled={!showExport}
                tabIndex={showExport ? 0 : -1}
              >
                <HugeiconsIcon icon={Download01Icon} size={14} color="currentColor" strokeWidth={1.5} />
                Export
              </button>
            )}

            {/* MCP connected indicator */}
            {showExport && mcpConnected && (
              <span
                className="chrome-mcp-dot"
                title="Connected to Claude"
                style={{ marginLeft: 6 }}
              />
            )}
          </div>
        </div>

        {/* Find bar — sits below chrome (not inside it so it's always accessible) */}
        <FindBar editor={editor} isOpen={findBarOpen} onClose={onCloseFindBar} />

        {welcomeBar}

        {/* Scrollable reader area + empty state */}
        <div className="flex-1 min-h-0" style={{ position: "relative" }}>
          {emptyState.isMounted && (
            <div
              className={!hasContent ? "empty-state-entrance" : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--color-text-secondary)",
                position: "absolute",
                inset: 0,
                zIndex: 1,
                opacity: emptyState.isVisible ? 1 : 0,
                transition: emptyState.isVisible
                  ? "none"
                  : "opacity 300ms var(--ease-exit)",
                pointerEvents: emptyState.isVisible ? "auto" : "none",
              }}
            >
              <div className="text-center" style={{ maxWidth: 480 }}>
                <p
                  style={{
                    fontFamily: "'Newsreader', Georgia, serif",
                    fontStyle: "italic",
                    fontSize: "var(--text-2xl)",
                    letterSpacing: "-0.01em",
                    lineHeight: 1.45,
                    color: "var(--color-text-primary)",
                  }}
                >
                  &ldquo;With me poetry has not been a purpose, but a passion.&rdquo;
                </p>
                <p
                  className="mt-1"
                  style={{
                    fontSize: "var(--text-sm)",
                    letterSpacing: "0.02em",
                    textTransform: "uppercase",
                    color: "var(--color-text-tertiary)",
                  }}
                >
                  Edgar Allan Poe
                </p>
                <div
                  style={{
                    width: 40,
                    height: 1,
                    background: "var(--color-border)",
                    margin: "32px auto",
                  }}
                />
                <p
                  style={{
                    fontFamily: "'Instrument Sans', system-ui, sans-serif",
                    fontSize: "var(--text-lg)",
                    color: "var(--color-text-secondary)",
                  }}
                >
                  Open a file with ⌘O or press ⌘K to navigate.
                </p>
                <div style={{ marginTop: 12, display: "flex", gap: 8, justifyContent: "center" }}>
                  <kbd style={{ fontFamily: "ui-monospace, 'SF Mono', monospace", fontSize: "0.75rem", padding: "1px 5px", borderRadius: 4, border: "1px solid var(--color-border)", backgroundColor: "var(--hover-bg)" }}>⌘O</kbd>
                  <kbd style={{ fontFamily: "ui-monospace, 'SF Mono', monospace", fontSize: "0.75rem", padding: "1px 5px", borderRadius: 4, border: "1px solid var(--color-border)", backgroundColor: "var(--hover-bg)" }}>⌘K</kbd>
                </div>
              </div>
            </div>
          )}
          <div className="h-full overflow-y-auto" data-scroll-container>
            {hasContent && (
              <div
                className="reader-grid"
                style={{
                  opacity: (contentEntranceDone && tabFadeVisible) ? 1 : 0,
                  transition: tabFadeVisible
                    ? "opacity 200ms var(--ease-entrance)"
                    : "opacity 80ms var(--ease-exit)",
                }}
              >
                <div className="toc-column">{tocElement}</div>
                <div className="reader-content-column">{children}</div>
                <div className="margin-column">{marginIndicators}</div>
              </div>
            )}
            {!hasContent && children}
          </div>
        </div>
      </div>

      {/* Command palette */}
      <CommandPalette
        isOpen={cmdPaletteOpen}
        onClose={() => setCmdPaletteOpen(false)}
        tabs={tabs}
        activeTabId={activeTabId}
        recentDocs={recentDocs}
        onSelectTab={onSelectTab}
        onOpenFile={() => { onOpenFile(); }}
        onSelectRecentDoc={(doc) => onSelectRecentDoc(doc, false)}
        onOpenSettings={onOpenSettings}
        onToggleSidebar={toggleSidebar}
      />

      {/* Dev mode indicator */}
      {import.meta.env.DEV && (
        <div
          style={{
            position: "fixed",
            bottom: 10,
            right: 10,
            fontSize: "var(--text-xs)",
            fontWeight: 700,
            fontFamily: "ui-monospace, 'SF Mono', SFMono-Regular, monospace",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#FF5722", /* ds-lint-disable */
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
