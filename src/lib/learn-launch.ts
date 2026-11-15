/**
 * Decide what a Learn session is typing, and where that text sits in the
 * flattened document so Escape can put the reader back on the same spot.
 */

import { hashText, isLearnable } from "@/lib/learn-mode";

export interface LearnLaunch {
  title: string;
  /** Slice of the flattened document. Offsets below are into this string. */
  text: string;
  flatFrom: number;
  /** `"document"` for the whole work, otherwise a stable key for this selection. */
  passageKey: string;
  /**
   * When the slice is the live document text, the caret maps back through
   * `flatFrom`. A drifted highlight falls back to its stored words and
   * returns to `flatFrom` itself.
   */
  mapCaret: boolean;
}

function titleOf(docTitle: string | null | undefined, heading: string | null): string {
  return docTitle?.trim() || heading?.trim() || "Untitled";
}

/**
 * The whole document. A leading heading becomes the header instead of
 * something you have to retype, matching the way a book shows its title.
 */
export function wholeDocumentLaunch(
  flat: string,
  headingText: string | null,
  docTitle: string | null | undefined,
): LearnLaunch | null {
  const heading = headingText?.trim() ? headingText : null;
  if (heading && flat.startsWith(heading)) {
    let from = heading.length;
    if (flat[from] === "\n") from += 1;
    const rest = flat.slice(from);
    if (isLearnable(rest)) {
      return {
        title: heading.trim(),
        text: rest,
        flatFrom: from,
        passageKey: "document",
        mapCaret: true,
      };
    }
  }
  if (!isLearnable(flat)) return null;
  return {
    title: titleOf(docTitle, heading),
    text: flat,
    flatFrom: 0,
    passageKey: "document",
    mapCaret: true,
  };
}

/** A selection or highlight. The header stays the work's title. */
export function rangeLaunch(
  flat: string,
  from: number,
  to: number,
  title: string,
): LearnLaunch | null {
  const start = Math.max(0, Math.min(from, to, flat.length));
  const end = Math.max(0, Math.min(Math.max(from, to), flat.length));
  const text = flat.slice(start, end);
  if (!isLearnable(text)) return null;
  return {
    title: title.trim() || "Untitled",
    text,
    flatFrom: start,
    passageKey: `passage:${hashText(text)}`,
    mapCaret: true,
  };
}
