import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Document } from "@/types/document";
import { useAnimatedPresence } from "@/hooks/useAnimatedPresence";

interface FileResult {
  path: string;
  filename: string;
  snippet?: string | null;
}

interface FtsResult {
  documentId: string;
  title: string;
  snippet: string;
  rank: number;
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

type Column = "files" | "actions";

function fuzzyMatch(query: string, text: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

function ShortcutBadge({ keys }: { keys: string[] }) {
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
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
  const [ftsResults, setFtsResults] = useState<FtsResult[]>([]);
  const [fileResults, setFileResults] = useState<FileResult[]>([]);
  const [selectedColumn, setSelectedColumn] = useState<Column>("files");
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [selectedActionIndex, setSelectedActionIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ftsIdRef = useRef(0);

  const actions: Action[] = [
    { id: "open", label: "Open new tab", shortcut: ["⌘", "O"], onAction: () => { onClose(); onOpenFile(); } },
    ...(onCloseTab ? [{ id: "close", label: "Close tab", shortcut: ["⌘", "W"], onAction: () => { onClose(); onCloseTab(); } }] : []),
    ...(onExport ? [{ id: "export", label: "Export annotations", shortcut: ["⌘", "⇧", "E"], onAction: () => { onClose(); onExport(); } }] : []),
    ...(onOpenFind ? [{ id: "find", label: "Find in document", shortcut: ["⌘", "F"], onAction: () => { onClose(); onOpenFind(); } }] : []),
    { id: "settings", label: "Settings", shortcut: ["⌘", ","], onAction: () => { onClose(); onOpenSettings(); } },
  ];

  // File items: recent docs + mdfind results
  const filteredRecent = recentDocs.filter((d) => {
    if (!query) return true;
    return fuzzyMatch(query, d.title ?? "") || fuzzyMatch(query, d.file_path ?? "");
  }).slice(0, 6);

  const filteredActions = actions.filter((a) => {
    if (!query) return true;
    return fuzzyMatch(query, a.label);
  });

  // Combined left-column items: recent → FTS → mdfind
  const fileItems: Array<
    | { type: "recent"; doc: Document }
    | { type: "fts"; result: FtsResult }
    | { type: "file"; file: FileResult }
  > = [
    ...filteredRecent.map((d) => ({ type: "recent" as const, doc: d })),
    ...ftsResults.map((r) => ({ type: "fts" as const, result: r })),
    ...fileResults.map((f) => ({ type: "file" as const, file: f })),
  ];

  // FTS5 search — fires immediately on keystroke (~1-5ms local SQLite)
  useEffect(() => {
    const thisId = ++ftsIdRef.current;
    if (!query.trim()) {
      setFtsResults([]);
      return;
    }
    invoke<FtsResult[]>("search_documents", { query: query.trim(), limit: 6 })
      .then((results) => {
        if (ftsIdRef.current !== thisId) return;
        // Deduplicate against recent docs by document ID
        const recentIds = new Set(recentDocs.map((d) => d.id));
        setFtsResults(results.filter((r) => !recentIds.has(r.documentId)));
      })
      .catch(() => {
        if (ftsIdRef.current === thisId) setFtsResults([]);
      });
  }, [query, recentDocs]);

  // mdfind search — debounced 200ms, secondary tier for unindexed files
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!query.trim()) {
      setFileResults([]);
      return;
    }
    searchTimerRef.current = setTimeout(() => {
      invoke<FileResult[]>("search_files_on_disk", { query, limit: 8 })
        .then((results) => {
          const recentPaths = new Set(recentDocs.map((d) => d.file_path).filter(Boolean));
          setFileResults(results.filter((r) => !recentPaths.has(r.path)));
        })
        .catch(() => setFileResults([]));
    }, 200);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [query, recentDocs]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedFileIndex(0);
    setSelectedActionIndex(0);
  }, [query, ftsResults.length, fileResults.length]);

