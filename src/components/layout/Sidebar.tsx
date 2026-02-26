import { useState, useRef, useEffect, useMemo } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { FolderOpenIcon, Search01Icon, Settings01Icon } from "@hugeicons/core-free-icons";
import type { Document } from "@/types/document";
import type { Tab } from "@/types/tab";
import type { SearchResult, FileResult } from "@/hooks/useSearch";
import { useAnimatedPresence } from "@/hooks/useAnimatedPresence";

/** Sanitize FTS snippet HTML — only allow <mark> and </mark> tags, escape everything else. */
function sanitizeSnippet(html: string): string {
  // Replace <mark> and </mark> with placeholders, escape the rest, then restore
  return html
    .replace(/<mark>/g, "\x00MARK_OPEN\x00")
    .replace(/<\/mark>/g, "\x00MARK_CLOSE\x00")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\x00MARK_OPEN\x00/g, "<mark>")
    .replace(/\x00MARK_CLOSE\x00/g, "</mark>");
}

interface SidebarProps {
  onOpenFile: () => void;
  onSelectRecentDoc: (doc: Document, newTab: boolean) => void;
  currentDoc: Document | null;
  recentDocs: Document[];
  searchQuery: string;
  onSearch: (query: string) => void;
  searchResults: SearchResult[];
  fileResults: FileResult[];
  isSearching: boolean;
  onOpenFilePath: (path: string, newTab: boolean) => void;
  onRenameFile?: (doc: Document, newName: string) => void;
  tabs: Tab[];
  onOpenSettings?: () => void;
}

