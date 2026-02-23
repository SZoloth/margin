import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { FolderOpenIcon, Search01Icon } from "@hugeicons/core-free-icons";
import type { Document } from "@/types/document";
import type { KeepLocalItem } from "@/types/keep-local";
import type { FileResult } from "@/hooks/useSearch";
import { SidebarKeepLocal } from "@/components/layout/SidebarKeepLocal";

type SidebarTab = "files" | "articles";

interface SidebarProps {
  onOpenFile: () => void;
  onSelectRecentDoc: (doc: Document, newTab: boolean) => void;
  currentDoc: Document | null;
  recentDocs: Document[];
  searchQuery: string;
  onSearch: (query: string) => void;
  fileResults: FileResult[];
  isSearching: boolean;
  onOpenFilePath: (path: string, newTab: boolean) => void;
  onRenameFile?: (doc: Document, newName: string) => void;
  // Keep-local props
  keepLocalItems: KeepLocalItem[];
  keepLocalIsOnline: boolean;
  keepLocalIsLoading: boolean;
  keepLocalQuery: string;
  onKeepLocalSearch: (q: string) => void;
  onSelectKeepLocalItem: (item: KeepLocalItem, newTab: boolean) => void;
}

export function Sidebar({
  onOpenFile,
  onSelectRecentDoc,
  currentDoc,
  recentDocs,
  searchQuery,
  onSearch,
  fileResults,
  isSearching,
  onOpenFilePath,
  onRenameFile,
  keepLocalItems,
  keepLocalIsOnline,
  keepLocalIsLoading,
  keepLocalQuery,
  onKeepLocalSearch,
  onSelectKeepLocalItem,
}: SidebarProps) {
  const [activeTab, setActiveTab] = useState<SidebarTab>("files");
  const [isFocused, setIsFocused] = useState(false);
  const [inputValue, setInputValue] = useState(searchQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeResultIndex, setActiveResultIndex] = useState(-1);
  const [renamingDocId, setRenamingDocId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Sync input value when the active tab's query changes externally
  useEffect(() => {
    setInputValue(activeTab === "files" ? searchQuery : keepLocalQuery);
  }, [searchQuery, keepLocalQuery, activeTab]);

  // Reset input when switching tabs
  const handleTabChange = (tab: SidebarTab) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setInputValue(tab === "files" ? searchQuery : keepLocalQuery);
    setIsFocused(false);
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const showDropdown = activeTab === "files" && isFocused && inputValue.trim().length > 0;

  const keepLocalDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedKeepLocalSearch = useCallback((value: string) => {
    if (keepLocalDebounceRef.current) clearTimeout(keepLocalDebounceRef.current);
    keepLocalDebounceRef.current = setTimeout(() => onKeepLocalSearch(value), 150);
  }, [onKeepLocalSearch]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setInputValue("");
      if (activeTab === "files") {
        onSearch("");
      } else {
        onKeepLocalSearch("");
      }
      setActiveResultIndex(-1);
      inputRef.current?.blur();
      setIsFocused(false);
    } else if (e.key === "ArrowDown" && showDropdown) {
      e.preventDefault();
      setActiveResultIndex((i) => Math.min(i + 1, fileResults.length - 1));
    } else if (e.key === "ArrowUp" && showDropdown) {
      e.preventDefault();
      setActiveResultIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && activeTab === "files") {
      if (activeResultIndex >= 0 && activeResultIndex < fileResults.length) {
        e.preventDefault();
        const file = fileResults[activeResultIndex];
        if (file) {
          onOpenFilePath(file.path, e.metaKey);
          setIsFocused(false);
          setInputValue("");
          onSearch("");
          setActiveResultIndex(-1);
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
    if (activeTab === "files") {
      onSearch(value);
    } else {
      debouncedKeepLocalSearch(value);
    }
  };

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

  return (
    <div className="flex flex-col h-full">
      {/* App header */}
      <div className="px-4 pt-5 pb-4">
        <h1
          className="text-lg font-semibold tracking-tight"
          style={{ color: "var(--color-text-primary)" }}
        >
          Margin
        </h1>
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
            placeholder={activeTab === "files" ? "Search files..." : "Search articles..."}
            value={inputValue}
            onChange={handleChange}
            onFocus={() => setIsFocused(true)}
            onKeyDown={handleKeyDown}
            className="flex-1 text-sm bg-transparent outline-none"
            style={{ color: "var(--color-text-primary)", minWidth: 0 }}
          />
          {activeTab === "files" && (
            <button
              onClick={onOpenFile}
              className="btn-sm flex-shrink-0 p-1"
              style={{ color: "var(--color-text-secondary)" }}
              aria-label="Open file"
              title="Open file (⌘O)"
            >
              <HugeiconsIcon icon={FolderOpenIcon} size={14} color="currentColor" strokeWidth={2} />
            </button>
          )}
        </div>

        {/* Search dropdown (files tab only) */}
        {showDropdown && (
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
            }}
          >
            {isSearching && fileResults.length === 0 && (
              <div className="px-3 py-3 text-sm italic" style={{ color: "var(--color-text-secondary)" }}>
                Searching...
              </div>
            )}
            {!isSearching && fileResults.length === 0 && (
              <div className="px-3 py-3 text-sm italic" style={{ color: "var(--color-text-secondary)" }}>
                No results
              </div>
            )}
            {fileResults.map((file, index) => {
              const parts = file.path.split("/");
              const parentDir = parts.length > 2 ? parts[parts.length - 2] : "";
              const isActive = index === activeResultIndex;
              return (
                <button
                  key={file.path}
                  id={`search-option-${index}`}
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

      {/* Tab bar */}
      <div className="flex gap-1 px-4 mb-3">
        <button
          onClick={() => handleTabChange("files")}
          className="sidebar-tab flex-1 py-1.5 text-xs font-medium text-center"
          style={{
            backgroundColor: activeTab === "files" ? "var(--active-bg)" : "transparent",
            color: activeTab === "files" ? "var(--color-text-primary)" : "var(--color-text-secondary)",
            fontWeight: activeTab === "files" ? 500 : 400,
            borderRadius: "var(--radius-sm)",
            border: "none",
            cursor: "pointer",
          }}
        >
          Files
        </button>
        <button
          onClick={() => handleTabChange("articles")}
          className="sidebar-tab flex-1 py-1.5 text-xs font-medium text-center flex items-center justify-center gap-1.5"
          style={{
            backgroundColor: activeTab === "articles" ? "var(--active-bg)" : "transparent",
            color: activeTab === "articles" ? "var(--color-text-primary)" : "var(--color-text-secondary)",
            fontWeight: activeTab === "articles" ? 500 : 400,
            borderRadius: "var(--radius-sm)",
            border: "none",
            cursor: "pointer",
          }}
        >
          Articles
          <span
            role="status"
            aria-label={keepLocalIsOnline ? "Online" : "Offline"}
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              backgroundColor: keepLocalIsOnline ? "var(--color-success)" : "var(--color-danger)",
              flexShrink: 0,
            }}
          />
        </button>
      </div>

      {/* Tab content — scrollable */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {activeTab === "files" ? (
          <div>
            <h2
              className="text-xs font-semibold uppercase tracking-wider mb-3 px-3"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Recent
            </h2>
            {recentDocs.length === 0 ? (
              <div
                className="px-3 text-sm italic"
                style={{ color: "var(--color-text-secondary)" }}
              >
                No recent documents
              </div>
            ) : (
              <div className="flex flex-col gap-0.5">
                {recentDocs.map((doc) => {
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
                        // Focus the input after it mounts
                        requestAnimationFrame(() => renameInputRef.current?.select());
                      }}
                      className="interactive-item flex items-start gap-2 px-3 py-1.5 text-sm text-left"
                      style={{
                        color: isActive ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                        backgroundColor: isActive ? "var(--active-bg)" : "transparent",
                        fontWeight: isActive ? 500 : 400,
                        border: "none",
                        width: "100%",
                      }}
                      title={doc.file_path ?? doc.title ?? "Untitled"}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          opacity: 0.5,
                          flexShrink: 0,
                          marginTop: 2,
                        }}
                      >
                        {doc.source === "keep-local" ? "KL" : "F"}
                      </span>
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
            )}
          </div>
        ) : (
          <SidebarKeepLocal
            items={keepLocalItems}
            isOnline={keepLocalIsOnline}
            isLoading={keepLocalIsLoading}
            onSelectItem={onSelectKeepLocalItem}
          />
        )}
      </div>
    </div>
  );
}
