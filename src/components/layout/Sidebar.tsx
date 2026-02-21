import { useState, useRef, useEffect } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { FolderOpenIcon, Search01Icon } from "@hugeicons/core-free-icons";
import type { Document } from "@/types/document";
import type { FileResult } from "@/hooks/useSearch";

interface SidebarProps {
  onOpenFile: () => void;
  onSelectRecentDoc: (doc: Document) => void;
  currentDoc: Document | null;
  recentDocs: Document[];
  searchQuery: string;
  onSearch: (query: string) => void;
  fileResults: FileResult[];
  isSearching: boolean;
  onOpenFilePath: (path: string) => void;
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
}: SidebarProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [inputValue, setInputValue] = useState(searchQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setInputValue(searchQuery); }, [searchQuery]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setInputValue("");
      onSearch("");
      inputRef.current?.blur();
      setIsFocused(false);
    } else if (e.key === "Enter") {
      onSearch(inputValue);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    onSearch(value);
  };

  const showDropdown = isFocused && inputValue.trim().length > 0;

  return (
    <div className="flex flex-col px-4 py-5">
      {/* App header */}
      <div className="mb-4">
        <h1
          className="text-lg font-semibold tracking-tight"
          style={{ color: "var(--color-text-primary)" }}
        >
          Margin
        </h1>
      </div>

      {/* Search + Open File row */}
      <div ref={containerRef} className="relative mb-5">
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
            placeholder="Search..."
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
            <HugeiconsIcon icon={FolderOpenIcon} size={15} color="currentColor" strokeWidth={1.5} />
          </button>
        </div>

        {/* Search dropdown */}
        {showDropdown && (
          <div
            className="absolute left-0 right-0 top-full mt-1 border shadow-lg overflow-hidden z-50"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-page)",
              borderRadius: "var(--radius-md)",
              maxHeight: "300px",
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
            {fileResults.map((file) => {
              // Show parent folder for context
              const parts = file.path.split("/");
              const parentDir = parts.length > 2 ? parts[parts.length - 2] : "";
              return (
                <button
                  key={file.path}
                  onClick={() => {
                    onOpenFilePath(file.path);
                    setIsFocused(false);
                    setInputValue("");
                    onSearch("");
                  }}
                  className="interactive-item w-full text-left px-3 py-2"
                  style={{ color: "var(--color-text-primary)", borderRadius: 0 }}
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

      {/* Recent documents */}
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
              return (
                <button
                  key={doc.id}
                  onClick={() => onSelectRecentDoc(doc)}
                  className="interactive-item flex items-center gap-2 px-3 py-1.5 text-sm truncate text-left"
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
                    }}
                  >
                    {doc.source === "keep-local" ? "KL" : "F"}
                  </span>
                  <span className="truncate">
                    {doc.title ?? "Untitled"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
