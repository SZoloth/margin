import { useState, useRef, useEffect } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon } from "@hugeicons/core-free-icons";
import type { SearchResult } from "@/hooks/useSearch";

interface SearchBarProps {
  query: string;
  onSearch: (query: string) => void;
  results: SearchResult[];
  isSearching: boolean;
  onSelectResult: (documentId: string) => void;
}

export function SearchBar({
  query,
  onSearch,
  results,
  isSearching,
  onSelectResult,
}: SearchBarProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [inputValue, setInputValue] = useState(query);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync input value with external query changes
  useEffect(() => {
    setInputValue(query);
  }, [query]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
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
    <div ref={containerRef} className="relative mb-4">
      <div
        className="flex items-center gap-2 px-3 py-2 border"
        style={{
          borderColor: isFocused
            ? "var(--color-text-secondary)"
            : "var(--color-border)",
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
          placeholder="Search documents..."
          value={inputValue}
          onChange={handleChange}
          onFocus={() => setIsFocused(true)}
          onKeyDown={handleKeyDown}
          className="flex-1 text-sm bg-transparent outline-none"
          style={{ color: "var(--color-text-primary)" }}
        />
      </div>

      {/* Dropdown results */}
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
          {isSearching && (
            <div
              className="px-3 py-3 text-sm italic"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Searching...
            </div>
          )}

          {!isSearching && results.length === 0 && (
            <div
              className="px-3 py-3 text-sm italic"
              style={{ color: "var(--color-text-secondary)" }}
            >
              No results
            </div>
          )}

          {!isSearching &&
            results.map((result) => (
              <button
                key={result.documentId}
                onClick={() => {
                  onSelectResult(result.documentId);
                  setIsFocused(false);
                }}
                className="interactive-item w-full text-left px-3 py-2"
                style={{ color: "var(--color-text-primary)", borderRadius: 0 }}
              >
                <div className="text-sm font-medium truncate">
                  {result.title}
                </div>
                <div
                  className="text-xs mt-0.5 line-clamp-2"
                  style={{ color: "var(--color-text-secondary)" }}
                  dangerouslySetInnerHTML={{ __html: result.snippet }}
                />
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
