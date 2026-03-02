import { DiffMatchPatch } from "diff-match-patch-ts";

export interface DiffChange {
  id: string;
  type: "insertion" | "deletion" | "modification";
  oldText: string;
  newText: string;
  status: "pending" | "accepted" | "rejected";
}

const EQUAL = 0;
const INSERT = 1;
const DELETE = -1;

/**
 * Group raw diff operations into semantic DiffChange objects.
 * A deletion followed immediately by an insertion = "modification".
 * Standalone deletion = "deletion", standalone insertion = "insertion".
 * Equal segments are skipped.
 */
export function computeDiffChanges(
  oldContent: string,
  newContent: string
): DiffChange[] {
  const dmp = new DiffMatchPatch();
  const diffs = dmp.diff_main(oldContent, newContent);
  dmp.diff_cleanupSemantic(diffs);

  const changes: DiffChange[] = [];
  let i = 0;
  let changeIndex = 0;

  while (i < diffs.length) {
    const diff = diffs[i]!;
    const op = diff[0];
    const text = diff[1];

    if (op === EQUAL) {
      i++;
      continue;
    }

    if (op === DELETE) {
      const next = diffs[i + 1];
      // Check if next op is an insertion (= modification)
      if (next && next[0] === INSERT) {
        changes.push({
          id: makeDiffChangeId(oldContent, newContent, changeIndex++),
          type: "modification",
          oldText: text,
          newText: next[1],
          status: "pending",
        });
        i += 2;
      } else {
        changes.push({
          id: makeDiffChangeId(oldContent, newContent, changeIndex++),
          type: "deletion",
          oldText: text,
          newText: "",
          status: "pending",
        });
        i++;
      }
    } else if (op === INSERT) {
      changes.push({
        id: makeDiffChangeId(oldContent, newContent, changeIndex++),
        type: "insertion",
        oldText: "",
        newText: text,
        status: "pending",
      });
      i++;
    }
  }

  return changes;
}

/**
 * Build a "tracked changes" representation of the diff by emitting a combined
 * string that includes:
 * - equal text as-is
 * - deletions wrapped in <del data-change-id="...">...</del>
 * - insertions wrapped in <ins data-change-id="...">...</ins>
 * - modifications as <del ...>old</del><ins ...>new</ins> sharing the same change ID
 *
 * Intended for rendering in the editor when in diff review mode.
 */
export function buildDiffReviewMarkup(
  oldContent: string,
  newContent: string,
): string {
  const dmp = new DiffMatchPatch();
  const diffs = dmp.diff_main(oldContent, newContent);
  dmp.diff_cleanupSemantic(diffs);

  const parts: string[] = [];
  let i = 0;
  let changeIndex = 0;

  while (i < diffs.length) {
    const diff = diffs[i]!;
    const op = diff[0];
    const text = diff[1];

    if (op === EQUAL) {
      parts.push(text);
      i++;
      continue;
    }

    const changeId = makeDiffChangeId(oldContent, newContent, changeIndex++);

    if (op === DELETE) {
      const next = diffs[i + 1];
      if (next && next[0] === INSERT) {
        parts.push(wrapDiffTag("del", changeId, text));
        parts.push(wrapDiffTag("ins", changeId, next[1]));
        i += 2;
      } else {
        parts.push(wrapDiffTag("del", changeId, text));
        i++;
      }
    } else if (op === INSERT) {
      parts.push(wrapDiffTag("ins", changeId, text));
      i++;
    }
  }

  return parts.join("");
}

/**
 * Returns percentage of content that changed (0 = identical, 100 = completely different).
 */
export function changePercentage(
  oldContent: string,
  newContent: string
): number {
  if (oldContent === newContent) return 0;

  const dmp = new DiffMatchPatch();
  const diffs = dmp.diff_main(oldContent, newContent);
  dmp.diff_cleanupSemantic(diffs);

  let changedChars = 0;
  for (const diff of diffs) {
    if (diff[0] !== EQUAL) {
      changedChars += diff[1].length;
    }
  }

  const maxLen = Math.max(oldContent.length, newContent.length, 1);
  return Math.min((changedChars / maxLen) * 100, 100);
}

/**
 * Reconstruct content based on per-change accept/reject decisions.
 * For each change: if accepted (or pending), use newText; if rejected, use oldText.
 *
 * Rebuilds from the raw diff, matching each change group to its DiffChange
 * by index order.
 */
export function applyDiffDecisions(
  changes: DiffChange[],
  oldContent: string,
  newContent: string
): string {
  const dmp = new DiffMatchPatch();
  const diffs = dmp.diff_main(oldContent, newContent);
  dmp.diff_cleanupSemantic(diffs);

  const parts: string[] = [];
  let i = 0;
  let changeIndex = 0;

  while (i < diffs.length) {
    const diff = diffs[i]!;
    const op = diff[0];
    const text = diff[1];

    if (op === EQUAL) {
      parts.push(text);
      i++;
      continue;
    }

    const change = changes[changeIndex];
    const isRejected = change?.status === "rejected";

    if (op === DELETE) {
      const next = diffs[i + 1];
      if (next && next[0] === INSERT) {
        // Modification: pick old or new text
        parts.push(isRejected ? text : next[1]);
        i += 2;
      } else {
        // Deletion: include old text if rejected, omit if accepted
        if (isRejected) {
          parts.push(text);
        }
        i++;
      }
      changeIndex++;
    } else if (op === INSERT) {
      // Insertion: include new text if accepted, omit if rejected
      if (!isRejected) {
        parts.push(text);
      }
      i++;
      changeIndex++;
    }
  }

  return parts.join("");
}

/**
 * Deterministic ID based on content hash and index.
 * This ensures the same inputs always produce the same IDs across:
 * - computeDiffChanges
 * - buildDiffReviewMarkup
 * - applyDiffDecisions (which matches by index order)
 */
export function makeDiffChangeId(
  oldContent: string,
  newContent: string,
  index: number
): string {
  // Use content length + head + tail to reduce collisions across documents
  const hash = simpleHash(
    `${oldContent.length}:${oldContent.slice(0, 100)}:${oldContent.slice(-50)}|${newContent.length}:${newContent.slice(0, 100)}:${newContent.slice(-50)}|${index}`
  );
  return `diff-${hash}-${index}`;
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(36);
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function wrapDiffTag(
  tag: "ins" | "del",
  changeId: string,
  text: string,
): string {
  // ProseMirror marks can't span block boundaries. Split at paragraph
  // boundaries so markup parses cleanly for multi-paragraph diffs.
  return text
    .split("\n\n")
    .map((chunk) =>
      chunk === "" ? "" : `<${tag} data-change-id="${changeId}">${escapeHtml(chunk)}</${tag}>`,
    )
    .join("\n\n");
}
