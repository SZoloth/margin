import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import type { HighlightColor } from "@/types/annotations";
import { ColorPicker } from "@/components/common/ColorPicker";

interface FloatingToolbarProps {
  editor: Editor | null;
  onHighlight: (color: HighlightColor) => void;
}

const HIGHLIGHT_COLORS: HighlightColor[] = [
  "yellow",
  "green",
  "blue",
  "pink",
  "orange",
];

export function FloatingToolbar({
  editor,
  onHighlight,
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

    const toolbarWidth = toolbarRef.current?.offsetWidth ?? 240;
    const toolbarHeight = toolbarRef.current?.offsetHeight ?? 40;

    // coordsAtPos returns viewport-relative coords; use fixed positioning directly
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
      // Small delay so clicks on the toolbar itself register before hiding
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
      className="fixed z-50 flex items-center gap-2 rounded-lg border px-3 py-2 shadow-md"
      style={{
        top: position.top,
        left: position.left,
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-page)",
      }}
      onMouseDown={(e) => {
        // Prevent toolbar clicks from stealing focus from editor
        e.preventDefault();
      }}
    >
      <ColorPicker
        colors={HIGHLIGHT_COLORS}
        activeColor={null}
        onSelect={onHighlight}
        size="sm"
      />
    </div>,
    document.body,
  );
}