  // Focus input on open, clear on close
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setFtsResults([]);
      setFileResults([]);
      setSelectedFileIndex(0);
      setSelectedActionIndex(0);
      setSelectedColumn("files");
      // Double rAF to ensure animated presence has rendered the input
      requestAnimationFrame(() => {
        requestAnimationFrame(() => inputRef.current?.focus());
      });
    }
  }, [isOpen]);

  const activateFileItem = useCallback((index: number) => {
    const item = fileItems[index];
    if (!item) return;
    onClose();
    if (item.type === "recent") {
      onSelectRecentDoc(item.doc, false);
    } else if (item.type === "fts") {
      // FTS results have a documentId — find matching recent doc or open by ID
      const matchingDoc = recentDocs.find((d) => d.id === item.result.documentId);
      if (matchingDoc) {
        onSelectRecentDoc(matchingDoc, false);
      }
      // If not in recentDocs, the doc was indexed but not recently opened — no file path available
    } else {
      onOpenFilePath(item.file.path, false);
    }
  }, [fileItems, onClose, onSelectRecentDoc, onOpenFilePath, recentDocs]);

  const activateActionItem = useCallback((index: number) => {
    const action = filteredActions[index];
    if (!action) return;
    action.onAction();
  }, [filteredActions]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setSelectedColumn("files");
      return;
    }

    if (e.key === "ArrowRight") {
      e.preventDefault();
      setSelectedColumn("actions");
      return;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      setSelectedColumn((col) => col === "files" ? "actions" : "files");
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (selectedColumn === "files") {
        setSelectedFileIndex((i) => Math.min(i + 1, fileItems.length - 1));
      } else {
        setSelectedActionIndex((i) => Math.min(i + 1, filteredActions.length - 1));
      }
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (selectedColumn === "files") {
        setSelectedFileIndex((i) => Math.max(i - 1, 0));
      } else {
        setSelectedActionIndex((i) => Math.max(i - 1, 0));
      }
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      if (selectedColumn === "files") {
        activateFileItem(selectedFileIndex);
      } else {
        activateActionItem(selectedActionIndex);
      }
      return;
    }
  }, [
    selectedColumn,
    selectedFileIndex,
    selectedActionIndex,
    fileItems.length,
    filteredActions.length,
    activateFileItem,
    activateActionItem,
    onClose,
  ]);

  if (!presence.isMounted) return null;

  const sectionLabel: React.CSSProperties = {
    padding: "8px 14px 4px",
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: "#B0A89E",
    fontFamily: "'Instrument Sans', system-ui, sans-serif",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 500,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "13vh",
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
          width: 680,
          maxWidth: "calc(100vw - 32px)",
          backgroundColor: "#FFFFF8",
          borderRadius: 12,
          border: "1px solid #DFDBD3",
          boxShadow: "0 12px 40px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06)",
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

        {/* Two-column body */}
        <div style={{ display: "flex", minHeight: 280, maxHeight: 420 }}>
          {/* Left column — files */}
          <div
            style={{
              flex: "0 0 55%",
              borderRight: "1px solid #DFDBD3",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {fileItems.length === 0 && (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "32px 16px",
                  color: "#B0A89E",
                  fontSize: 13,
                  fontFamily: "'Instrument Sans', system-ui, sans-serif",
                  textAlign: "center",
                  lineHeight: 1.5,
                }}
              >
                {query ? `No files matching "${query}"` : "Type to search all .md files"}
              </div>
            )}

            {/* Recent section */}
            {filteredRecent.length > 0 && (
              <div>
                <div style={sectionLabel}>Recent</div>
                {filteredRecent.map((doc, i) => {
                  const isSelected = selectedColumn === "files" && selectedFileIndex === i;
                  return (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => activateFileItem(i)}
                      onMouseEnter={() => { setSelectedColumn("files"); setSelectedFileIndex(i); }}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        gap: 2,
                        width: "100%",
                        padding: "7px 14px",
                        border: "none",
                        background: isSelected ? "rgba(0,0,0,0.05)" : "transparent",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          color: "#1A1714",
                          fontFamily: "'Instrument Sans', system-ui, sans-serif",
                          fontWeight: 500,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: "100%",
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

            {/* FTS results section — instant results from indexed documents */}
            {ftsResults.length > 0 && (
              <div>
                <div style={sectionLabel}>Matches</div>
                {ftsResults.map((result, i) => {
                  const absIdx = filteredRecent.length + i;
                  const isSelected = selectedColumn === "files" && selectedFileIndex === absIdx;
                  return (
                    <button
                      key={result.documentId}
                      type="button"
                      onClick={() => activateFileItem(absIdx)}
                      onMouseEnter={() => { setSelectedColumn("files"); setSelectedFileIndex(absIdx); }}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        gap: 2,
                        width: "100%",
                        padding: "7px 14px",
                        border: "none",
                        background: isSelected ? "rgba(0,0,0,0.05)" : "transparent",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          color: "#1A1714",
                          fontFamily: "'Instrument Sans', system-ui, sans-serif",
                          fontWeight: 500,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: "100%",
                        }}
                      >
                        {result.title}
                      </span>
                      <span
                        style={{
                          fontSize: 11,
                          color: "#A39A8E",
                          fontFamily: "'Instrument Sans', system-ui, sans-serif",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: "100%",
                        }}
                        dangerouslySetInnerHTML={{ __html: result.snippet }}
                      />
                    </button>
                  );
                })}
              </div>
            )}

            {/* File search results section */}
            {fileResults.length > 0 && (
              <div>
                <div style={sectionLabel}>Files</div>
                {fileResults.map((file, i) => {
                  const absIdx = filteredRecent.length + i;
                  const isSelected = selectedColumn === "files" && selectedFileIndex === absIdx;
                  return (
                    <button
                      key={file.path}
                      type="button"
                      onClick={() => activateFileItem(absIdx)}
                      onMouseEnter={() => { setSelectedColumn("files"); setSelectedFileIndex(absIdx); }}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        gap: 2,
                        width: "100%",
                        padding: "7px 14px",
                        border: "none",
                        background: isSelected ? "rgba(0,0,0,0.05)" : "transparent",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          color: "#1A1714",
                          fontFamily: "'Instrument Sans', system-ui, sans-serif",
                          fontWeight: 500,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: "100%",
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
                      {file.snippet && (
                        <span
                          style={{
                            fontSize: 11,
                            color: "#8A8078",
                            fontFamily: "'Instrument Sans', system-ui, sans-serif",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            maxWidth: "100%",
                            fontStyle: "italic",
                          }}
                        >
                          {file.snippet}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right column — actions */}
          <div
            style={{
              flex: "0 0 45%",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {filteredActions.length > 0 ? (
              <>
                <div style={sectionLabel}>Actions</div>
                {filteredActions.map((action, i) => {
                  const isSelected = selectedColumn === "actions" && selectedActionIndex === i;
                  return (
                    <button
                      key={action.id}
                      type="button"
                      onClick={() => activateActionItem(i)}
                      onMouseEnter={() => { setSelectedColumn("actions"); setSelectedActionIndex(i); }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                        width: "100%",
                        padding: "8px 14px",
                        border: "none",
                        background: isSelected ? "rgba(0,0,0,0.05)" : "transparent",
                        cursor: "pointer",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 13,
                          color: "#1A1714",
                          fontFamily: "'Instrument Sans', system-ui, sans-serif",
                          fontWeight: 500,
                          textAlign: "left",
                        }}
                      >
                        {action.label}
                      </span>
                      <ShortcutBadge keys={action.shortcut} />
                    </button>
                  );
                })}
              </>
            ) : (
              <div
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "32px 16px",
                  color: "#B0A89E",
                  fontSize: 13,
                  fontFamily: "'Instrument Sans', system-ui, sans-serif",
                  textAlign: "center",
                }}
              >
                No matching actions
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "7px 14px",
            borderTop: "1px solid #DFDBD3",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: "#B0A89E",
              fontFamily: "'Instrument Sans', system-ui, sans-serif",
            }}
          >
            {query ? "Fuzzy search across all .md files" : "Type to search all .md files"}
          </span>
          <span
            style={{
              fontSize: 11,
              color: "#B0A89E",
              fontFamily: "'Instrument Sans', system-ui, sans-serif",
              display: "flex",
              gap: 10,
            }}
          >
            <span>↑↓ navigate</span>
            <span>←→ switch</span>
            <span>↩ open</span>
          </span>
        </div>
      </div>
    </div>
  );
}
