import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";

import { HIGHLIGHT_COLORS } from "@/lib/highlight-colors";

interface FloatingToolbarProps {
  editor: Editor | null;
  onHighlight: (color?: string) => void;
  defaultColor?: string;
}

export function FloatingToolbar({
  editor,
  onHighlight,
  defaultColor = "yellow",
}: FloatingToolbarProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [isFlipped, setIsFlipped] = useState(false);
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

  // Reposition on scroll and resize. Scroll events don't bubble, so listen in
  // the capture phase to catch scrolling inside the reader's scroll container.
  // rAF-throttled so rapid scroll stays cheap.
  useEffect(() => {
    if (!editor) return;
    let rafId = 0;
    const schedule = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        updatePosition();
      });
    };
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule, { capture: true });
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(rafId);
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
      {/* Color picker circles — default color first. This toolbar's only job
          is choosing the highlight color; the note lives in the thread. */}
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

    </div>,
    document.body,
  );
}

export default FloatingToolbar
