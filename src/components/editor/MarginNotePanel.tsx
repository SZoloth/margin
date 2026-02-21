import { useState, useEffect, useRef, useCallback } from "react";
import type { Highlight, MarginNote } from "@/types/annotations";

interface MarginNotePanelProps {
  highlights: Highlight[];
  marginNotes: MarginNote[];
  onAddNote: (highlightId: string, content: string) => void;
  onUpdateNote: (noteId: string, content: string) => void;
  onDeleteNote: (noteId: string) => void;
  onDeleteHighlight: (id: string) => void;
  focusHighlightId?: string | null;
  onFocusConsumed?: () => void;
}

function NoteCard({
  note,
  highlightId,
  onAdd,
  onUpdate,
  onDelete,
  autoFocus,
  onEditingDone,
}: {
  note: MarginNote | null;
  highlightId: string;
  onAdd: (highlightId: string, content: string) => void;
  onUpdate: (noteId: string, content: string) => void;
  onDelete: (noteId: string) => void;
  autoFocus?: boolean;
  onEditingDone?: () => void;
}) {
  const [isEditing, setIsEditing] = useState(autoFocus && !note);
  const [editValue, setEditValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const stopEditing = useCallback(() => {
    setIsEditing(false);
    onEditingDone?.();
  }, [onEditingDone]);

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
      stopEditing();
      return;
    }

    if (note) {
      onUpdate(note.id, trimmed);
    } else {
      onAdd(highlightId, trimmed);
    }
    stopEditing();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Escape") {
      stopEditing();
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
              stopEditing();
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
            className="note-save-btn rounded px-1.5 py-0.5 text-xs transition-opacity hover:opacity-80"
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
        className="note-add-placeholder w-full rounded border border-dashed px-2 py-1 text-left text-xs italic"
        style={{
          fontFamily: "Georgia, 'Times New Roman', serif",
          color: "var(--color-text-secondary)",
        }}
      >
        Add a note...
      </button>
    );
  }

  return (
    <div className="note-card">
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
      <div className="note-card-actions mt-1 flex gap-1">
        <button
          type="button"
          onClick={startEditing}
          className="note-action-btn text-xs"
          style={{ color: "var(--color-text-secondary)" }}
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => onDelete(note.id)}
          className="note-action-btn note-action-btn--delete text-xs text-red-400"
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
  onDeleteHighlight,
  focusHighlightId,
  onFocusConsumed,
}: MarginNotePanelProps) {
  const notesByHighlight = useRef(new Map<string, MarginNote[]>());
  // Rebuild the map whenever marginNotes changes
  notesByHighlight.current = new Map();
  for (const note of marginNotes) {
    const existing = notesByHighlight.current.get(note.highlight_id) ?? [];
    existing.push(note);
    notesByHighlight.current.set(note.highlight_id, existing);
  }

  // Scroll to focused highlight
  const focusedRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (focusHighlightId && focusedRef.current) {
      focusedRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      onFocusConsumed?.();
    }
  }, [focusHighlightId, onFocusConsumed]);

  if (highlights.length === 0) return null;

  return (
    <div className="p-3 space-y-3">
      {highlights.map((highlight) => {
        const notes = notesByHighlight.current.get(highlight.id) ?? [];
        const isFocused = focusHighlightId === highlight.id;
        const hasNotes = notes.length > 0;

        return (
          <div
            key={highlight.id}
            ref={isFocused ? focusedRef : undefined}
            className={hasNotes ? "note-card-connected" : ""}
          >
            {/* Highlight excerpt */}
            <p
              className="text-xs mb-1 line-clamp-2"
              style={{
                fontFamily: "Georgia, 'Times New Roman', serif",
                color: "var(--color-text-secondary)",
                opacity: 0.7,
                borderLeft: "2px solid var(--highlight-yellow, #fde68a)",
                paddingLeft: 6,
              }}
            >
              {highlight.text_content}
            </p>

            {/* Existing notes */}
            {notes.map((note) => (
              <NoteCard
                key={note.id}
                note={note}
                highlightId={highlight.id}
                onAdd={onAddNote}
                onUpdate={onUpdateNote}
                onDelete={onDeleteNote}
              />
            ))}

            {/* New note editor — opens when focused via Note button */}
            <div className={`note-editor-reveal${isFocused ? " is-open" : ""}`}>
              {isFocused && (
                <NoteCard
                  note={null}
                  highlightId={highlight.id}
                  onAdd={onAddNote}
                  onUpdate={onUpdateNote}
                  onDelete={onDeleteNote}
                  autoFocus
                  onEditingDone={onFocusConsumed}
                />
              )}
            </div>

            {/* Add note placeholder when no notes and not focused */}
            {!hasNotes && !isFocused && (
              <NoteCard
                note={null}
                highlightId={highlight.id}
                onAdd={onAddNote}
                onUpdate={onUpdateNote}
                onDelete={onDeleteNote}
              />
            )}

            {/* Remove highlight button */}
            <div
              className="mt-1"
              style={{ opacity: 0, transition: "opacity 120ms ease" }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = "0"; }}
            >
              <button
                type="button"
                onClick={() => onDeleteHighlight(highlight.id)}
                className="text-xs text-red-400 hover:text-red-600"
              >
                Remove highlight
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
