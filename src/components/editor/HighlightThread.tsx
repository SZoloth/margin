import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import type { Highlight, MarginNote } from "@/types/annotations";

interface HighlightThreadProps {
  highlight: Highlight;
  notes: MarginNote[];
  onAddNote: (highlightId: string, content: string) => void;
  onUpdateNote: (noteId: string, content: string) => void;
  onDeleteNote: (noteId: string) => void;
  onDeleteHighlight: (id: string) => void;
  onClose: () => void;
  anchorRect: DOMRect | null;
  autoFocusNew?: boolean;
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
  onUpdate,
  onDelete,
}: {
  note: MarginNote;
  onUpdate: (noteId: string, content: string) => void;
  onDelete: (noteId: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
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
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <div className="thread-message">
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
        <div className="thread-message-actions" style={{ marginTop: 4 }}>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); setIsEditing(false); }}
            className="note-action-btn text-xs"
          >
            Cancel
          </button>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); handleSave(); }}
            className="note-action-btn text-xs"
            style={{ fontWeight: 500 }}
          >
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="thread-message">
      <span className="thread-message-time">{formatTimeAgo(note.created_at)}</span>
      <p className="thread-message-content">{note.content}</p>
      <div className="thread-message-actions">
        <button type="button" onClick={startEditing} className="note-action-btn text-xs">
          Edit
        </button>
        <button
          type="button"
          onClick={() => onDelete(note.id)}
          className="note-action-btn note-action-btn--delete text-xs"
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
  onClose,
  anchorRect,
  autoFocusNew,
}: HighlightThreadProps) {
  const [newNoteValue, setNewNoteValue] = useState("");
  const [isVisible, setIsVisible] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Animate in
  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));
  }, []);

  // Auto-focus the new note textarea when opening from Note button
  useEffect(() => {
    if (autoFocusNew && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocusNew]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
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
  }, [onClose]);

  const handleAddNote = useCallback(() => {
    const trimmed = newNoteValue.trim();
    if (!trimmed) return;
    onAddNote(highlight.id, trimmed);
    setNewNoteValue("");
  }, [newNoteValue, highlight.id, onAddNote]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleAddNote();
    }
  };

  // Position calculation
  if (!anchorRect) return null;

  const isMobile = window.innerWidth < 768;

  // Desktop: position to the right of the highlight
  const popoverWidth = 300;
  const gap = 12;
  const left = Math.min(anchorRect.right + gap, window.innerWidth - popoverWidth - 8);
  const top = Math.max(8, Math.min(anchorRect.top, window.innerHeight - 400));

  return createPortal(
    <div
      ref={popoverRef}
      className={`thread-popover ${isMobile ? "thread-popover--mobile" : ""}`}
      style={isMobile ? {
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translateY(0)" : "translateY(100%)",
      } : {
        top,
        left: Math.max(8, left),
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "scale(1)" : "scale(0.97)",
      }}
    >
      {/* Header */}
      <div className="thread-header">
        <span className="thread-header-label">Notes</span>
        <button
          type="button"
          onClick={() => onDeleteHighlight(highlight.id)}
          className="note-action-btn note-action-btn--delete text-xs"
        >
          Remove
        </button>
      </div>

      {/* Highlight excerpt */}
      <div className="thread-excerpt">
        <p>{highlight.text_content}</p>
      </div>

      {/* Notes thread */}
      <div className="thread-body">
        {notes.map((note) => (
          <ThreadMessage
            key={note.id}
            note={note}
            onUpdate={onUpdateNote}
            onDelete={onDeleteNote}
          />
        ))}
      </div>

      {/* New note input */}
      <div className="thread-footer">
        <textarea
          ref={textareaRef}
          value={newNoteValue}
          onChange={(e) => {
            setNewNoteValue(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          onKeyDown={handleKeyDown}
          className="thread-textarea"
          placeholder="Add a note..."
          rows={1}
        />
        {newNoteValue.trim() && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
            <button
              type="button"
              onClick={handleAddNote}
              className="note-action-btn text-xs"
              style={{ fontWeight: 500 }}
            >
              Save
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
