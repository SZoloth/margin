import { useEffect, useState, useCallback } from "react";
import type { Highlight, MarginNote } from "@/types/annotations";
import type { Editor } from "@tiptap/core";

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

    const highlightsWithNotes = highlights.filter((h) =>
      marginNotes.some((n) => n.highlight_id === h.id),
    );

    const newPositions: IndicatorPosition[] = [];

    for (const h of highlightsWithNotes) {
      const marks = editor.view.dom.querySelectorAll("mark[data-color]");
      for (const mark of marks) {
        if (mark.textContent === h.text_content) {
          const markRect = mark.getBoundingClientRect();
          const top = markRect.top - containerRect.top + scrollTop;
          const noteCount = marginNotes.filter((n) => n.highlight_id === h.id).length;
          newPositions.push({
            highlightId: h.id,
            top,
            noteCount,
            color: h.color,
          });
          break;
        }
      }
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
            const marks = editor?.view.dom.querySelectorAll("mark[data-color]");
            if (!marks) return;
            for (const mark of marks) {
              if (mark.textContent === highlights.find((h) => h.id === pos.highlightId)?.text_content) {
                onClickHighlight(pos.highlightId, mark.getBoundingClientRect());
                break;
              }
            }
          }}
          aria-label={`${pos.noteCount} note${pos.noteCount !== 1 ? "s" : ""}`}
          title={`${pos.noteCount} note${pos.noteCount !== 1 ? "s" : ""}`}
        >
          <span
            style={{
              display: "block",
              width: 6,
              height: 6,
              borderRadius: "50%",
              backgroundColor: `var(--color-highlight-${pos.color})`,
              opacity: 0.8,
            }}
          />
        </button>
      ))}
    </>
  );
}
