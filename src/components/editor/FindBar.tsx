import { useState, useEffect, useRef, useCallback } from "react";
import type { Editor } from "@tiptap/core";
import { useAnimatedPresence } from "@/hooks/useAnimatedPresence";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowUp02Icon,
  ArrowDown02Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
import type { SearchStorage } from "./extensions/search";

interface FindBarProps {
  editor: Editor | null;
  isOpen: boolean;
  onClose: () => void;
}

export function FindBar({ editor, isOpen, onClose }: FindBarProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const presence = useAnimatedPresence(isOpen, 150);

  const storage = editor?.storage.search as SearchStorage | undefined;
  const resultCount = storage?.results.length ?? 0;
  const activeIndex = storage?.activeIndex ?? -1;

  // Focus and select input when opening
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isOpen]);

  // Update search when query changes
  useEffect(() => {
    if (!editor) return;
    if (query) {
      editor.commands.setSearchTerm(query);
    } else {
      editor.commands.clearSearch();
    }
  }, [query, editor]);

  // Clear search on close
  useEffect(() => {
    if (!isOpen && editor) {
      editor.commands.clearSearch();
    }
  }, [isOpen, editor]);

  const handleClose = useCallback(() => {
    setQuery("");
    onClose();
  }, [onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) {
          editor?.commands.prevMatch();
        } else {
          editor?.commands.nextMatch();
        }
      }
    },
    [editor, handleClose],
  );

  if (!presence.isMounted) return null;

  const counterText =
    resultCount === 0 && query
      ? "No results"
      : resultCount > 0
        ? `${activeIndex + 1} of ${resultCount}`
        : "";

  return (
    <div
      className="flex items-center gap-2 px-4 py-1.5 border-b flex-shrink-0"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-surface-subtle)",
        opacity: presence.isVisible ? 1 : 0,
        transform: presence.isVisible ? "translateY(0)" : "translateY(-100%)",
        transition: presence.isVisible
          ? "opacity 150ms var(--ease-entrance), transform 150ms var(--ease-entrance)"
          : "opacity 100ms var(--ease-exit), transform 100ms var(--ease-exit)",
      }}
    >
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find in document..."
        className="flex-1 min-w-0"
        style={{
          background: "none",
          border: "none",
          outline: "none",
          fontSize: "var(--text-sm)",
          color: "var(--color-text-primary)",
          fontFamily: "inherit",
          padding: "2px 0",
        }}
      />

      {counterText && (
        <span
          style={{
            fontSize: "var(--text-xs)",
            color: "var(--color-text-tertiary)",
            whiteSpace: "nowrap",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {counterText}
        </span>
      )}

      <button
        type="button"
        onClick={() => editor?.commands.prevMatch()}
        disabled={resultCount === 0}
        className="find-bar-btn"
        aria-label="Previous match"
        title="Previous match (Shift+Enter)"
      >
        <HugeiconsIcon icon={ArrowUp02Icon} size={14} color="currentColor" strokeWidth={1.5} />
      </button>

      <button
        type="button"
        onClick={() => editor?.commands.nextMatch()}
        disabled={resultCount === 0}
        className="find-bar-btn"
        aria-label="Next match"
        title="Next match (Enter)"
      >
        <HugeiconsIcon icon={ArrowDown02Icon} size={14} color="currentColor" strokeWidth={1.5} />
      </button>

      <button
        type="button"
        onClick={handleClose}
        className="find-bar-btn"
        aria-label="Close find bar"
        title="Close (Escape)"
      >
        <HugeiconsIcon icon={Cancel01Icon} size={14} color="currentColor" strokeWidth={1.5} />
      </button>
    </div>
  );
}
