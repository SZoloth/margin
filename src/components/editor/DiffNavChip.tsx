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
        ‹
      </button>
      <span>
        {currentIndex + 1} of {totalCount}
      </span>
      <button
        type="button"
        className="diff-nav-chip__btn"
        onClick={onNext}
        aria-label="Next change"
      >
        ›
      </button>
    </div>
  );
}
