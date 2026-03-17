import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Document } from "@/types/document";
import { useAnimatedPresence } from "@/hooks/useAnimatedPresence";

interface FileResult {
  path: string;
  filename: string;
}

interface Action {
  id: string;
  label: string;
  shortcut: string[];
  onAction: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  recentDocs: Document[];
  onSelectRecentDoc: (doc: Document, newTab: boolean) => void;
  onOpenFile: () => void;
  onOpenFilePath: (path: string, newTab: boolean) => void;
  onExport?: () => void;
  onOpenSettings: () => void;
  onCloseTab?: () => void;
  onOpenFind?: () => void;
}

function ShortcutBadge({ keys }: { keys: string[] }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 2 }}>
      {keys.map((k, i) => (
        <kbd
          key={i}
          style={{
            fontFamily: "ui-monospace, 'SF Mono', monospace",
            fontSize: 11,
            padding: "1px 5px",
            borderRadius: 4,
            border: "1px solid #DFDBD3",
            backgroundColor: "#F5F2EA",
            color: "#6B6560",
            lineHeight: 1.6,
          }}
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}

export function CommandPalette({
  isOpen,
  onClose,
  recentDocs,
  onSelectRecentDoc,
  onOpenFile,
  onOpenFilePath,
  onExport,
  onOpenSettings,
  onCloseTab,
  onOpenFind,
}: CommandPaletteProps) {
  const presence = useAnimatedPresence(isOpen, 150);
  const [query, setQuery] = useState("");
  const [fileResults, setFileResults] = useState<FileResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const actions: Action[] = [
    { id: "open", label: "Open file", shortcut: ["⌘", "O"], onAction: () => { onClose(); onOpenFile(); } },
    ...(onCloseTab ? [{ id: "close", label: "Close tab", shortcut: ["⌘", "W"], onAction: () => { onClose(); onCloseTab(); } }] : []),
    ...(onExport ? [{ id: "export", label: "Export annotations", shortcut: ["⌘", "⇧", "E"], onAction: () => { onClose(); onExport(); } }] : []),
    ...(onOpenFind ? [{ id: "find", label: "Find in document", shortcut: ["⌘", "F"], onAction: () => { onClose(); onOpenFind(); } }] : []),
    { id: "settings", label: "Settings", shortcut: ["⌘", ","], onAction: () => { onClose(); onOpenSettings(); } },
  ];

  const filteredRecent = recentDocs.filter((d) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (d.title ?? "").toLowerCase().includes(q) || (d.file_path ?? "").toLowerCase().includes(q);
  }).slice(0, 5);

  const filteredActions = actions.filter((a) => {
    if (!query) return true;
    return a.label.toLowerCase().includes(query.toLowerCase());
  });

  // mdfind search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!query.trim()) {
      setFileResults([]);
      return;
    }
    searchTimerRef.current = setTimeout(() => {
      invoke<FileResult[]>("search_files_on_disk", { query, limit: 8 })
        .then((results) => {
          // Deduplicate against recentDocs paths
          const recentPaths = new Set(recentDocs.map((d) => d.file_path).filter(Boolean));
          setFileResults(results.filter((r) => !recentPaths.has(r.path)));
        })
        .catch(() => setFileResults([]));
    }, 150);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [query, recentDocs]);

  // Total navigable items
  const allItems = [
    ...filteredRecent.map((d) => ({ type: "recent" as const, doc: d })),
    ...filteredActions.map((a) => ({ type: "action" as const, action: a })),
    ...fileResults.map((f) => ({ type: "file" as const, file: f })),
  ];

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, fileResults.length]);

  // Focus input on open, clear on close
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setFileResults([]);
      setSelectedIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  const activateItem = useCallback((index: number) => {
    const item = allItems[index];
    if (!item) return;
    if (item.type === "recent") {
      onClose();
      onSelectRecentDoc(item.doc, false);
    } else if (item.type === "action") {
      item.action.onAction();
    } else if (item.type === "file") {
      onClose();
      onOpenFilePath(item.file.path, false);
    }
  }, [allItems, onClose, onSelectRecentDoc, onOpenFilePath]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, allItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      activateItem(selectedIndex);
    }
  }, [allItems.length, selectedIndex, activateItem, onClose]);

  if (!presence.isMounted) return null;

  let itemIndex = -1;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 500,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "15vh",
        backgroundColor: presence.isVisible ? "rgba(0,0,0,0.25)" : "rgba(0,0,0,0)",
        transition: presence.isVisible
          ? "background-color 150ms var(--ease-entrance)"
          : "background-color 120ms var(--ease-exit)",
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Command palette"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        style={{
          width: 520,
          maxWidth: "calc(100vw - 32px)",
          backgroundColor: "#FFFFF8",
          borderRadius: 12,
          border: "1px solid #DFDBD3",
          boxShadow: "0 10px 32px rgba(0,0,0,0.12)",
          overflow: "hidden",
          opacity: presence.isVisible ? 1 : 0,
          transform: presence.isVisible ? "translateY(0) scale(1)" : "translateY(-8px) scale(0.97)",
          transition: presence.isVisible
            ? "opacity 150ms var(--ease-entrance), transform 150ms var(--ease-entrance)"
            : "opacity 120ms var(--ease-exit), transform 120ms var(--ease-exit)",
        }}
      >
        {/* Search input */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 16px",
            borderBottom: "1px solid #DFDBD3",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="6.5" cy="6.5" r="4.5" stroke="#A39A8E" strokeWidth="1.5" />
            <path d="M10 10L13.5 13.5" stroke="#A39A8E" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search files and actions…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 15,
              color: "#1A1714",
              fontFamily: "'Instrument Sans', system-ui, sans-serif",
            }}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd
            style={{
              fontFamily: "ui-monospace, 'SF Mono', monospace",
              fontSize: 11,
              padding: "1px 5px",
              borderRadius: 4,
              border: "1px solid #DFDBD3",
              backgroundColor: "#F5F2EA",
              color: "#A39A8E",
            }}
          >
            esc
          </kbd>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 340, overflowY: "auto" }}>
          {/* RECENT section */}
          {filteredRecent.length > 0 && (
            <div>
              <div
                style={{
                  padding: "8px 16px 4px",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  color: "#A39A8E",
                  fontFamily: "'Instrument Sans', system-ui, sans-serif",
                }}
              >
                Recent
              </div>
              {filteredRecent.map((doc) => {
                itemIndex++;
                const idx = itemIndex;
                const isSelected = selectedIndex === idx;
                return (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => activateItem(idx)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      gap: 1,
                      width: "100%",
                      padding: "7px 16px",
                      border: "none",
                      background: isSelected ? "rgba(0,0,0,0.05)" : "transparent",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 14,
                        color: "#1A1714",
                        fontFamily: "'Instrument Sans', system-ui, sans-serif",
                        fontWeight: 500,
                      }}
                    >
                      {doc.title ?? "Untitled"}
                    </span>
                    {doc.file_path && (
                      <span
                        style={{
                          fontSize: 11,
                          color: "#A39A8E",
                          fontFamily: "ui-monospace, 'SF Mono', monospace",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: "100%",
                        }}
                      >
                        {doc.file_path.replace(/^\/Users\/[^/]+/, "~")}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* ACTIONS section */}
          {filteredActions.length > 0 && (
            <div>
              <div
                style={{
                  padding: "8px 16px 4px",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  color: "#A39A8E",
                  fontFamily: "'Instrument Sans', system-ui, sans-serif",
                }}
              >
                Actions
              </div>
              {filteredActions.map((action) => {
                itemIndex++;
                const idx = itemIndex;
                const isSelected = selectedIndex === idx;
                return (
                  <button
                    key={action.id}
                    type="button"
                    onClick={() => activateItem(idx)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      width: "100%",
                      padding: "8px 16px",
                      border: "none",
                      background: isSelected ? "rgba(0,0,0,0.05)" : "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 14,
                        color: "#1A1714",
                        fontFamily: "'Instrument Sans', system-ui, sans-serif",
                        fontWeight: 500,
                      }}
                    >
                      {action.label}
                    </span>
                    <ShortcutBadge keys={action.shortcut} />
                  </button>
                );
              })}
            </div>
          )}

          {/* FILE RESULTS section (from mdfind) */}
          {fileResults.length > 0 && (
            <div>
              <div
                style={{
                  padding: "8px 16px 4px",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  color: "#A39A8E",
                  fontFamily: "'Instrument Sans', system-ui, sans-serif",
                }}
              >
                Files
              </div>
              {fileResults.map((file) => {
                itemIndex++;
                const idx = itemIndex;
                const isSelected = selectedIndex === idx;
                return (
                  <button
                    key={file.path}
                    type="button"
                    onClick={() => activateItem(idx)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      gap: 1,
                      width: "100%",
                      padding: "7px 16px",
                      border: "none",
                      background: isSelected ? "rgba(0,0,0,0.05)" : "transparent",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 14,
                        color: "#1A1714",
                        fontFamily: "'Instrument Sans', system-ui, sans-serif",
                        fontWeight: 500,
                      }}
                    >
                      {file.filename}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: "#A39A8E",
                        fontFamily: "ui-monospace, 'SF Mono', monospace",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: "100%",
                      }}
                    >
                      {file.path.replace(/^\/Users\/[^/]+/, "~")}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Empty state */}
          {allItems.length === 0 && query && (
            <div
              style={{
                padding: "24px 16px",
                textAlign: "center",
                color: "#A39A8E",
                fontSize: 14,
                fontFamily: "'Instrument Sans', system-ui, sans-serif",
              }}
            >
              No results for &ldquo;{query}&rdquo;
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "8px 16px",
            borderTop: "1px solid #DFDBD3",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: "#A39A8E",
              fontFamily: "'Instrument Sans', system-ui, sans-serif",
            }}
          >
            Type to search all .md files
          </span>
          <span
            style={{
              fontSize: 11,
              color: "#A39A8E",
              fontFamily: "'Instrument Sans', system-ui, sans-serif",
              display: "flex",
              gap: 8,
            }}
          >
            <span>↑↓ navigate</span>
            <span>↩ open</span>
          </span>
        </div>
      </div>
    </div>
  );
}
