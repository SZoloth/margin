import { useState, useEffect, useCallback, useRef, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { HugeiconsIcon } from "@hugeicons/react";
import { Comment01Icon } from "@hugeicons/core-free-icons";
import type { Editor } from "@tiptap/core";

import { HIGHLIGHT_COLORS } from "@/lib/highlight-colors";

interface FloatingToolbarProps {
  editor: Editor | null;
  onHighlight: (color?: string) => void;
  onNote: (range?: { from: number; to: number }) => void;
  defaultColor?: string;
}

type InlineFormat = "bold" | "italic" | "strike" | "code";

const INLINE_FORMATS: Array<{
  format: InlineFormat;
  label: string;
  shortcut?: string;
  glyph: string;
  style?: CSSProperties;
}> = [
  { format: "bold", label: "Bold", shortcut: "⌘B", glyph: "B", style: { fontWeight: 700 } },
  { format: "italic", label: "Italic", shortcut: "⌘I", glyph: "I", style: { fontStyle: "italic" } },
  { format: "strike", label: "Strikethrough", glyph: "S", style: { textDecoration: "line-through" } },
  { format: "code", label: "Inline code", glyph: "<>" },
];

export function FloatingToolbar({
  editor,
  onHighlight,
  onNote,
  defaultColor = "yellow",
}: FloatingToolbarProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [isFlipped, setIsFlipped] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const noteSelectionRef = useRef<{ from: number; to: number } | null>(null);

  const applyInlineFormat = useCallback((format: InlineFormat) => {
    if (!editor) return;
    const chain = editor.chain().focus();
    switch (format) {
      case "bold":
        chain.toggleBold().run();
        break;
      case "italic":
        chain.toggleItalic().run();
        break;
      case "strike":
        chain.toggleStrike().run();
        break;
      case "code":
        chain.toggleCode().run();
        break;
    }
  }, [editor]);

  const currentSelectionRange = useCallback(() => {
    if (!editor) return null;
    const { from, to, empty } = editor.state.selection;
    if (empty || from === to) return null;
    return { from, to };
  }, [editor]);

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
    let flipped = false;
    if (top < 8) {
      top = to.bottom + 8;
      flipped = true;
    }
    setIsFlipped(flipped);
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

  // Unmount after exit animation completes
  useEffect(() => {
    const el = toolbarRef.current;
    if (!el || isVisible) return;

    const handleTransitionEnd = (e: TransitionEvent) => {
      if (e.propertyName === "opacity" && !isVisible) setIsMounted(false);
    };
    el.addEventListener("transitionend", handleTransitionEnd);
    return () => el.removeEventListener("transitionend", handleTransitionEnd);
  }, [isVisible]);

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
      role="toolbar"
      aria-label="Formatting and feedback"
      className="fixed z-50 flex items-center gap-1 border px-2 py-1.5 shadow-md"
      style={{
        top: position.top,
        left: position.left,
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-page)",
        borderRadius: "var(--radius-lg)",
        opacity: isVisible ? 1 : 0,
        transformOrigin: isFlipped ? "center top" : "center bottom",
        transform: isVisible ? "translateY(0) scale(1)" : "translateY(4px) scale(0.97)",
        transition: isVisible
          ? "opacity 200ms var(--ease-entrance), transform 200ms var(--ease-entrance)"
          : "opacity 150ms var(--ease-exit), transform 150ms var(--ease-exit)",
        pointerEvents: isVisible ? "auto" : "none",
      }}
      onMouseDown={(e) => {
        e.preventDefault();
      }}
    >
      {INLINE_FORMATS.map(({ format, label, shortcut, glyph, style }) => {
        const isActive = editor.isActive(format);
        return (
          <button
            key={format}
            type="button"
            onClick={() => applyInlineFormat(format)}
            className={`toolbar-btn${isActive ? " toolbar-btn--active" : ""}`}
            aria-label={`${label}${shortcut ? ` (${shortcut})` : ""}`}
            aria-pressed={isActive}
            title={`${label}${shortcut ? ` ${shortcut}` : ""}`}
          >
            <span
              aria-hidden="true"
              style={{
                minWidth: 18,
                fontFamily: format === "code" ? "var(--font-mono, ui-monospace, monospace)" : "var(--font-sans, system-ui, sans-serif)",
                fontSize: format === "code" ? 12 : 15,
                lineHeight: 1,
                ...style,
              }}
            >
              {glyph}
            </span>
          </button>
        );
      })}

      <div
        aria-hidden="true"
        style={{
          width: 1,
          height: 18,
          backgroundColor: "var(--color-border)",
          margin: "0 2px",
          flexShrink: 0,
        }}
      />

      {/* Color picker circles — default color first */}
      {[...HIGHLIGHT_COLORS].sort((a, b) =>
        a.name === defaultColor ? -1 : b.name === defaultColor ? 1 : 0
      ).map((c) => (
        <button
          key={c.name}
          type="button"
          onClick={() => onHighlight(c.name)}
          className={`toolbar-color-btn${c.name === defaultColor ? " toolbar-color-btn--selected" : ""}`}
          aria-label={`Highlight ${c.name}`}
        >
          <span
            style={{
              display: "block",
              width: 20,
              height: 20,
              borderRadius: "50%",
              backgroundColor: c.css,
              border: c.name === defaultColor
                ? "2px solid var(--color-text-secondary)"
                : "1.5px solid var(--color-border)",
            }}
          />
        </button>
      ))}

      {/* Divider */}
      <div
        style={{
          width: 1,
          height: 18,
          backgroundColor: "var(--color-border)",
          margin: "0 2px",
          flexShrink: 0,
        }}
      />

      {/* Note */}
      <button
        type="button"
        onMouseDown={() => {
          noteSelectionRef.current = currentSelectionRange();
        }}
        onClick={() => {
          onNote(noteSelectionRef.current ?? currentSelectionRange() ?? undefined);
          noteSelectionRef.current = null;
        }}
        className="toolbar-btn"
        aria-label="Add note"
      >
        <HugeiconsIcon icon={Comment01Icon} size={18} color="currentColor" strokeWidth={1.5} />
      </button>
    </div>,
    document.body,
  );
}

export default FloatingToolbar
