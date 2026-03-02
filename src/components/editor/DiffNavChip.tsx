import { useEffect } from "react";

interface DiffNavChipProps {
  currentIndex: number;
  totalCount: number;
  onPrev: () => void;
  onNext: () => void;
}

export function DiffNavChip({
  currentIndex,
  totalCount,
  onPrev,
  onNext,
}: DiffNavChipProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.target instanceof HTMLElement) {
        // Don't hijack typing in the editor (contenteditable), since `[` / `]` are common in Markdown.
        if (e.target.isContentEditable || e.target.closest('[contenteditable="true"]')) return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "]") {
        e.preventDefault();
        onNext();
      } else if (e.key === "[") {
        e.preventDefault();
        onPrev();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onNext, onPrev]);

  return (
    <div className="diff-nav-chip">
      <button
        type="button"
        className="diff-nav-chip__btn"
        onClick={onPrev}
        aria-label="Previous change"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M8.5 3.5l-4 3.5 4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <span className="diff-nav-chip__label">
        {currentIndex + 1} of {totalCount}
      </span>
      <button
        type="button"
        className="diff-nav-chip__btn"
        onClick={onNext}
        aria-label="Next change"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M5.5 3.5l4 3.5-4 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}
