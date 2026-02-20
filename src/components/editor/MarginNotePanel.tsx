import { useState, useEffect, useRef, useCallback } from "react";
import type { Highlight, MarginNote } from "@/types/annotations";

interface MarginNotePanelProps {
  highlights: Highlight[];
  marginNotes: MarginNote[];
  onAddNote: (highlightId: string, content: string) => void;
  onUpdateNote: (noteId: string, content: string) => void;
  onDeleteNote: (noteId: string) => void;
  editorElement: HTMLElement | null;
}

interface NotePosition {
  highlightId: string;
  top: number;
  note: MarginNote | null;
}

function NoteCard({
  note,
  highlightId,
  onAdd,
  onUpdate,
  onDelete,
}: {
  note: MarginNote | null;
  highlightId: string;
  onAdd: (highlightId: string, content: string) => void;
  onUpdate: (noteId: string, content: string) => void;
  onDelete: (noteId: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const startEditing = useCallback(() => {
    setEditValue(note?.content ?? "");
    setIsEditing(true);
  }, [note]);

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
      <div className="rounded border border-stone-200 bg-stone-50/80 p-2">
        <textarea
          ref={textareaRef}
          value={editValue}
          onChange={handleTextareaInput}
          onKeyDown={handleKeyDown}
          onBlur={handleSave}
          className="w-full resize-none border-none bg-transparent text-sm italic text-stone-700 outline-none"
          style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
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
            className="rounded px-1.5 py-0.5 text-xs text-stone-400 hover:text-stone-600"
          >
            Cancel
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              handleSave();
            }}
            className="rounded px-1.5 py-0.5 text-xs text-stone-600 hover:text-stone-900"
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
        className="w-full rounded border border-dashed border-stone-300 px-2 py-1 text-left text-xs italic text-stone-400 transition-colors hover:border-stone-400 hover:text-stone-500"
        style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
      >
        Add a note...
      </button>
    );
  }

  return (
    <div className="group rounded border border-transparent px-2 py-1 transition-colors hover:border-stone-200 hover:bg-stone-50/60">
      <p
        className="text-sm italic text-stone-600"
        style={{
          fontFamily: "Georgia, 'Times New Roman', serif",
          lineHeight: "1.5",
        }}
      >
        {note.content}
      </p>
      <div className="mt-0.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={startEditing}
          className="text-xs text-stone-400 hover:text-stone-600"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => onDelete(note.id)}
          className="text-xs text-stone-400 hover:text-red-500"
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
}: MarginNotePanelProps) {
  const [notePositions, setNotePositions] = useState<NotePosition[]>([]);
  const [isNarrow, setIsNarrow] = useState(false);
  const [popoverHighlight, setPopoverHighlight] = useState<string | null>(null);

  const notesByHighlight = new Map<string, MarginNote>();
  for (const note of marginNotes) {
    notesByHighlight.set(note.highlight_id, note);
  }

  const computePositions = useCallback(() => {
    if (!editorElement) return;

    const editorRect = editorElement.getBoundingClientRect();
    const positions: NotePosition[] = [];

    for (const highlight of highlights) {
      // Find highlight marks in the editor by scanning data attributes
      const markElements = editorElement.querySelectorAll("mark[data-color]");
      let matchedElement: Element | null = null;

      for (const el of markElements) {
        if (el.textContent?.includes(highlight.text_content.slice(0, 20))) {
          matchedElement = el;
          break;
        }
      }

      if (!matchedElement) {
        // Fallback: estimate position based on document order
        const estimatedTop = (highlight.from_pos / 1000) * 40;
        positions.push({
          highlightId: highlight.id,
          top: estimatedTop,
          note: notesByHighlight.get(highlight.id) ?? null,
        });
        continue;
      }

      const elRect = matchedElement.getBoundingClientRect();
      const relativeTop = elRect.top - editorRect.top;

      positions.push({
        highlightId: highlight.id,
        top: relativeTop,
        note: notesByHighlight.get(highlight.id) ?? null,
      });
    }

    // Avoid overlap: ensure at least 60px between notes
    positions.sort((a, b) => a.top - b.top);
    for (let i = 1; i < positions.length; i++) {
      const prev = positions[i - 1];
      const curr = positions[i];
      if (prev && curr && curr.top - prev.top < 60) {
        curr.top = prev.top + 60;
      }
    }

    setNotePositions(positions);
  }, [editorElement, highlights, notesByHighlight]);

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

  // Recompute on scroll within the editor
  useEffect(() => {
    if (!editorElement) return;

    const scrollParent = editorElement.closest("[class*='overflow']") ?? window;
    const handleScroll = () => computePositions();

    scrollParent.addEventListener("scroll", handleScroll, { passive: true });
    return () => scrollParent.removeEventListener("scroll", handleScroll);
  }, [editorElement, computePositions]);

  if (highlights.length === 0) return null;

  // Narrow screens: render a small popover button on each highlight
  if (isNarrow) {
    return (
      <>
        {popoverHighlight && (
          <div
            className="fixed inset-0 z-40"
            onClick={() => setPopoverHighlight(null)}
          />
        )}
        {popoverHighlight && (
          <div className="fixed bottom-4 right-4 z-50 w-72 rounded-lg border border-stone-200 bg-white p-3 shadow-lg">
            <NoteCard
              note={notesByHighlight.get(popoverHighlight) ?? null}
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
      {notePositions.map((pos) => (
        <div
          key={pos.highlightId}
          className="pointer-events-auto absolute"
          style={{
            top: pos.top,
            left: 0,
            width: 200,
          }}
        >
          <NoteCard
            note={pos.note}
            highlightId={pos.highlightId}
            onAdd={onAddNote}
            onUpdate={onUpdateNote}
            onDelete={onDeleteNote}
          />
        </div>
      ))}
    </div>
  );
}
