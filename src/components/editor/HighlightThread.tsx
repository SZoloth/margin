import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, Delete02Icon } from "@hugeicons/core-free-icons";
import type { Highlight, MarginNote } from "@/types/annotations";
import { HIGHLIGHT_COLORS } from "@/lib/highlight-colors";

interface HighlightThreadProps {
  highlight: Highlight;
  notes: MarginNote[];
  onAddNote: (highlightId: string, content: string) => void;
  onUpdateNote: (noteId: string, content: string) => void;
  onDeleteNote: (noteId: string) => void;
  onDeleteHighlight: (id: string) => void;
  onRecolor?: (highlightId: string, color: string) => void;
  onClose: () => void;
  anchorRect: DOMRect | null;
  autoFocusNew?: boolean;
  isVisible: boolean;
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function ThreadMessage({
  note,
  fresh,
  onUpdate,
  onDelete,
}: {
  note: MarginNote;
  /** Arrived during this open — plays the save-bridge entrance once. */
  fresh?: boolean;
  onUpdate: (noteId: string, content: string) => void;
  onDelete: (noteId: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus({ preventScroll: true });
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [isEditing]);

  const startEditing = () => {
    setEditValue(note.content);
    setIsEditing(true);
  };

  const handleSave = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== note.content) {
      onUpdate(note.id, trimmed);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Escape") {
      e.stopPropagation();
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <div className={`thread-message${fresh ? " thread-message--fresh" : ""}`}>
        <textarea
          ref={textareaRef}
          value={editValue}
          onChange={(e) => {
            setEditValue(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          onKeyDown={handleKeyDown}
          className="thread-textarea"
          rows={1}
        />
        <div className="thread-message-actions thread-message-actions--visible" style={{ marginTop: 4 }}>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); setIsEditing(false); }}
            className="note-action-btn text-[length:var(--text-sm)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); handleSave(); }}
            className="note-action-btn text-[length:var(--text-sm)]"
            style={{ fontWeight: 500 }}
          >
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`thread-message${fresh ? " thread-message--fresh" : ""}`}>
      <p className="thread-message-content">{note.content}</p>
      <div className="thread-message-actions">
        <span className="thread-message-time">{formatTimeAgo(note.created_at)}</span>
        <button type="button" onClick={startEditing} className="note-action-btn text-[length:var(--text-sm)]">
          Edit
        </button>
        <button
          type="button"
          onClick={() => onDelete(note.id)}
          className="note-action-btn note-action-btn--delete text-[length:var(--text-sm)]"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export function HighlightThread({
  highlight,
  notes,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  onDeleteHighlight,
  onRecolor,
  onClose,
  anchorRect,
  autoFocusNew,
  isVisible,
}: HighlightThreadProps) {
  // Drafts survive dismissal — closing a thread must never eat a half-typed
  // note. Persisted per-highlight in sessionStorage.
  const draftKey = `margin:draft:${highlight.id}`;
  const [newNoteValue, setNewNoteValue] = useState("");
  useEffect(() => {
    try {
      setNewNoteValue(sessionStorage.getItem(`margin:draft:${highlight.id}`) ?? "");
    } catch {
      setNewNoteValue("");
    }
  }, [highlight.id]);

  // Live anchor rect — the prop is a snapshot; scrolling makes it stale, so
  // re-measure the highlight's DOM rect on scroll/resize (rAF-throttled).
  const [liveRect, setLiveRect] = useState<DOMRect | null>(anchorRect);
  // The thread lives in the margin lane (right of the text column), not on
  // top of the passage it annotates — measured from the reader column edge.
  const [laneX, setLaneX] = useState<number | null>(null);
  const [popoverH, setPopoverH] = useState(200);
  const popoverRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previousFocusRef = useRef<Element | null>(null);

  // Keep the anchor rect in sync with the prop and with layout changes.
  useEffect(() => {
    setLiveRect(anchorRect);
  }, [anchorRect]);

  useEffect(() => {
    let rafId = 0;
    const remeasure = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        const mark = document.querySelector(
          `mark[data-highlight-id="${CSS.escape(highlight.id)}"]`,
        );
        if (mark) {
          // Anchor at the mark's terminus — the union rect of a wrapped
          // (multi-line) mark launches the hairline from whitespace right of
          // where the last line actually ends.
          const rects = mark.getClientRects();
          setLiveRect(rects[rects.length - 1] ?? mark.getBoundingClientRect());
        }
        const col = document.querySelector(".reader-content-column");
        if (col) setLaneX(col.getBoundingClientRect().right + 24);
        if (popoverRef.current) setPopoverH(popoverRef.current.offsetHeight);
      });
    };
    remeasure();
    // Scroll events don't bubble — capture phase catches the reader's
    // scroll container as well as any nested scrollers.
    window.addEventListener("scroll", remeasure, { capture: true, passive: true });
    window.addEventListener("resize", remeasure);
    return () => {
      window.removeEventListener("scroll", remeasure, { capture: true });
      window.removeEventListener("resize", remeasure);
      cancelAnimationFrame(rafId);
    };
  }, [highlight.id]);

  // Card height changes with content (notes arriving, textarea autogrow) —
  // keep the measured height fresh so the top clamp and hairline bridge
  // stay honest.
  useEffect(() => {
    if (popoverRef.current) setPopoverH(popoverRef.current.offsetHeight);
  }, [notes.length, newNoteValue]);

  // Save previous focus on mount
  useEffect(() => {
    previousFocusRef.current = document.activeElement;
    return () => {
      // Restore focus on unmount
      if (previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus({ preventScroll: true });
      }
    };
  }, []);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // Auto-focus the new note textarea when opening from Note button
  useEffect(() => {
    if (autoFocusNew && textareaRef.current) {
      textareaRef.current.focus({ preventScroll: true });
    }
  }, [autoFocusNew]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleClose]);

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        handleClose();
      }
    };
    // Delay listener to avoid closing immediately from the triggering click
    const timer = setTimeout(() => {
      window.addEventListener("mousedown", handleClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousedown", handleClick);
    };
  }, [handleClose]);

  // Focus trap — keep Tab cycling within the popover
  useEffect(() => {
    const popover = popoverRef.current;
    if (!popover) return;

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusable = popover.querySelectorAll<HTMLElement>(
        'button, textarea, input, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0] as HTMLElement | undefined;
      const last = focusable[focusable.length - 1] as HTMLElement | undefined;
      if (!first || !last) return;

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus({ preventScroll: true });
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus({ preventScroll: true });
        }
      }
    };

    popover.addEventListener("keydown", handleTab);
    return () => popover.removeEventListener("keydown", handleTab);
  }, []);

  // Notes present at mount replay no entrance — only notes added during
  // this open blur-bridge in (composer → saved note swap).
  const mountNoteIds = useRef<Set<string> | null>(null);
  const mountSet = (mountNoteIds.current ??= new Set(notes.map((n) => n.id)));

  const handleAddNote = useCallback(() => {
    const trimmed = newNoteValue.trim();
    if (!trimmed) return;
    onAddNote(highlight.id, trimmed);
    setNewNoteValue("");
    try {
      sessionStorage.removeItem(`margin:draft:${highlight.id}`);
    } catch {
      /* storage unavailable */
    }
  }, [newNoteValue, highlight.id, onAddNote]);

  // A draft is only meaningful while its mark lives — clear it when the
  // thread unmounts with no saved notes (provisional mark deleted on close).
  const notesRef = useRef(notes);
  notesRef.current = notes;
  useEffect(
    () => () => {
      if (notesRef.current.length === 0) {
        try {
          sessionStorage.removeItem(`margin:draft:${highlight.id}`);
        } catch {
          /* storage unavailable */
        }
      }
    },
    [highlight.id],
  );

  const handleRemoveHighlight = () => {
    try {
      sessionStorage.removeItem(`margin:draft:${highlight.id}`);
    } catch {
      /* storage unavailable */
    }
    onDeleteHighlight(highlight.id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleAddNote();
    }
  };

  // Position calculation
  if (!liveRect) return null;

  const isMobile = window.innerWidth < 768;

  // Desktop: marginalia never covers its subject — anchor the thread in the
  // margin lane just right of the text column. Fall back to hugging the mark
  // when the lane doesn't fit (narrow windows).
  const popoverWidth = 300;
  const laneFits = laneX !== null && laneX + popoverWidth <= window.innerWidth - 8;
  const left = laneFits
    ? laneX
    : Math.min(liveRect.right + 12, window.innerWidth - popoverWidth - 8);
  const top = Math.max(8, Math.min(liveRect.top, window.innerHeight - popoverH - 8));
  const popoverLeft = Math.max(8, left);
  const connectorWidth = popoverLeft - liveRect.right;

  // The hairline runs through the inter-line leading just below the mark —
  // guaranteed whitespace, so it never underlines text it doesn't annotate.
  // When the card is clamped away from the mark's line, a vertical segment
  // bridges the gap down to (or up from) the card's bottom edge.
  const lineY = liveRect.bottom + 3;
  const cardTop = top;
  const cardBottom = top + popoverH;
  const lineHitsCard = lineY >= cardTop && lineY <= cardBottom;

  return createPortal(
    <>
      {/* Anchor hairline — the thread is tied to its passage, not floating */}
      {!isMobile && connectorWidth >= 8 && (
        <div
          aria-hidden="true"
          className="thread-anchor-line"
          style={{
            top: lineY,
            left: liveRect.right,
            width: connectorWidth,
            background: `color-mix(in srgb, var(--color-highlight-${highlight.color}) 55%, var(--color-text-primary))`,
            opacity: isVisible ? 1 : 0,
          }}
        />
      )}
      {!isMobile && connectorWidth >= 8 && !lineHitsCard && (
        <div
          aria-hidden="true"
          className="thread-anchor-line thread-anchor-line--vertical"
          style={{
            top: Math.min(lineY, cardBottom),
            left: popoverLeft,
            height: Math.abs(lineY - cardBottom),
            background: `color-mix(in srgb, var(--color-highlight-${highlight.color}) 55%, var(--color-text-primary))`,
            opacity: isVisible ? 1 : 0,
          }}
        />
      )}
      <div
      ref={popoverRef}
      role="dialog"
      aria-label="Highlight notes"
      className={`thread-popover ${isMobile ? "thread-popover--mobile" : ""}`}
      style={isMobile ? {
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translateY(0)" : "translateY(100%)",
        transformOrigin: "bottom center",
        pointerEvents: isVisible ? "auto" : "none",
        transition: isVisible
          ? "opacity 200ms var(--ease-entrance), transform 200ms var(--ease-entrance)"
          : "opacity 150ms var(--ease-exit), transform 150ms var(--ease-exit)",
      } : {
        top,
        left: popoverLeft,
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "scale(1)" : "scale(0.97)",
        transformOrigin: "left top",
        pointerEvents: isVisible ? "auto" : "none",
        transition: isVisible
          ? "opacity 200ms var(--ease-entrance), transform 200ms var(--ease-entrance)"
          : "opacity 150ms var(--ease-exit), transform 150ms var(--ease-exit)",
      }}
    >
      {/* Top row: quiet icons only — × closes (provisional marks disappear),
          trash removes the highlight and its notes. No header chrome. */}
      <div className="thread-top">
        <button
          type="button"
          onClick={handleRemoveHighlight}
          className="thread-icon-btn thread-icon-btn--destructive"
          aria-label="Remove highlight and notes"
          title="Remove highlight and notes (or ⇧click the highlight)"
        >
          <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="thread-icon-btn"
          aria-label={notes.length === 0 ? "Close (removes highlight)" : "Close thread"}
          title={notes.length === 0 ? "Close — removes highlight" : "Close"}
        >
          <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.5} />
        </button>
      </div>

      {/* Existing notes */}
      {notes.length > 0 && (
        <div className="thread-body">
          {notes.map((note) => (
            <ThreadMessage
              key={note.id}
              note={note}
              fresh={!mountSet.has(note.id)}
              onUpdate={onUpdateNote}
              onDelete={onDeleteNote}
            />
          ))}
        </div>
      )}

      {/* New note input — every annotation is a note; correction is the default intent */}
      <div className="thread-footer">
        <textarea
          ref={textareaRef}
          value={newNoteValue}
          onChange={(e) => {
            setNewNoteValue(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${e.target.scrollHeight}px`;
            try {
              if (e.target.value) {
                sessionStorage.setItem(draftKey, e.target.value);
              } else {
                sessionStorage.removeItem(draftKey);
              }
            } catch {
              /* storage unavailable — draft stays in memory */
            }
          }}
          onKeyDown={handleKeyDown}
          className="thread-textarea"
          placeholder="What should change here?"
          rows={1}
        />
        {newNoteValue.trim() && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
            <button
              type="button"
              onClick={handleAddNote}
              className="note-action-btn note-action-btn--primary text-[length:var(--text-sm)]"
            >
              Save
            </button>
          </div>
        )}
        {/* Meta row: recolor swatches left, save hint right */}
        <div className="thread-meta">
          {onRecolor ? (
            <div
              className="thread-colors"
              role="radiogroup"
              aria-label="Highlight color"
              title="Cycle color: ⌘."
            >
              {HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  role="radio"
                  aria-checked={highlight.color === c.name}
                  aria-label={`Highlight ${c.name}`}
                  onClick={() => onRecolor(highlight.id, c.name)}
                  className="thread-color-btn"
                >
                  <span
                    className={`thread-color-dot${highlight.color === c.name ? " thread-color-dot--selected" : ""}`}
                    style={{ backgroundColor: c.css }}
                  />
                </button>
              ))}
            </div>
          ) : (
            <span />
          )}
          <span className="thread-hint">
            ⌘↵ save{notes.length === 0 ? " · Esc removes" : ""}
          </span>
        </div>
      </div>
      </div>
    </>,
    document.body,
  );
}
