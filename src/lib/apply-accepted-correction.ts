import type { Editor } from "@tiptap/core";

interface TextSegment {
  from: number;
  text: string;
}

/**
 * Text nodes carrying the highlight, grouped into runs that sit next to each
 * other in the document. Unmarked text, an inline node or a block boundary
 * between two fragments starts a new run, so a match can never reach across
 * content that isn't part of the highlight.
 */
function contiguousRuns(segments: TextSegment[]): TextSegment[][] {
  const runs: TextSegment[][] = [];
  for (const segment of segments) {
    const run = runs[runs.length - 1];
    const last = run?.[run.length - 1];
    if (run && last && last.from + last.text.length === segment.from) {
      run.push(segment);
    } else {
      runs.push([segment]);
    }
  }
  return runs;
}

function findReplacementRange(
  runs: TextSegment[][],
  matchText: string,
): { from: number; to: number } | null {
  for (const run of runs) {
    const start = run[0];
    if (!start) continue;
    const index = run.map((segment) => segment.text).join("").indexOf(matchText);
    if (index === -1) continue;
    const from = start.from + index;
    return { from, to: from + matchText.length };
  }
  return null;
}

export function applyAcceptedCorrection(
  editor: Editor,
  highlightId: string,
  matchText: string,
  suggestedEdit: string,
): boolean {
  if (!matchText) return false;
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

  const range = findReplacementRange(contiguousRuns(targetSegments), matchText);
  if (!range) return false;
  if (editor.state.doc.textBetween(range.from, range.to, "\n", "\n") !== matchText) {
    return false;
  }

  editor.view.dispatch(
    editor.state.tr.insertText(suggestedEdit, range.from, range.to),
  );
  return true;
}
