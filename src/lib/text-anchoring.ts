export interface TextAnchor {
  text: string;
  prefix: string; // ~30 chars before
  suffix: string; // ~30 chars after
  from: number; // original TipTap position
  to: number; // original TipTap position
}

export interface AnchorResult {
  from: number;
  to: number;
  confidence: "exact" | "fuzzy" | "orphaned";
}

/**
 * Extract anchoring context from the current document for a selection.
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
