import { useEffect, useState, useCallback } from "react";
import type { Highlight, MarginNote } from "@/types/annotations";
import type { Editor } from "@tiptap/core";

const DOT_COLORS: Record<string, string> = {
  yellow: "#c9b463",
  blue: "#8da8c4",
  green: "#8bb07a",
  pink: "#c48da8",
  orange: "#c4a07a",
};

interface MarginIndicatorsProps {
  editor: Editor | null;
  highlights: Highlight[];
  marginNotes: MarginNote[];
  onClickHighlight: (highlightId: string, rect: DOMRect) => void;
}

interface IndicatorPosition {
  highlightId: string;
  top: number;
  noteCount: number;
  color: string;
}

export function MarginIndicators({
  editor,
  highlights,
  marginNotes,
  onClickHighlight,
}: MarginIndicatorsProps) {
  const [positions, setPositions] = useState<IndicatorPosition[]>([]);

  const updatePositions = useCallback(() => {
    if (!editor) {
      setPositions([]);
      return;
    }

    const scrollContainer = document.querySelector("[data-scroll-container]");
    if (!scrollContainer) return;
    const containerRect = scrollContainer.getBoundingClientRect();
    const scrollTop = scrollContainer.scrollTop;

    // Pre-build note count map to avoid O(H×N) on every scroll frame
    const noteCountByHighlight = new Map<string, number>();
    for (const n of marginNotes) {
      noteCountByHighlight.set(n.highlight_id, (noteCountByHighlight.get(n.highlight_id) ?? 0) + 1);
    }

    const highlightsWithNotes = highlights.filter((h) => noteCountByHighlight.has(h.id));

    const newPositions: IndicatorPosition[] = [];

    for (const h of highlightsWithNotes) {
      // Prefer ID-based lookup; fall back to text matching for orphan marks
      const mark =
        editor.view.dom.querySelector(`mark[data-highlight-id="${h.id}"]`) ??
        Array.from(editor.view.dom.querySelectorAll("mark[data-color]")).find(
          (m) => m.textContent === h.text_content,
        );
      if (!mark) continue;

      const markRect = mark.getBoundingClientRect();
      const top = markRect.top - containerRect.top + scrollTop;
      newPositions.push({
        highlightId: h.id,
        top,
        noteCount: noteCountByHighlight.get(h.id) ?? 0,
        color: h.color,
      });
    }

    setPositions(newPositions);
  }, [editor, highlights, marginNotes]);

  useEffect(() => {
    updatePositions();

    const scrollContainer = document.querySelector("[data-scroll-container]");
    if (scrollContainer) {
      scrollContainer.addEventListener("scroll", updatePositions);
    }

    if (editor) {
      editor.on("update", updatePositions);
    }

    return () => {
      if (scrollContainer) {
        scrollContainer.removeEventListener("scroll", updatePositions);
      }
      if (editor) {
        editor.off("update", updatePositions);
      }
    };
  }, [editor, updatePositions]);

  if (positions.length === 0) return null;

  return (
    <>
      {positions.map((pos) => (
        <button
          key={pos.highlightId}
          type="button"
          className="margin-indicator-dot"
          style={{ top: pos.top }}
          onClick={() => {
            if (!editor) return;
            // Prefer ID-based lookup; fall back to text matching for orphan marks
            const mark =
              editor.view.dom.querySelector(`mark[data-highlight-id="${pos.highlightId}"]`) ??
              Array.from(editor.view.dom.querySelectorAll("mark[data-color]")).find(
                (m) => m.textContent === highlights.find((h) => h.id === pos.highlightId)?.text_content,
              );
            if (mark) {
              onClickHighlight(pos.highlightId, mark.getBoundingClientRect());
            }
          }}
          aria-label={`${pos.noteCount} note${pos.noteCount !== 1 ? "s" : ""}`}
          title={`${pos.noteCount} note${pos.noteCount !== 1 ? "s" : ""}`}
        >
          <span
            style={{
              display: "block",
              width: 10,
              height: 10,
              borderRadius: "50%",
              backgroundColor: DOT_COLORS[pos.color] ?? `var(--color-highlight-${pos.color})`,
              opacity: 1.0,
            }}
          />
        </button>
      ))}
    </>
  );
}
