import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import type { Highlight, MarginNote } from "@/types/annotations";
import type { Editor } from "@tiptap/core";

const DOT_COLORS: Record<string, string> = {
  yellow: "#c9b463",
  blue: "#8da8c4",
  green: "#8bb07a",
  pink: "#c48da8",
  orange: "#c4a07a",
};

interface MinimapRailProps {
  editor: Editor | null;
  highlights: Highlight[];
  marginNotes: MarginNote[];
  onClickHighlight: (highlightId: string, rect: DOMRect) => void;
}

interface Tick {
  highlightId: string;
  /** 0–1 document-relative position of the mark's top edge. */
  pos: number;
  color: string;
}

/**
 * Sparse minimap: a thin fixed rail at the viewport's right edge showing
 * where annotations sit in the whole document — position, not just
 * presence. A soft thumb marks the current viewport. Clicking a tick
 * jumps to the annotation and opens its thread.
 *
 * Rendered only when the document actually scrolls — without overflow the
 * rail carries no information the aligned dots don't already.
 */
export function MinimapRail({
  editor,
  highlights,
  marginNotes,
  onClickHighlight,
}: MinimapRailProps) {
  const [ticks, setTicks] = useState<Tick[]>([]);
  const [thumb, setThumb] = useState<{ top: number; height: number } | null>(null);
  const [scrollable, setScrollable] = useState(false);
  const rafRef = useRef(0);

  const update = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const scroll = document.querySelector("[data-scroll-container]");
      if (!editor || !scroll) {
        setTicks([]);
        setThumb(null);
        setScrollable(false);
        return;
      }
      const docH = scroll.scrollHeight;
      const viewH = scroll.clientHeight;
      const scrollTop = scroll.scrollTop;
      const isScrollable = docH > viewH + 40;
      setScrollable(isScrollable);
      if (!isScrollable) {
        setTicks([]);
        setThumb(null);
        return;
      }

      const containerRect = scroll.getBoundingClientRect();
      const hasNote = new Set(marginNotes.map((n) => n.highlight_id));
      const next: Tick[] = [];
      for (const h of highlights) {
        if (!hasNote.has(h.id)) continue;
        const mark =
          editor.view.dom.querySelector(`mark[data-highlight-id="${h.id}"]`) ??
          Array.from(editor.view.dom.querySelectorAll("mark[data-color]")).find(
            (m) => m.textContent === h.text_content,
          );
        if (!mark) continue;
        const markRect = mark.getBoundingClientRect();
        const docTop = markRect.top - containerRect.top + scrollTop;
        next.push({ highlightId: h.id, pos: Math.min(1, Math.max(0, docTop / docH)), color: h.color });
      }
      setTicks(next);
      setThumb({ top: scrollTop / docH, height: viewH / docH });
    });
  }, [editor, highlights, marginNotes]);

  useEffect(() => {
    update();
    const scroll = document.querySelector("[data-scroll-container]");
    scroll?.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    editor?.on("update", update);
    return () => {
      scroll?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      editor?.off("update", update);
      cancelAnimationFrame(rafRef.current);
    };
  }, [editor, update]);

  if (!scrollable || ticks.length === 0) return null;

  return createPortal(
    <div className="minimap-rail" aria-hidden="false" role="navigation" aria-label="Annotations map">
      {thumb && (
        <div
          className="minimap-thumb"
          style={{ top: `${thumb.top * 100}%`, height: `${thumb.height * 100}%` }}
        />
      )}
      {ticks.map((t) => (
        <button
          key={t.highlightId}
          type="button"
          className="minimap-tick"
          style={{
            top: `${t.pos * 100}%`,
            backgroundColor: DOT_COLORS[t.color] ?? `var(--color-highlight-${t.color})`,
          }}
          onClick={() => {
            if (!editor) return;
            const mark =
              editor.view.dom.querySelector(`mark[data-highlight-id="${t.highlightId}"]`) ??
              Array.from(editor.view.dom.querySelectorAll("mark[data-color]")).find(
                (m) =>
                  m.textContent ===
                  highlights.find((h) => h.id === t.highlightId)?.text_content,
              );
            if (!mark) return;
            // The mark may be far off-screen — scroll to it first so the
            // thread anchors to a visible passage.
            mark.scrollIntoView({ block: "center", behavior: "instant" });
            requestAnimationFrame(() => {
              onClickHighlight(t.highlightId, mark.getBoundingClientRect());
            });
          }}
          aria-label="Jump to annotation"
          title="Jump to annotation"
        />
      ))}
    </div>,
    document.body,
  );
}
