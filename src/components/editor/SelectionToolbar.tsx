import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";

import { allowedMarkRanges, rangeFullyMarked } from "@/lib/highlight-ranges";
import { canNeverWrite as phraseFitsRule } from "@/lib/sample-document";

interface SelectionToolbarProps {
  editor: Editor | null;
  /** A file is open, so a phrase can become a Hard rule. */
  canNeverWrite: boolean;
  /** Something else owns the selection (the note card is open). */
  suppressed?: boolean;
  onHighlight: () => void;
  /** Highlight the selection and open its note card. */
  onNote: () => void;
  /** The selection is inside a highlight: open that highlight's note card. */
  onOpenHighlight: () => void;
  onRemoveHighlight: () => void;
  onNeverWrite: () => void;
}

type Mode = "new" | "existing" | "copy-only";

interface Shown {
  mode: Mode;
  text: string;
  /** Viewport coords of the selection's first and last line. */
  top: number;
  bottom: number;
  centerX: number;
}

// Selecting only selects (ADR-008). A toolbar appears once the selection
// settles: on mouse-up, or this long after a keyboard selection stops.
const SETTLE_MS = 250;
const GAP = 8;

export function SelectionToolbar({
  editor,
  canNeverWrite,
  suppressed = false,
  onHighlight,
  onNote,
  onOpenHighlight,
  onRemoveHighlight,
  onNeverWrite,
}: SelectionToolbarProps) {
  const [shown, setShown] = useState<Shown | null>(null);
  const [copied, setCopied] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef(0);
  const pointerDownRef = useRef(false);
  const copiedTimerRef = useRef(0);

  const hide = useCallback(() => {
    window.clearTimeout(timerRef.current);
    setShown(null);
    setCopied(false);
  }, []);

  const measure = useCallback((): Shown | null => {
    if (!editor || editor.isDestroyed) return null;
    const { state, view } = editor;
    const { from, to, empty } = state.selection;
    if (empty || !editor.isFocused) return null;
    const text = state.doc.textBetween(from, to, "\n");
    if (!text.trim()) return null;
    const markType = state.schema.marks.highlight;
    let mode: Mode = "copy-only";
    // Fully-highlighted first: a highlight excludes another on the same text,
    // so allowedMarkRanges reports nothing there.
    if (markType && rangeFullyMarked(state.doc, markType, from, to)) mode = "existing";
    else if (markType && allowedMarkRanges(state.doc, markType, from, to).length > 0) mode = "new";
    try {
      const a = view.coordsAtPos(from);
      const b = view.coordsAtPos(to);
      // One line: center over it. Several: center over the first line's run.
      const centerX = a.top === b.top ? (a.left + b.right) / 2 : a.left + 80;
      return { mode, text, top: a.top, bottom: b.bottom, centerX };
    } catch {
      return null;
    }
  }, [editor]);

  const settle = useCallback(() => {
    const next = measure();
    if (next) setShown(next);
    else hide();
  }, [measure, hide]);

  useEffect(() => {
    if (!editor) return;
    const onSelection = () => {
      window.clearTimeout(timerRef.current);
      setCopied(false);
      if (editor.state.selection.empty) {
        setShown(null);
        return;
      }
      if (pointerDownRef.current) return; // mouse-up shows it
      // A selection that changes while shown (shift+arrow) re-settles.
      setShown(null);
      timerRef.current = window.setTimeout(settle, SETTLE_MS);
    };
    const onBlur = () => {
      // Pressing a toolbar button keeps focus (mousedown is prevented), so
      // blur means the reader went elsewhere.
      hide();
    };
    const onDown = (e: MouseEvent) => {
      if (barRef.current?.contains(e.target as Node)) return;
      pointerDownRef.current = true;
      hide();
    };
    const onUp = () => {
      if (!pointerDownRef.current) return;
      pointerDownRef.current = false;
      window.clearTimeout(timerRef.current);
      // Let the click finish placing the selection first.
      timerRef.current = window.setTimeout(settle, 0);
    };
    editor.on("selectionUpdate", onSelection);
    editor.on("blur", onBlur);
    const dom = editor.view.dom as HTMLElement;
    dom.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.clearTimeout(timerRef.current);
      editor.off("selectionUpdate", onSelection);
      editor.off("blur", onBlur);
      dom.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
    };
  }, [editor, settle, hide]);

  // ⌘⌥M: note on the selection (the Google Docs comment key). Esc hides.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && shown) {
        hide();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.altKey && !e.shiftKey && e.code === "KeyM") {
        const now = measure();
        if (!now || now.mode === "copy-only") return;
        e.preventDefault();
        hide();
        if (now.mode === "existing") onOpenHighlight();
        else onNote();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, hide, measure, onNote, onOpenHighlight]);

  // Follow the text when the reader scrolls or the window resizes.
  useEffect(() => {
    if (!shown) return;
    const follow = () => {
      const next = measure();
      if (next) setShown((s) => (s ? { ...next, mode: s.mode, text: s.text } : s));
      else hide();
    };
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => {
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
    };
  }, [shown, measure, hide]);

  useEffect(() => () => window.clearTimeout(copiedTimerRef.current), []);

  // Above the first line; below the last when there's no room above.
  useLayoutEffect(() => {
    if (!shown || !barRef.current) {
      setPos(null);
      return;
    }
    const { width, height } = barRef.current.getBoundingClientRect();
    const vw = window.innerWidth || 1024;
    const left = Math.max(GAP, Math.min(shown.centerX - width / 2, vw - width - GAP));
    const below = shown.top - height - GAP < 48;
    const top = below ? shown.bottom + GAP : shown.top - height - GAP;
    setPos({ left, top, below });
  }, [shown, copied]);

  if (!shown || suppressed) return null;

  const run = (fn: () => void) => () => {
    hide();
    fn();
  };

  const copy = () => {
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    if (!ok) void navigator.clipboard?.writeText(shown.text).catch(() => {});
    setCopied(true);
    window.clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = window.setTimeout(hide, 700);
  };

  const showNever = shown.mode === "new" && canNeverWrite && phraseFitsRule(shown.text);

  return createPortal(
    <div
      ref={barRef}
      role="toolbar"
      aria-label="Selection"
      className="selection-toolbar"
      data-below={pos?.below ? "" : undefined}
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        visibility: pos ? "visible" : "hidden",
      }}
      // Keep the editor's focus and selection, so ⌘C and typing still work.
      onMouseDown={(e) => e.preventDefault()}
    >
      {shown.mode === "new" && (
        <>
          <button type="button" className="selection-toolbar-btn" onClick={run(onHighlight)} title="Highlight (⌘⇧H)">
            <span className="selection-toolbar-dot" aria-hidden="true" />
            Highlight
          </button>
          <button type="button" className="selection-toolbar-btn" onClick={run(onNote)} title="Note (⌘⌥M)">
            Note
          </button>
          {showNever && (
            <button
              type="button"
              className="selection-toolbar-btn"
              onClick={run(onNeverWrite)}
              title="Make this phrase a Hard rule: Margin underlines it everywhere, and the Writing guard stops Claude writing it"
            >
              <span className="selection-toolbar-never" aria-hidden="true" />
              Never write this
            </button>
          )}
        </>
      )}
      {shown.mode === "existing" && (
        <>
          <button type="button" className="selection-toolbar-btn" onClick={run(onOpenHighlight)} title="Note (⌘⌥M)">
            Note
          </button>
          <button type="button" className="selection-toolbar-btn" onClick={run(onRemoveHighlight)} title="Remove highlight (⌘⇧H)">
            Remove highlight
          </button>
        </>
      )}
      {shown.mode !== "copy-only" && <span className="selection-toolbar-sep" aria-hidden="true" />}
      <button type="button" className="selection-toolbar-btn" onClick={copy} title="Copy (⌘C)">
        {copied ? "Copied" : "Copy"}
      </button>
    </div>,
    document.body,
  );
}
