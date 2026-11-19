// Vendored from Tells (github.com/SZoloth/tells), version 0.1.0, MIT.
// tells.js is copied unchanged below this header. tells.json is the upstream
// rules/tells.json with the per-rule and top-level "qa" fields removed, since
// those numbers come from a private eval corpus. LICENSE and NOTICE sit beside
// these files; NOTICE carries the declauding rules' MIT notice.
// To update: copy src/tells.js and rules/tells.json again, strip "qa", and
// keep this header.

// Tells: find phrases and sentence shapes that make prose read machine-made.
// One dependency-free module for the browser, Node and Margin.
//
//   import { compile, scan } from "./tells.js";
//   const engine = compile(rulesJson);          // rules/tells.json
//   const result = scan(engine, text);          // { matches, words, perHundredWords }
//
// A match is a candidate for the reader to judge. It is not proof that a model wrote the text.

const DEFAULT_TIERS = ["flag"];

/** Compile the rule file once. Rules that fail to compile in JavaScript are skipped and listed. */
export function compile(doc) {
  const compiled = [];
  const skipped = [];
  for (const rule of doc.rules) {
    try {
      const flags = Array.from(new Set((rule.flags || "gi").replace(/[^gimsuy]/g, "") + "g")).join("");
      compiled.push({ rule, regex: new RegExp(rule.pattern, flags) });
    } catch (error) {
      skipped.push({ id: rule.id, error: String(error.message || error) });
    }
  }
  return { compiled, skipped, version: doc.version };
}

/** Blank out text a writer is quoting (blockquotes, code), keeping offsets stable. */
export function maskQuoted(text) {
  const blank = (s) => s.replace(/[^\n]/g, " ");
  return text
    .replace(/```[\s\S]*?```/g, blank)
    .replace(/`[^`\n]+`/g, blank)
    .replace(/^[ \t]*>.*$/gm, blank);
}

export function countWords(text) {
  const m = text.match(/[\p{L}\p{N}'’-]+/gu);
  return m ? m.length : 0;
}

/**
 * Scan text. Options:
 *   tiers: which rule tiers to report (default ["flag"]; add "hint" for weaker rules)
 *   limit: maximum matches returned (default 500)
 *   overlap: keep every rule's match even where spans overlap (used by rule QA)
 */
export function scan(engine, text, { tiers = DEFAULT_TIERS, limit = 500, overlap = false } = {}) {
  const source = maskQuoted(text);
  const raw = [];
  for (const { rule, regex } of engine.compiled) {
    if (!tiers.includes(rule.tier || "flag")) continue;
    regex.lastIndex = 0;
    let m;
    let n = 0;
    while ((m = regex.exec(source)) !== null) {
      if (m[0].length === 0) {
        regex.lastIndex++;
        continue;
      }
      const lead = m[0].length - m[0].trimStart().length;
      const start = m.index + lead;
      const end = m.index + m[0].trimEnd().length;
      if (end > start) raw.push({ start, end, rule });
      if (++n > limit) break;
    }
  }
  // One mark per span: when rules overlap, keep the longer match, then the earlier rule.
  raw.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const matches = [];
  let lastEnd = -1;
  for (const hit of raw) {
    if (!overlap && hit.start < lastEnd) continue;
    matches.push({
      start: hit.start,
      end: hit.end,
      text: text.slice(hit.start, hit.end),
      id: hit.rule.id,
      category: hit.rule.category,
      note: hit.rule.note,
      fix: hit.rule.fix || null,
      tier: hit.rule.tier || "flag",
    });
    lastEnd = Math.max(lastEnd, hit.end);
    if (matches.length >= limit) break;
  }
  const words = countWords(text);
  return {
    matches,
    words,
    perHundredWords: words ? Math.round((matches.length / words) * 1000) / 10 : 0,
  };
}
