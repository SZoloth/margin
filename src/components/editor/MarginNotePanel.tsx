import { useState, useEffect, useRef, useCallback } from "react";
import type { Highlight, MarginNote } from "@/types/annotations";

interface MarginNotePanelProps {
  highlights: Highlight[];
  marginNotes: MarginNote[];
  onAddNote: (highlightId: string, content: string) => void;
  onUpdateNote: (noteId: string, content: string) => void;
  onDeleteNote: (noteId: string) => void;
  editorElement: HTMLElement | null;
  focusHighlightId?: string | null;
  onFocusConsumed?: () => void;
}

interface NotePosition {
  highlightId: string;
  top: number;
  notes: MarginNote[];
}

function NoteCard({
  note,
  highlightId,
  onAdd,
  onUpdate,
  onDelete,
  autoFocus,
}: {
  note: MarginNote | null;
  highlightId: string;
  onAdd: (highlightId: string, content: string) => void;
  onUpdate: (noteId: string, content: string) => void;
  onDelete: (noteId: string) => void;
  autoFocus?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(autoFocus && !note);
  const [editValue, setEditValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const startEditing = useCallback(() => {
    setEditValue(note?.content ?? "");
    setIsEditing(true);
  }, [note]);

  // Handle autoFocus for existing notes
  useEffect(() => {
    if (autoFocus && note && !isEditing) {
      startEditing();
    }
  }, [autoFocus]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [isEditing]);

  const handleSave = () => {
    const trimmed = editValue.trim();
    if (!trimmed) {
      setIsEditing(false);
      return;
    }

    if (note) {
      onUpdate(note.id, trimmed);
    } else {
      onAdd(highlightId, trimmed);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Escape") {
      setIsEditing(false);
    }
  };

  const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditValue(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  if (isEditing) {
    return (
      <div
        className="rounded border p-2"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-page)",
        }}
      >
        <textarea
          ref={textareaRef}
          value={editValue}
          onChange={handleTextareaInput}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          className="w-full resize-none border-none bg-transparent text-sm italic outline-none"
          style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            color: "var(--color-text-secondary)",
          }}
          rows={1}
          placeholder="Add a note..."
        />
        <div className="mt-1 flex justify-end gap-1">
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              setIsEditing(false);
            }}
            className="rounded px-1.5 py-0.5 text-xs transition-opacity hover:opacity-80"
            style={{ color: "var(--color-text-secondary)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              handleSave();
            }}
            className="rounded px-1.5 py-0.5 text-xs transition-opacity hover:opacity-80"
            style={{ color: "var(--color-text-primary)" }}
          >
            Save
          </button>
        </div>
      </div>
    );
  }

  if (!note) {
    return (
      <button
        type="button"
        onClick={startEditing}
        className="w-full rounded border border-dashed px-2 py-1 text-left text-xs italic transition-colors"
        style={{
          fontFamily: "Georgia, 'Times New Roman', serif",
          borderColor: "var(--color-border)",
          color: "var(--color-text-secondary)",
          opacity: 0.6,
        }}
      >
        Add a note...
      </button>
    );
  }

  return (
    <div
      className="group rounded border border-transparent px-2 py-1 transition-colors"
      style={{ ["--hover-bg" as string]: "rgba(0,0,0,0.03)" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--color-border)";
        e.currentTarget.style.backgroundColor = "rgba(0,0,0,0.02)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "transparent";
        e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      <p
        className="text-sm italic"
        style={{
          fontFamily: "Georgia, 'Times New Roman', serif",
          lineHeight: "1.5",
          color: "var(--color-text-secondary)",
        }}
      >
        {note.content}
      </p>
      <div className="mt-0.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={startEditing}
          className="text-xs hover:opacity-80"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => onDelete(note.id)}
          className="text-xs text-red-400 hover:text-red-600"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

export function MarginNotePanel({
  highlights,
  marginNotes,
  onAddNote,
  onUpdateNote,
  onDeleteNote,
  editorElement,
  focusHighlightId,
  onFocusConsumed,
}: MarginNotePanelProps) {
  const [notePositions, setNotePositions] = useState<NotePosition[]>([]);
  const [isNarrow, setIsNarrow] = useState(false);
  const [popoverHighlight, setPopoverHighlight] = useState<string | null>(null);

  const notesByHighlight = useRef(new Map<string, MarginNote[]>());
  // Rebuild the map whenever marginNotes changes
  notesByHighlight.current = new Map();
  for (const note of marginNotes) {
    const existing = notesByHighlight.current.get(note.highlight_id) ?? [];
    existing.push(note);
    notesByHighlight.current.set(note.highlight_id, existing);
  }

  // Consume focus signal
  const consumedFocusRef = useRef<string | null>(null);
  useEffect(() => {
    if (focusHighlightId && focusHighlightId !== consumedFocusRef.current) {
      consumedFocusRef.current = focusHighlightId;
      // Defer consuming so the render with autoFocus happens first
      requestAnimationFrame(() => {
        onFocusConsumed?.();
      });
    }
  }, [focusHighlightId, onFocusConsumed]);

  const computePositions = useCallback(() => {
    if (!editorElement) return;

    const scrollParent = editorElement.closest(".overflow-y-auto");
    if (!scrollParent) return;

    const scrollTop = scrollParent.scrollTop;
    const containerRect = scrollParent.getBoundingClientRect();
    const positions: NotePosition[] = [];

    // Build a map of mark elements by their text content for matching
    const markElements = editorElement.querySelectorAll("mark[data-color]");

    for (const highlight of highlights) {
      let matchedElement: Element | null = null;
      let bestScore = 0;

      // Score-based matching: prefer exact text match, fall back to prefix
      for (const el of markElements) {
        const elText = el.textContent ?? "";
        if (elText === highlight.text_content) {
          matchedElement = el;
          break; // exact match
        }
        // Partial match scoring
        const matchLen = Math.min(elText.length, highlight.text_content.length, 40);
        if (matchLen > 0 && elText.slice(0, matchLen) === highlight.text_content.slice(0, matchLen)) {
          const score = matchLen;
          if (score > bestScore) {
            bestScore = score;
            matchedElement = el;
          }
        }
      }

      let relativeTop: number;
      if (matchedElement) {
        const elRect = matchedElement.getBoundingClientRect();
        // Position relative to scroll container's content (not viewport)
        relativeTop = elRect.top - containerRect.top + scrollTop;
      } else {
        // Fallback: use the from_pos to estimate
        relativeTop = highlight.from_pos * 0.5;
      }

      positions.push({
        highlightId: highlight.id,
        top: relativeTop,
        notes: notesByHighlight.current.get(highlight.id) ?? [],
      });
    }

    // Avoid overlap: estimate height per group and enforce minimum gap
    positions.sort((a, b) => a.top - b.top);
    for (let i = 1; i < positions.length; i++) {
      const prev = positions[i - 1]!;
      const curr = positions[i]!;
      // Each note takes ~40px, plus ~30px for the "add" button, minimum 70px
      const prevHeight = Math.max(70, prev.notes.length * 40 + 30);
      if (curr.top - prev.top < prevHeight) {
        curr.top = prev.top + prevHeight;
      }
    }

    setNotePositions(positions);
  }, [editorElement, highlights, marginNotes]);

  useEffect(() => {
    computePositions();

    const handleResize = () => {
      setIsNarrow(window.innerWidth < 1000);
      computePositions();
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [computePositions]);

  // Recompute on scroll within the editor's scroll container
  useEffect(() => {
    if (!editorElement) return;

    const scrollParent = editorElement.closest(".overflow-y-auto");
    if (!scrollParent) return;

    const handleScroll = () => computePositions();
    scrollParent.addEventListener("scroll", handleScroll, { passive: true });
    return () => scrollParent.removeEventListener("scroll", handleScroll);
  }, [editorElement, computePositions]);

  if (highlights.length === 0) return null;

  // Narrow screens: render a popover
  if (isNarrow) {
    const popoverNotes = popoverHighlight
      ? notesByHighlight.current.get(popoverHighlight) ?? []
      : [];

    return (
      <>
        {popoverHighlight && (
          <div
            className="fixed inset-0 z-40"
            onClick={() => setPopoverHighlight(null)}
          />
        )}
        {popoverHighlight && (
          <div
            className="fixed bottom-4 right-4 z-50 w-72 rounded-lg border p-3 shadow-lg"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-page)",
            }}
          >
            {popoverNotes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                highlightId={popoverHighlight}
                onAdd={onAddNote}
                onUpdate={onUpdateNote}
                onDelete={onDeleteNote}
              />
            ))}
            <NoteCard
              note={null}
              highlightId={popoverHighlight}
              onAdd={onAddNote}
              onUpdate={onUpdateNote}
              onDelete={onDeleteNote}
            />
          </div>
        )}
      </>
    );
  }

  return (
    <div
      className="pointer-events-none absolute top-0 right-0 h-full"
      style={{ width: 220 }}
    >
      {notePositions.map((pos) => {
        const isFocused = focusHighlightId === pos.highlightId;

        return (
          <div
            key={pos.highlightId}
            className="pointer-events-auto absolute"
            style={{
              top: pos.top,
              left: 0,
              width: 200,
            }}
          >
            {/* Existing notes */}
            {pos.notes.map((note, idx) => (
              <NoteCard
                key={note.id}
                note={note}
                highlightId={pos.highlightId}
                onAdd={onAddNote}
                onUpdate={onUpdateNote}
                onDelete={onDeleteNote}
                autoFocus={isFocused && idx === 0 && pos.notes.length === 1}
              />
            ))}
            {/* Add another note button */}
            <NoteCard
              note={null}
              highlightId={pos.highlightId}
              onAdd={onAddNote}
              onUpdate={onUpdateNote}
              onDelete={onDeleteNote}
              autoFocus={isFocused && pos.notes.length === 0}
            />
          </div>
        );
      })}
    </div>
  );
}