export function Sidebar({
  onOpenFile,
  onSelectRecentDoc,
  currentDoc,
  recentDocs,
  searchQuery,
  onSearch,
  searchResults,
  fileResults,
  isSearching,
  onOpenFilePath,
  onRenameFile,
  tabs,
  onOpenSettings,
}: SidebarProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [inputValue, setInputValue] = useState(searchQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeResultIndex, setActiveResultIndex] = useState(-1);
  const [renamingDocId, setRenamingDocId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Sync input value when search query changes externally
  useEffect(() => {
    setInputValue(searchQuery);
  }, [searchQuery]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const hasResults = searchResults.length > 0 || fileResults.length > 0;
  const showDropdown = isFocused && inputValue.trim().length > 0;
  const dropdown = useAnimatedPresence(showDropdown, 150);

  const totalResults = searchResults.length + fileResults.length;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setInputValue("");
      onSearch("");
      setActiveResultIndex(-1);
      inputRef.current?.blur();
      setIsFocused(false);
    } else if (e.key === "ArrowDown" && showDropdown) {
      e.preventDefault();
      setActiveResultIndex((i) => Math.min(i + 1, totalResults - 1));
    } else if (e.key === "ArrowUp" && showDropdown) {
      e.preventDefault();
      setActiveResultIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      if (activeResultIndex >= 0) {
        e.preventDefault();
        // FTS5 results come first
        if (activeResultIndex < searchResults.length) {
          const result = searchResults[activeResultIndex];
          if (result) {
            // Find the document in recentDocs to open it
            const doc = recentDocs.find((d) => d.id === result.documentId);
            if (doc) {
              onSelectRecentDoc(doc, e.metaKey);
            }
            setIsFocused(false);
            setInputValue("");
            onSearch("");
            setActiveResultIndex(-1);
          }
        } else {
          // File results come after FTS results
          const fileIdx = activeResultIndex - searchResults.length;
          const file = fileResults[fileIdx];
          if (file) {
            onOpenFilePath(file.path, e.metaKey);
            setIsFocused(false);
            setInputValue("");
            onSearch("");
            setActiveResultIndex(-1);
          }
        }
      } else {
        onSearch(inputValue);
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    setActiveResultIndex(-1);
    onSearch(value);
  };

  const openDocIds = useMemo(() => {
    const ids = new Set<string>();
    for (const tab of tabs) {
      if (tab.documentId) ids.add(tab.documentId);
    }
    return ids;
  }, [tabs]);

  const duplicateTitles = useMemo(() => {
    const counts = new Map<string, number>();
    for (const doc of recentDocs) {
      const title = doc.title ?? "Untitled";
      counts.set(title, (counts.get(title) ?? 0) + 1);
    }
    const dupes = new Set<string>();
    for (const [title, count] of counts) {
      if (count > 1) dupes.add(title);
    }
    return dupes;
  }, [recentDocs]);

  const temporalGroups = useMemo(() => {
    if (recentDocs.length === 0) return [];
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);

    const groups: { label: string; docs: typeof recentDocs }[] = [
      { label: "Today", docs: [] },
      { label: "Yesterday", docs: [] },
      { label: "This week", docs: [] },
      { label: "Older", docs: [] },
    ];

    for (const doc of recentDocs) {
      const t = doc.last_opened_at;
      if (t >= todayStart.getTime()) {
        groups[0]!.docs.push(doc);
      } else if (t >= yesterdayStart.getTime()) {
        groups[1]!.docs.push(doc);
      } else if (t >= weekStart.getTime()) {
        groups[2]!.docs.push(doc);
      } else {
        groups[3]!.docs.push(doc);
      }
    }

    return groups.filter((g) => g.docs.length > 0);
  }, [recentDocs]);

  return (
    <div className="flex flex-col h-full">
      {/* App header */}
      <div className="flex items-center justify-between px-4 pt-5 pb-4">
        <h1
          className="text-lg font-semibold tracking-tight"
          style={{ color: "var(--color-text-primary)" }}
        >
          Margin
        </h1>
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="toolbar-hamburger p-1"
            style={{ color: "var(--color-text-secondary)" }}
            aria-label="Settings"
            title="Settings"
          >
            <HugeiconsIcon icon={Settings01Icon} size={16} color="currentColor" strokeWidth={1.5} />
          </button>
        )}
      </div>

      {/* Search + Open File row */}
      <div ref={containerRef} className="relative px-4 mb-3">
        <div
          className="flex items-center gap-1.5 px-2.5 py-1.5 border"
          style={{
            borderColor: isFocused ? "var(--color-text-secondary)" : "var(--color-border)",
            backgroundColor: "var(--color-page)",
            borderRadius: "var(--radius-sm)",
          }}
        >
          <HugeiconsIcon
            icon={Search01Icon}
            size={14}
            color="var(--color-text-secondary)"
            strokeWidth={1.5}
            className="flex-shrink-0"
          />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={showDropdown}
            aria-controls="search-listbox"
            aria-activedescendant={activeResultIndex >= 0 ? `search-option-${activeResultIndex}` : undefined}
            aria-autocomplete="list"
            placeholder="Search files..."
            value={inputValue}
            onChange={handleChange}
            onFocus={() => setIsFocused(true)}
            onKeyDown={handleKeyDown}
            className="flex-1 text-sm bg-transparent outline-none"
            style={{ color: "var(--color-text-primary)", minWidth: 0 }}
          />
          <button
            onClick={onOpenFile}
            className="btn-sm flex-shrink-0 p-1"
            style={{ color: "var(--color-text-secondary)" }}
            aria-label="Open file"
            title="Open file (⌘O)"
          >
            <HugeiconsIcon icon={FolderOpenIcon} size={14} color="currentColor" strokeWidth={2} />
          </button>
        </div>

        {/* Search dropdown */}
        {dropdown.isMounted && (
          <div
            id="search-listbox"
            role="listbox"
            aria-label="Search results"
            className="absolute left-4 right-4 top-full mt-1 border shadow-lg overflow-hidden z-50"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-page)",
              borderRadius: "var(--radius-md)",
              maxHeight: "min(300px, 50vh)",
              overflowY: "auto",
              opacity: dropdown.isVisible ? 1 : 0,
              transform: dropdown.isVisible ? "translateY(0)" : "translateY(-4px)",
              transition: dropdown.isVisible
                ? "opacity 150ms var(--ease-entrance), transform 150ms var(--ease-entrance)"
                : "opacity 100ms var(--ease-exit), transform 100ms var(--ease-exit)",
            }}
          >
            {isSearching && !hasResults && (
              <div className="px-3 py-3 text-sm italic" style={{ color: "var(--color-text-secondary)" }}>
                Searching...
              </div>
            )}
            {!isSearching && !hasResults && (
              <div className="px-3 py-3 text-sm italic" style={{ color: "var(--color-text-secondary)" }}>
                No results
              </div>
            )}
            {/* FTS5 indexed document results */}
            {searchResults.map((result, index) => {
              const isActive = index === activeResultIndex;
              return (
                <button
                  key={`fts-${result.documentId}`}
                  id={`search-option-${index}`}
                  role="option"
                  aria-selected={isActive}
                  onClick={(e) => {
                    const doc = recentDocs.find((d) => d.id === result.documentId);
                    if (doc) {
                      onSelectRecentDoc(doc, e.metaKey);
                    }
                    setIsFocused(false);
                    setInputValue("");
                    onSearch("");
                    setActiveResultIndex(-1);
                  }}
                  className="interactive-item w-full text-left px-3 py-2"
                  style={{
                    color: "var(--color-text-primary)",
                    borderRadius: 0,
                    backgroundColor: isActive ? "var(--active-bg)" : undefined,
                  }}
                >
                  <div className="text-sm font-medium truncate">{result.title}</div>
                  {result.snippet && (
                    <div
                      className="text-xs mt-0.5 truncate"
                      style={{ color: "var(--color-text-secondary)", opacity: 0.7 }}
                      dangerouslySetInnerHTML={{ __html: sanitizeSnippet(result.snippet) }}
                    />
                  )}
                </button>
              );
            })}
            {/* Divider between FTS and file results */}
            {searchResults.length > 0 && fileResults.length > 0 && (
              <div
                className="px-3 py-1.5 text-xs font-medium uppercase tracking-wider"
                style={{ color: "var(--color-text-secondary)", opacity: 0.5 }}
              >
                Files on disk
              </div>
            )}
            {/* mdfind file results */}
            {fileResults.map((file, index) => {
              const parts = file.path.split("/");
              const parentDir = parts.length > 2 ? parts[parts.length - 2] : "";
              const combinedIndex = searchResults.length + index;
              const isActive = combinedIndex === activeResultIndex;
              return (
                <button
                  key={file.path}
                  id={`search-option-${combinedIndex}`}
                  role="option"
                  aria-selected={isActive}
                  onClick={(e) => {
                    onOpenFilePath(file.path, e.metaKey);
                    setIsFocused(false);
                    setInputValue("");
                    onSearch("");
                    setActiveResultIndex(-1);
                  }}
                  className="interactive-item w-full text-left px-3 py-2"
                  style={{
                    color: "var(--color-text-primary)",
                    borderRadius: 0,
                    backgroundColor: isActive ? "var(--active-bg)" : undefined,
                  }}
                >
                  <div className="text-sm font-medium truncate">{file.filename}</div>
                  {parentDir && (
                    <div
                      className="text-xs mt-0.5 truncate"
                      style={{ color: "var(--color-text-secondary)", opacity: 0.7 }}
                    >
                      {parentDir}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent documents — scrollable */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div>
          {recentDocs.length === 0 ? (
            <div
              className="px-3 text-sm italic"
              style={{ color: "var(--color-text-secondary)" }}
            >
              No recent documents
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {temporalGroups.map((group) => {
                  let runningIndex = 0;
                  // Calculate offset for stagger: sum of docs in prior groups
                  for (const g of temporalGroups) {
                    if (g === group) break;
                    runningIndex += g.docs.length;
                  }
                  return (
                    <div key={group.label}>
                      <h2
                        className="text-xs font-semibold uppercase tracking-wider mb-2 px-3"
                        style={{ color: "var(--color-text-secondary)", opacity: 0.7 }}
                      >
                        {group.label}
                      </h2>
                      <div className="flex flex-col gap-0.5">
                        {group.docs.map((doc, groupDocIndex) => {
                          const docIndex = runningIndex + groupDocIndex;
                          const isActive = currentDoc?.id === doc.id;
                          const title = doc.title ?? "Untitled";
                          const needsDisambiguation = duplicateTitles.has(title) && doc.file_path;
                          let parentFolder = "";
                          if (needsDisambiguation && doc.file_path) {
                            const parts = doc.file_path.split("/");
                            const dirPath = parts.slice(0, -1).join("/");
                            const homePrefix = dirPath.match(/^\/Users\/[^/]+/)?.[0];
                            parentFolder = homePrefix ? dirPath.replace(homePrefix, "~") : dirPath;
                          }
                          const isRenaming = renamingDocId === doc.id;

                          const commitRename = () => {
                            const trimmed = renameValue.trim();
                            if (trimmed && doc.file_path) {
                              const segments = doc.file_path.split("/");
                              const currentFilename = segments[segments.length - 1] ?? "";
                              if (trimmed !== currentFilename && onRenameFile) {
                                onRenameFile(doc, trimmed);
                              }
                            }
                            setRenamingDocId(null);
                          };

                          return (
                            <button
                              key={doc.id}
                              onClick={(e) => {
                                if (isRenaming) return;
                                onSelectRecentDoc(doc, e.metaKey);
                              }}
                              onContextMenu={(e) => {
                                if (doc.source !== "file" || !doc.file_path || !onRenameFile) return;
                                e.preventDefault();
                                const segments = doc.file_path.split("/");
                                const currentFilename = segments[segments.length - 1] ?? "";
                                setRenameValue(currentFilename);
                                setRenamingDocId(doc.id);
                                requestAnimationFrame(() => renameInputRef.current?.select());
                              }}
                              className="interactive-item sidebar-list-item flex items-start gap-2 px-3 py-1.5 text-sm text-left"
                              style={{
                                color: isActive ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                                backgroundColor: isActive ? "var(--active-bg)" : "transparent",
                                fontWeight: isActive ? 500 : 400,
                                border: "none",
                                width: "100%",
                                animationDelay: `${docIndex * 25}ms`,
                              }}
                              title={doc.file_path ?? doc.title ?? "Untitled"}
                            >
                              {openDocIds.has(doc.id) && (
                                <span
                                  style={{
                                    width: 5,
                                    height: 5,
                                    borderRadius: "50%",
                                    backgroundColor: "var(--color-text-secondary)",
                                    flexShrink: 0,
                                    marginTop: 6,
                                    opacity: 0.7,
                                  }}
                                />
                              )}
                              {isRenaming ? (
                                <input
                                  ref={renameInputRef}
                                  value={renameValue}
                                  onChange={(e) => setRenameValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") { e.preventDefault(); commitRename(); }
                                    if (e.key === "Escape") { e.stopPropagation(); setRenamingDocId(null); }
                                  }}
                                  onBlur={commitRename}
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-sm bg-transparent outline-none min-w-0 flex-1"
                                  style={{
                                    color: "var(--color-text-primary)",
                                    borderBottom: "1px solid var(--color-text-secondary)",
                                    padding: "0 0 1px 0",
                                  }}
                                />
                              ) : (
                                <span className="truncate min-w-0">
                                  <span className="block truncate">{title}</span>
                                  {parentFolder && (
                                    <span
                                      className="block truncate"
                                      style={{ fontSize: 11, opacity: 0.6, fontWeight: 400 }}
                                    >
                                      {parentFolder}
                                    </span>
                                  )}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
          )}
        </div>
      </div>
    </div>
  );
}
