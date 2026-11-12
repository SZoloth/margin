import type { Editor } from "@tiptap/core";

interface TextSegment {
  from: number;
  text: string;
}

function findReplacementRange(
  segments: TextSegment[],
  matchText: string,
): { from: number; to: number } | null {
  const combinedText = segments.map((segment) => segment.text).join("");
  const matchStart = combinedText.indexOf(matchText);
  if (matchStart === -1) return null;

  const matchEnd = matchStart + matchText.length;
  let consumed = 0;
  let from: number | null = null;
  let to: number | null = null;

  for (const segment of segments) {
    const segmentStart = consumed;
    const segmentEnd = consumed + segment.text.length;

    if (from == null && matchStart < segmentEnd) {
      from = segment.from + (matchStart - segmentStart);
    }

    if (matchEnd <= segmentEnd) {
      to = segment.from + (matchEnd - segmentStart);
      break;
    }

    consumed = segmentEnd;
  }

  if (from == null || to == null) return null;
  return { from, to };
}

export function applyAcceptedCorrection(
  editor: Editor,
  highlightId: string,
  matchText: string,
  suggestedEdit: string,
): boolean {
  const targetSegments: TextSegment[] = [];

  editor.state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;

    const hasHighlight = node.marks.some(
      (mark) =>
        mark.type.name === "highlight" && mark.attrs.highlightId === highlightId,
    );

    if (!hasHighlight) return;

    targetSegments.push({
      from: pos,
      text: node.text,
    });
  });

  if (targetSegments.length === 0) return false;

  const range = findReplacementRange(targetSegments, matchText);
  if (!range) return false;

  editor.view.dispatch(
    editor.state.tr.insertText(suggestedEdit, range.from, range.to),
  );
  return true;
}
