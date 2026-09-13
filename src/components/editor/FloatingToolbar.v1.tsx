import { useEffect, useRef } from "react";
import type { Editor } from "@tiptap/core";

import { allowedMarkRanges } from "@/lib/highlight-ranges";

interface FloatingToolbarProps {
  editor: Editor | null;
  onHighlight: (color?: string) => void;
}

// A settled text selection IS the highlight gesture (SAM-1144): applying the
// mark opens the note thread immediately, so there is no toolbar and no extra
// click between intent and note. This component only watches the selection —
// recoloring happens inside the thread's swatch row.
const SETTLE_MS = 250;

export function FloatingToolbar({ editor, onHighlight }: FloatingToolbarProps) {
  const timerRef = useRef(0);
  // Tracks the range last fired on — a new selection (not just a collapse)
  // re-arms the watcher.
  const firedRangeRef = useRef<{ from: number; to: number } | null>(null);
  const onHighlightRef = useRef(onHighlight);
  onHighlightRef.current = onHighlight;

  useEffect(() => {
    if (!editor) return;

    const clear = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = 0;
      }
    };

    const handleSelectionUpdate = () => {
      const { from, to, empty } = editor.state.selection;
      if (empty) {
        firedRangeRef.current = null;
        clear();
        return;
      }
      const last = firedRangeRef.current;
      if (last && last.from === from && last.to === to) return;

      // Debounce so a drag-select fires once it settles, not mid-drag.
      clear();
      timerRef.current = window.setTimeout(() => {
        const { state } = editor;
        const sel = state.selection;
        if (sel.empty || !editor.isFocused) return;
        const lastFired = firedRangeRef.current;
        if (lastFired && lastFired.from === sel.from && lastFired.to === sel.to) return;

        const markType = state.schema.marks.highlight;
        if (!markType) return;
        // Fully inside an existing highlight → that mark's click-to-open path
        // owns the gesture; firing here would stack a duplicate row.
        if (state.doc.rangeHasMark(sel.from, sel.to, markType)) return;
        // Silent skip where marks aren't allowed (code) — the toast on the
        // explicit path is for gestures the user actually initiated.
        if (allowedMarkRanges(state.doc, markType, sel.from, sel.to).length === 0) return;

        firedRangeRef.current = { from: sel.from, to: sel.to };
        onHighlightRef.current();
      }, SETTLE_MS);
    };

    editor.on("selectionUpdate", handleSelectionUpdate);
    return () => {
      clear();
      editor.off("selectionUpdate", handleSelectionUpdate);
    };
  }, [editor]);

  return null;
}

export default FloatingToolbar
