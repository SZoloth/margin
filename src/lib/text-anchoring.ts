import type { Node as PMNode } from "@tiptap/pm/model";

export interface TextAnchor {
  text: string;
  prefix: string; // ~30 chars before
  suffix: string; // ~30 chars after
  from: number; // original offset in the flattened doc text
  to: number; // original offset in the flattened doc text
}

export interface AnchorResult {
  from: number;
  to: number;
  confidence: "exact" | "fuzzy" | "orphaned";
}

/**
 * A document's text flattened with the same "\n" block separators that
 * `doc.textBetween(0, doc.content.size, "\n")` produces, plus the segments
 * needed to translate between flat offsets and ProseMirror positions.
 *
 * Highlight rows store ProseMirror positions in `from_pos`/`to_pos` but
 * prefix/suffix context and stored text are in flat-text space — both sides
 * of an anchor must use this map or context past the first block is corrupt.
 */
export interface DocTextMap {
  flat: string;
  /** Text-node segments in document order. */
  segments: Array<{ flatStart: number; pos: number; length: number }>;
}

/**
 * Flatten a ProseMirror doc exactly like `textBetween` with a block
 * separator: one separator is emitted when entering each textblock (and each
 * leaf block that contributes leaf text), except the first.
 */
export function buildDocTextMap(doc: PMNode, blockSeparator = "\n"): DocTextMap {
  let flat = "";
  let first = true;
  const segments: DocTextMap["segments"] = [];
  doc.nodesBetween(0, doc.content.size, (node, pos) => {
    const nodeText = node.isText
      ? (node.text ?? "")
      : node.isLeaf && node.type.spec.leafText
        ? (node.type.spec.leafText as (n: PMNode) => string)(node)
        : "";
    if (node.isBlock && ((node.isLeaf && nodeText) || node.isTextblock)) {
      if (first) first = false;
      else flat += blockSeparator;
    }
    if (node.isText && nodeText.length > 0) {
      segments.push({ flatStart: flat.length, pos, length: nodeText.length });
    }
    flat += nodeText;
    return true;
  });
  return { flat, segments };
}

/**
 * Map a ProseMirror position to an offset in `map.flat`. Positions that land
 * in a block boundary gap map to the following text segment; positions past
 * the end map to `flat.length`.
 */
export function docPosToFlat(map: DocTextMap, pos: number): number {
  for (const seg of map.segments) {
    if (pos < seg.pos) return seg.flatStart;
    if (pos <= seg.pos + seg.length) return seg.flatStart + (pos - seg.pos);
  }
  return map.flat.length;
}

/**
 * Map a flat-text offset back to a ProseMirror position. Offsets inside a
 * separator gap have no exact position: `prefer: "next"` (for range starts)
 * resolves to the following segment's start, `prefer: "prev"` (for range
 * ends) to the previous segment's end.
 */
export function flatToDocPos(
  map: DocTextMap,
  offset: number,
  prefer: "next" | "prev" = "next",
): number {
  const segs = map.segments;
  if (segs.length === 0) return 0;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]!;
    const segEnd = seg.flatStart + seg.length;
    if (offset < seg.flatStart) {
      return prefer === "next" ? seg.pos : segs[i - 1]!.pos + segs[i - 1]!.length;
    }
    if (offset <= segEnd) return seg.pos + (offset - seg.flatStart);
  }
  const last = segs[segs.length - 1]!;
  return last.pos + last.length;
}

/**
 * Extract anchoring context from the flattened document text for a range.
 * `from`/`to` are flat-text offsets (see {@link docPosToFlat}), not
 * ProseMirror positions.
 */
export function createAnchor(
  fullText: string,
  from: number,
  to: number
): TextAnchor {
  const text = fullText.slice(from, to);
  const prefixStart = Math.max(0, from - 30);
  const suffixEnd = Math.min(fullText.length, to + 30);
  return {
    text,
    prefix: fullText.slice(prefixStart, from),
    suffix: fullText.slice(to, suffixEnd),
    from,
    to,
  };
}

/**
 * Re-anchor a text anchor in potentially-changed document content.
 *
 * Strategy:
 * 1. Try exact position match first
 * 2. Search for text+context combination
 * 3. Search for text alone (disambiguate with prefix/suffix)
 * 4. Mark as orphaned if no match
 */
export function resolveAnchor(
  fullText: string,
  anchor: TextAnchor
): AnchorResult {
  // 1. Try exact position match
  const atOriginal = fullText.slice(
    anchor.from,
    anchor.from + anchor.text.length
  );
  if (atOriginal === anchor.text) {
    return {
      from: anchor.from,
      to: anchor.from + anchor.text.length,
      confidence: "exact",
    };
  }

  // 2. Search for text with context
  const contextPattern = anchor.prefix + anchor.text + anchor.suffix;
  const contextIndex = fullText.indexOf(contextPattern);
  if (contextIndex !== -1) {
    const newFrom = contextIndex + anchor.prefix.length;
    return {
      from: newFrom,
      to: newFrom + anchor.text.length,
      confidence: "exact",
    };
  }

  // 3. Search for just the text, score by context similarity
  const matches: Array<{ index: number; score: number }> = [];
  let searchStart = 0;
  while (true) {
    const idx = fullText.indexOf(anchor.text, searchStart);
    if (idx === -1) break;

    // Score based on how well prefix/suffix match
    let score = 0;
    const actualPrefix = fullText.slice(
      Math.max(0, idx - anchor.prefix.length),
      idx
    );
    const actualSuffix = fullText.slice(
      idx + anchor.text.length,
      idx + anchor.text.length + anchor.suffix.length
    );

    // Compare character by character from the boundary outward
    for (
      let i = 0;
      i < Math.min(actualPrefix.length, anchor.prefix.length);
      i++
    ) {
      const pi = anchor.prefix.length - 1 - i;
      const ai = actualPrefix.length - 1 - i;
      if (pi >= 0 && ai >= 0 && anchor.prefix[pi] === actualPrefix[ai]) {
        score++;
      }
    }
    for (
      let i = 0;
      i < Math.min(actualSuffix.length, anchor.suffix.length);
      i++
    ) {
      if (anchor.suffix[i] === actualSuffix[i]) {
        score++;
      }
    }

    matches.push({ index: idx, score });
    searchStart = idx + 1;
  }

  if (matches.length > 0) {
    // Pick the match with highest context score
    matches.sort((a, b) => b.score - a.score);
    const best = matches[0]!;
    return {
      from: best.index,
      to: best.index + anchor.text.length,
      confidence: "fuzzy",
    };
  }

  // 4. No match found — orphaned
  return { from: anchor.from, to: anchor.to, confidence: "orphaned" };
}
