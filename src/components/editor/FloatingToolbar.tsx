import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { Comment01Icon } from "@hugeicons/core-free-icons";
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
  const [isMounted, setIsMounted] = useState(false);
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

    // Always available because the portal stays mounted
    const toolbarWidth = toolbarRef.current?.offsetWidth ?? 100;
    const toolbarHeight = toolbarRef.current?.offsetHeight ?? 40;

    const centerX = (from.left + to.right) / 2;
    // Position above selection, but flip below if it would go off-screen
    let top = from.top - toolbarHeight - 8;
    if (top < 8) {
      top = to.bottom + 8;
    }
    const left = Math.max(
      8,
      Math.min(centerX - toolbarWidth / 2, window.innerWidth - toolbarWidth - 8),
    );

    setPosition({ top, left });

    if (!isMounted) {
      setIsMounted(true);
      // Wait one frame so the DOM element exists and starts at opacity 0
      requestAnimationFrame(() => setIsVisible(true));
    } else {
      setIsVisible(true);
    }
  }, [editor, isMounted]);

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

  if (!isMounted || !editor) return null;

  return createPortal(
    <div
      ref={toolbarRef}
      className="fixed z-50 flex items-center gap-1 border px-2 py-1.5 shadow-md"
      style={{
        top: position.top,
        left: position.left,
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-page)",
        borderRadius: "var(--radius-lg)",
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translateY(0) scale(1)" : "translateY(4px) scale(0.97)",
        transition: isVisible
          ? "opacity 200ms cubic-bezier(0.16, 1, 0.3, 1), transform 200ms cubic-bezier(0.16, 1, 0.3, 1)"
          : "opacity 150ms cubic-bezier(0.4, 0, 1, 1), transform 150ms cubic-bezier(0.4, 0, 1, 1)",
        pointerEvents: isVisible ? "auto" : "none",
      }}
      onMouseDown={(e) => {
        e.preventDefault();
      }}
    >
      {/* Highlight — custom SVG with yellow accent line */}
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
        <HugeiconsIcon icon={Comment01Icon} size={18} color="currentColor" strokeWidth={1.3} />
      </button>
    </div>,
    document.body,
  );
}
