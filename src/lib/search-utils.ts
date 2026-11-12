/** FTS5 boolean operators to strip from user queries. */
const FTS5_OPERATORS = new Set(["AND", "OR", "NOT", "NEAR"]);

/**
 * Sanitize a user query for FTS5 prefix matching.
 * - Strips special FTS5 operators and characters
 * - Appends `*` to each term for prefix matching
 * - Returns empty string for empty/whitespace input
 */
export function sanitizeFtsQuery(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return "";

  // Remove quotes, parens, colons, carets
  const cleaned = trimmed.replace(/[\"'(){}:^]/g, "");

  return cleaned
    .split(/\s+/)
    .filter((word) => !FTS5_OPERATORS.has(word.toUpperCase()))
    .filter((word) => /[a-zA-Z0-9]/.test(word))
    .map((word) => {
      // Keep only alphanumeric, hyphens, underscores
      const safe = word.replace(/[^a-zA-Z0-9\-_]/g, "");
      return safe ? `"${safe}"*` : "";
    })
    .filter(Boolean)
    .join(" ");
}
