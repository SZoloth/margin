import { useState, useEffect, useCallback } from "react";
import { useAnimatedPresence } from "@/hooks/useAnimatedPresence";
import { useChrome } from "@/hooks/useChrome";
import { ChromeBar } from "@/components/layout/ChromeBar";
import { CommandPalette } from "@/components/layout/CommandPalette";
import type { Document } from "@/types/document";
import type { Tab } from "@/types/tab";
import type { Editor } from "@tiptap/core";
import { FindBar } from "@/components/editor/FindBar";

interface AppShellProps {
  children: React.ReactNode;
  onOpenSettings: () => void;
  currentDoc: Document | null;
  recentDocs: Document[];
  onOpenFile: () => void;
  onSelectRecentDoc: (doc: Document, newTab: boolean) => void;
  onOpenFilePath: (path: string, newTab: boolean) => void;
  onExport?: () => void;
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
  onOpenFind?: () => void;
  // Onboarding
  welcomeBar?: React.ReactNode;
  hasSampleContent?: boolean;
  // Reader layout
  tocElement?: React.ReactNode;
  marginIndicators?: React.ReactNode;
}

export function AppShell({
  children,
  onOpenSettings,
  currentDoc,
  recentDocs,
  onOpenFile,
  onSelectRecentDoc,
  onOpenFilePath,
  onExport,
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onReorderTabs,
  onNewTab,
  editor,
  findBarOpen,
  onCloseFindBar,
  onOpenFind,
  welcomeBar,
  hasSampleContent,
  tocElement,
  marginIndicators,
}: AppShellProps) {
  const chrome = useChrome();
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Auto-reveal chrome on mount, hide after 1500ms
  useEffect(() => {
    chrome.showChrome(1500);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-reveal chrome when a new tab is created (tabs.length increases)
  const prevTabCountRef = { current: tabs.length };
  useEffect(() => {
    const prev = prevTabCountRef.current;
    prevTabCountRef.current = tabs.length;
    if (tabs.length > prev) {
      chrome.showChrome(1500);
    }
  }, [tabs.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cmd+K to open/close palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.code === "KeyK") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const hasContent = currentDoc !== null || !!hasSampleContent;
  const emptyState = useAnimatedPresence(!hasContent, 300);
  const [contentEntranceDone, setContentEntranceDone] = useState(false);

  useEffect(() => {
    if (hasContent) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setContentEntranceDone(true));
      });
    } else {
      setContentEntranceDone(false);
    }
  }, [hasContent]);

  // Tab crossfade
  const [tabFadeVisible, setTabFadeVisible] = useState(true);
  const prevTabIdRef = { current: activeTabId };
  const tabFadeTimerRef = { current: null as ReturnType<typeof setTimeout> | null };
  useEffect(() => {
    if (activeTabId && activeTabId !== prevTabIdRef.current) {
      prevTabIdRef.current = activeTabId;
      if (tabFadeTimerRef.current) clearTimeout(tabFadeTimerRef.current);
      setTabFadeVisible(false);
      tabFadeTimerRef.current = setTimeout(() => setTabFadeVisible(true), 80);
    }
    return () => {
      if (tabFadeTimerRef.current) clearTimeout(tabFadeTimerRef.current);
    };
  }, [activeTabId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClosePalette = useCallback(() => setPaletteOpen(false), []);

  return (
    <div
      className="flex flex-col h-dvh overflow-hidden"
      style={{ backgroundColor: "var(--color-page)" }}
    >
      {/* Invisible hover hotzone — 24px — triggers chrome reveal + drag region */}
      <div
        data-tauri-drag-region
        onMouseEnter={chrome.handleHotzoneEnter}
        onMouseLeave={chrome.handleChromeLeave}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 24,
          zIndex: 10,
          pointerEvents: chrome.chromeVisible ? "none" : "auto",
        }}
      />

      {/* Auto-collapsing chrome bar — push-down flex child */}
      <ChromeBar
        isVisible={chrome.chromeVisible}
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={onSelectTab}
        onCloseTab={onCloseTab}
        onReorderTabs={onReorderTabs}
        onNewTab={onNewTab}
        onMouseEnter={chrome.handleChromeEnter}
        onMouseLeave={chrome.handleChromeLeave}
      />

      <FindBar editor={editor} isOpen={findBarOpen} onClose={onCloseFindBar} />

      {welcomeBar}

      {/* Scrollable reader area */}
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
              transition: emptyState.isVisible ? "none" : "opacity 300ms var(--ease-exit)",
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
                Open a file with ⌘O to start reading.
              </p>
              <div style={{ marginTop: 12 }}>
                <kbd style={{ fontFamily: "ui-monospace, 'SF Mono', monospace", fontSize: "0.75rem", padding: "1px 5px", borderRadius: 4, border: "1px solid var(--color-border)", backgroundColor: "var(--hover-bg)" }}>⌘O</kbd>
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

      {/* Command palette */}
      <CommandPalette
        isOpen={paletteOpen}
        onClose={handleClosePalette}
        recentDocs={recentDocs}
        onSelectRecentDoc={onSelectRecentDoc}
        onOpenFile={onOpenFile}
        onOpenFilePath={onOpenFilePath}
        onExport={onExport}
        onOpenSettings={onOpenSettings}
        onCloseTab={tabs.length > 0 && activeTabId ? () => onCloseTab(activeTabId) : undefined}
        onOpenFind={onOpenFind}
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
