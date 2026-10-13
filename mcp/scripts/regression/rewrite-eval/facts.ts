/**
 * F1: deterministic fact-preservation check.
 *
 * Extracts numbers, dates, quotes, URLs and non-sentence-initial capitalized
 * names from a draft and an output, then reports what was dropped or added.
 * No LLM involved. Limits are deliberate and documented: number words ("three")
 * are not extracted, units are ignored (2.4 s vs 2.4 sec is not a failure), and
 * names that start a sentence in the draft are skipped because capitalization
 * there carries no information.
 */

export interface Facts {
  numbers: string[];
  dates: string[];
  quotes: string[];
  urls: string[];
  names: string[];
}

export interface FactComparison {
  dropped: string[];
  added: string[];
  /** share of draft facts still present; 1 when the draft has none */
  recall: number;
  /** any drop or any addition */
  hardFail: boolean;
}

const MONTHS =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

const DATE_PATTERNS: RegExp[] = [
  /\b\d{4}-\d{2}-\d{2}\b/g,
  /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g,
  new RegExp(`\\b(?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?\\b`, "gi"),
  new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTHS})\\.?(?:,?\\s+\\d{4})?\\b`, "gi"),
  new RegExp(`\\b(?:${MONTHS})\\.?\\s+\\d{4}\\b`, "gi"),
  /\bQ[1-4](?:\s+\d{4})?\b/g,
  /\bFY\d{2,4}\b/gi,
];

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s)>\]"]+|\b[\w.+-]+@[\w-]+\.[\w.-]+\b/gi;
const QUOTE_RE = /"([^"\n]{3,})"|“([^”\n]{3,})”/g;
const NUMBER_RE = /(\$|€|£)?(\d[\d,]*(?:\.\d+)?)(\s?%)?/g;

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function uniq(xs: string[]): string[] {
  return [...new Set(xs)];
}

function maskRanges(text: string, ranges: Array<[number, number]>): string {
  const chars = text.split("");
  for (const [a, b] of ranges) for (let i = a; i < b && i < chars.length; i++) chars[i] = " ";
  return chars.join("");
}

function stripTrailingPunct(s: string): string {
  return s.replace(/[.,;:!?)\]]+$/, "");
}

export function extractFacts(text: string): Facts {
  const urls: string[] = [];
  const urlRanges: Array<[number, number]> = [];
  for (const m of text.matchAll(URL_RE)) {
    urls.push(norm(stripTrailingPunct(m[0])));
    urlRanges.push([m.index!, m.index! + m[0].length]);
  }
  const noUrls = maskRanges(text, urlRanges);

  const quotes: string[] = [];
  for (const m of noUrls.matchAll(QUOTE_RE)) {
    quotes.push(norm(stripTrailingPunct(m[1] ?? m[2] ?? "")));
  }

  const dates: string[] = [];
  const dateRanges: Array<[number, number]> = [];
  for (const re of DATE_PATTERNS) {
    for (const m of noUrls.matchAll(re)) {
      dates.push(norm(m[0]).replace(/\.$/, ""));
      dateRanges.push([m.index!, m.index! + m[0].length]);
    }
  }
  const noDates = maskRanges(noUrls, dateRanges);

  const numbers: string[] = [];
  for (const m of noDates.matchAll(NUMBER_RE)) {
    const core = m[2].replace(/,/g, "").replace(/\.0+$/, "");
    numbers.push(`${m[1] ?? ""}${core}${m[3] ? "%" : ""}`);
  }

  const names: string[] = [];
  const nameText = maskRanges(noDates, []);
  for (const m of nameText.matchAll(/\b[A-Z][A-Za-z0-9&'-]*[A-Za-z0-9]\b/g)) {
    const i = m.index!;
    if (/^Q[1-4]$/.test(m[0]) || /^FY\d+$/i.test(m[0]) || /^I['\u2019]/.test(m[0])) continue;
    const before = nameText.slice(0, i);
    const atSentenceStart =
      /(?:^|\n)\s*(?:[-*\u2022]\s+|\d+[.)]\s+)?$|[.!?]["')\]]?\s+$|["\u201c(]\s*$/.test(before);
    if (atSentenceStart) continue;
    names.push(m[0]);
  }

  return {
    numbers: uniq(numbers),
    dates: uniq(dates),
    quotes: uniq(quotes),
    urls: uniq(urls),
    names: uniq(names),
  };
}

function hasWord(haystack: string, needle: string): boolean {
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^A-Za-z0-9])${esc}(?:$|[^A-Za-z0-9])`, "i").test(haystack);
}

export function compareFacts(draft: string, output: string): FactComparison {
  const d = extractFacts(draft);
  const o = extractFacts(output);
  const outNorm = norm(output);
  const draftNorm = norm(draft);

  const dropped: string[] = [];
  const added: string[] = [];

  const setDiff = (kind: keyof Facts, label: string) => {
    const outSet = new Set(o[kind]);
    for (const f of d[kind]) if (!outSet.has(f)) dropped.push(`${label}:${f}`);
    const draftSet = new Set(d[kind]);
    for (const f of o[kind]) if (!draftSet.has(f)) added.push(`${label}:${f}`);
  };
  setDiff("numbers", "number");
  setDiff("dates", "date");
  setDiff("urls", "url");
  // quotes may be re-punctuated; accept a quote that survives as plain text
  for (const q of d.quotes) if (!o.quotes.includes(q) && !outNorm.includes(q)) dropped.push(`quote:${q}`);
  for (const q of o.quotes) if (!d.quotes.includes(q) && !draftNorm.includes(q)) added.push(`quote:${q}`);
  // names: a draft name moved to a sentence start still counts as kept
  for (const n of d.names) if (!hasWord(output, n)) dropped.push(`name:${n}`);
  for (const n of o.names) if (!hasWord(draft, n)) added.push(`name:${n}`);

  const total = d.numbers.length + d.dates.length + d.quotes.length + d.urls.length + d.names.length;
  const recall = total === 0 ? 1 : Math.max(0, (total - dropped.length) / total);
  return { dropped, added, recall, hardFail: dropped.length > 0 || added.length > 0 };
}
