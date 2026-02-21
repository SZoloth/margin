import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";

interface FloatingToolbarProps {
  editor: Editor | null;
  onHighlight: () => void;
  onNote: () => void;
}

export function FloatingToolbar({
  editor,
  onHighlight,
  onNote,
}: FloatingToolbarProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const toolbarRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(() => {
    if (!editor) return;

    const { selection } = editor.state;
    if (selection.empty) {
      setIsVisible(false);
      return;
    }

    if (!editor.isFocused) {
      setIsVisible(false);
      return;
    }

    let from, to;
    try {
      from = editor.view.coordsAtPos(selection.from);
      to = editor.view.coordsAtPos(selection.to);
    } catch {
      setIsVisible(false);
      return;
    }

    const toolbarWidth = toolbarRef.current?.offsetWidth ?? 100;
    const toolbarHeight = toolbarRef.current?.offsetHeight ?? 40;

    const centerX = (from.left + to.right) / 2;
    const top = from.top - toolbarHeight - 8;
    const left = Math.max(
      8,
      Math.min(centerX - toolbarWidth / 2, window.innerWidth - toolbarWidth - 8),
    );

    setPosition({ top, left });
    setIsVisible(true);
  }, [editor]);

  useEffect(() => {
    if (!editor) return;

    const handleSelectionUpdate = () => {
      updatePosition();
    };

    const handleBlur = () => {
      setTimeout(() => {
        if (!editor.isFocused) {
          setIsVisible(false);
        }
      }, 150);
    };

    const handleFocus = () => {
      updatePosition();
    };

    editor.on("selectionUpdate", handleSelectionUpdate);
    editor.on("blur", handleBlur);
    editor.on("focus", handleFocus);

    return () => {
      editor.off("selectionUpdate", handleSelectionUpdate);
      editor.off("blur", handleBlur);
      editor.off("focus", handleFocus);
    };
  }, [editor, updatePosition]);

  if (!isVisible || !editor) return null;

  return createPortal(
    <div
      ref={toolbarRef}
      className="fixed z-50 flex items-center gap-1 rounded-lg border px-2 py-1.5 shadow-md"
      style={{
        top: position.top,
        left: position.left,
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-page)",
      }}
      onMouseDown={(e) => {
        e.preventDefault();
      }}
    >
      {/* Highlight */}
      <button
        type="button"
        onClick={onHighlight}
        className="toolbar-btn"
        aria-label="Highlight"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M10.5 2.5L15 7L7 15H2.5V10.5L10.5 2.5Z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M2 16.5H16"
            stroke="#EAB308"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {/* Note */}
      <button
        type="button"
        onClick={onNote}
        className="toolbar-btn"
        aria-label="Add note"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M3 3.5C3 3.22386 3.22386 3 3.5 3H14.5C14.7761 3 15 3.22386 15 3.5V12.5C15 12.7761 14.7761 13 14.5 13H6.707L4.354 15.354C4.158 15.55 3.842 15.55 3.646 15.354C3.552 15.26 3.5 15.133 3.5 15V13H3.5C3.22386 13 3 12.7761 3 12.5V3.5Z"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>,
    document.body,
  );
}
