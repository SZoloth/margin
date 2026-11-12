#!/usr/bin/env npx tsx

import { readFileSync, readdirSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";

// ── Types ──────────────────────────────────────────────────────────────

interface ComplianceResult {
  mechanical: unknown;
  dimensions?: { total: number; [key: string]: number };
  summary: { mechanicalIssues: number; pass: boolean };
}

interface ComparisonSample {
  prompt: string;
  uncoached: { text: string; compliance: ComplianceResult };
  coached: { text: string; compliance: ComplianceResult };
}

interface ComparisonTypeResult {
  writingType: string;
  samples: ComparisonSample[];
  delta: unknown;
}

interface ComparisonResult {
  timestamp: string;
  mode: "comparison";
  results: ComparisonTypeResult[];
  overall: unknown;
}

// ── ANSI helpers ───────────────────────────────────────────────────────

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

// ── Stop words (trivial n-grams to filter out) ────────────────────────

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "it", "be", "as", "was", "are",
  "that", "this", "will", "can", "do", "not", "you", "your", "i",
  "my", "we", "our", "they", "their", "he", "she", "his", "her",
  "if", "so", "no", "up", "out", "about", "than", "then", "when",
  "what", "how", "all", "each", "which", "who", "its", "has", "had",
  "have", "been", "would", "could", "should", "may", "might",
]);

// ── Text processing ───────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s'-]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 0);
}

function extractNgrams(tokens: string[], n: number): string[] {
  const ngrams: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    const gram = tokens.slice(i, i + n);
    // Skip if ALL words are stop words
    const substantive = gram.filter((w) => !STOP_WORDS.has(w));
    if (substantive.length >= Math.ceil(n / 2)) {
      ngrams.push(gram.join(" "));
    }
  }
  return ngrams;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

// ── Analysis functions ────────────────────────────────────────────────

interface NgramDiff {
  pattern: string;
  frequency: number;
  totalSamples: number;
}

function analyzeNgramDiffs(
  samples: ComparisonSample[],
  n: number
): { removed: NgramDiff[]; added: NgramDiff[] } {
  const removedCounts = new Map<string, number>();
  const addedCounts = new Map<string, number>();

  for (const sample of samples) {
    const uncoachedTokens = tokenize(sample.uncoached.text);
    const coachedTokens = tokenize(sample.coached.text);

    const uncoachedNgrams = new Set(extractNgrams(uncoachedTokens, n));
    const coachedNgrams = new Set(extractNgrams(coachedTokens, n));

    // In uncoached but not coached = coaching removes
    for (const gram of uncoachedNgrams) {
      if (!coachedNgrams.has(gram)) {
        removedCounts.set(gram, (removedCounts.get(gram) ?? 0) + 1);
      }
    }

    // In coached but not uncoached = coaching adds
    for (const gram of coachedNgrams) {
      if (!uncoachedNgrams.has(gram)) {
        addedCounts.set(gram, (addedCounts.get(gram) ?? 0) + 1);
      }
    }
  }

  const total = samples.length;
  const minFreq = 2;

  const removed = Array.from(removedCounts.entries())
    .filter(([, count]) => count >= minFreq)
    .sort((a, b) => b[1] - a[1])
    .map(([pattern, frequency]) => ({ pattern, frequency, totalSamples: total }));

  const added = Array.from(addedCounts.entries())
    .filter(([, count]) => count >= minFreq)
    .sort((a, b) => b[1] - a[1])
    .map(([pattern, frequency]) => ({ pattern, frequency, totalSamples: total }));

  return { removed, added };
}

interface StructuralStats {
  avgSentenceLength: number;
  sentenceLengthCV: number; // coefficient of variation
  openingWords: Map<string, number>;
}

function analyzeStructure(texts: string[]): StructuralStats {
  const allLengths: number[] = [];
  const openingWords = new Map<string, number>();

  for (const text of texts) {
    const sentences = splitSentences(text);
    for (const sentence of sentences) {
      const wc = wordCount(sentence);
      allLengths.push(wc);

      const firstWord = tokenize(sentence)[0];
      if (firstWord) {
        openingWords.set(firstWord, (openingWords.get(firstWord) ?? 0) + 1);
      }
    }
  }

  const avg =
    allLengths.length > 0
      ? allLengths.reduce((s, v) => s + v, 0) / allLengths.length
      : 0;

  const variance =
    allLengths.length > 1
      ? allLengths.reduce((s, v) => s + (v - avg) ** 2, 0) / allLengths.length
      : 0;

  const stdDev = Math.sqrt(variance);
  const cv = avg > 0 ? stdDev / avg : 0;

  return { avgSentenceLength: avg, sentenceLengthCV: cv, openingWords };
}

interface WordFreqDiff {
  word: string;
  uncoachedRate: number; // per 100 words
  coachedRate: number;
  delta: number;
}

function analyzeWordFrequency(samples: ComparisonSample[]): {
  moreInUncoached: WordFreqDiff[];
  moreInCoached: WordFreqDiff[];
} {
  const uncoachedCounts = new Map<string, number>();
  const coachedCounts = new Map<string, number>();
  let uncoachedTotal = 0;
  let coachedTotal = 0;

  for (const sample of samples) {
    const uTokens = tokenize(sample.uncoached.text);
    const cTokens = tokenize(sample.coached.text);
    uncoachedTotal += uTokens.length;
    coachedTotal += cTokens.length;

    for (const t of uTokens) {
      if (!STOP_WORDS.has(t) && t.length > 2) {
        uncoachedCounts.set(t, (uncoachedCounts.get(t) ?? 0) + 1);
      }
    }
    for (const t of cTokens) {
      if (!STOP_WORDS.has(t) && t.length > 2) {
        coachedCounts.set(t, (coachedCounts.get(t) ?? 0) + 1);
      }
    }
  }

  const allWords = new Set([...uncoachedCounts.keys(), ...coachedCounts.keys()]);
  const diffs: WordFreqDiff[] = [];

  for (const word of allWords) {
    const uCount = uncoachedCounts.get(word) ?? 0;
    const cCount = coachedCounts.get(word) ?? 0;
    // Require minimum 3 occurrences in at least one corpus
    if (uCount < 3 && cCount < 3) continue;

    const uRate = uncoachedTotal > 0 ? (uCount / uncoachedTotal) * 100 : 0;
    const cRate = coachedTotal > 0 ? (cCount / coachedTotal) * 100 : 0;
    const delta = cRate - uRate;

    if (Math.abs(delta) > 0.05) {
      diffs.push({ word, uncoachedRate: uRate, coachedRate: cRate, delta });
    }
  }

  const sorted = diffs.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return {
    moreInUncoached: sorted.filter((d) => d.delta < 0).slice(0, 20),
    moreInCoached: sorted.filter((d) => d.delta > 0).slice(0, 20),
  };
}

// ── Per-type breakdown ────────────────────────────────────────────────

interface TypeBreakdown {
  writingType: string;
  removed: string[];
  added: string[];
}

function perTypeBreakdown(results: ComparisonTypeResult[]): TypeBreakdown[] {
  const breakdowns: TypeBreakdown[] = [];

  for (const typeResult of results) {
    const { removed, added } = analyzeNgramDiffs(typeResult.samples, 3);
    breakdowns.push({
      writingType: typeResult.writingType,
      removed: removed.slice(0, 5).map((d) => d.pattern),
      added: added.slice(0, 5).map((d) => d.pattern),
    });
  }

  return breakdowns;
}

// ── Report printing ───────────────────────────────────────────────────

function printReport(data: ComparisonResult, filename: string): void {
  const allSamples = data.results.flatMap((r) => r.samples);
  const totalSamples = allSamples.length;

  console.log(`\n${BOLD}═══ Pattern Discovery Report ═══${RESET}`);
  console.log(`${DIM}Source: ${filename} (${totalSamples} samples)${RESET}\n`);

  // N-gram analysis across all sizes
  for (const n of [2, 3, 4]) {
    const { removed, added } = analyzeNgramDiffs(allSamples, n);

    if (removed.length > 0) {
      console.log(
        `${BOLD}── ${n}-gram Patterns Coaching REMOVES ──${RESET}`
      );
      console.log(
        `  ${DIM}${"Rank".padEnd(6)}${"Freq".padEnd(12)}Pattern${RESET}`
      );
      for (let i = 0; i < Math.min(removed.length, 15); i++) {
        const d = removed[i];
        console.log(
          `  ${String(i + 1).padEnd(6)}${RED}${`${d.frequency}/${d.totalSamples}`.padEnd(12)}${RESET}"${d.pattern}"`
        );
      }
      console.log();
    }

    if (added.length > 0) {
      console.log(`${BOLD}── ${n}-gram Patterns Coaching ADDS ──${RESET}`);
      console.log(
        `  ${DIM}${"Rank".padEnd(6)}${"Freq".padEnd(12)}Pattern${RESET}`
      );
      for (let i = 0; i < Math.min(added.length, 15); i++) {
        const d = added[i];
        console.log(
          `  ${String(i + 1).padEnd(6)}${GREEN}${`${d.frequency}/${d.totalSamples}`.padEnd(12)}${RESET}"${d.pattern}"`
        );
      }
      console.log();
    }
  }

  // Per-type breakdown
  const breakdowns = perTypeBreakdown(data.results);
  console.log(`${BOLD}── Per-Type Breakdown (3-grams) ──${RESET}`);
  for (const bd of breakdowns) {
    console.log(`  ${CYAN}${bd.writingType}${RESET} (${data.results.find((r) => r.writingType === bd.writingType)?.samples.length ?? 0} samples):`);
    if (bd.removed.length > 0) {
      console.log(`    ${RED}Removed:${RESET} ${bd.removed.map((p) => `"${p}"`).join(", ")}`);
    }
    if (bd.added.length > 0) {
      console.log(`    ${GREEN}Added:${RESET}   ${bd.added.map((p) => `"${p}"`).join(", ")}`);
    }
    if (bd.removed.length === 0 && bd.added.length === 0) {
      console.log(`    ${DIM}no significant patterns${RESET}`);
    }
  }
  console.log();

  // Structural signals
  const uncoachedTexts = allSamples.map((s) => s.uncoached.text);
  const coachedTexts = allSamples.map((s) => s.coached.text);
  const uncoachedStructure = analyzeStructure(uncoachedTexts);
  const coachedStructure = analyzeStructure(coachedTexts);

  console.log(`${BOLD}── Structural Signals ──${RESET}`);
  console.log(
    `  Avg sentence length:  ${DIM}uncoached${RESET} ${uncoachedStructure.avgSentenceLength.toFixed(1)} → ${DIM}coached${RESET} ${coachedStructure.avgSentenceLength.toFixed(1)} words`
  );
  console.log(
    `  Sentence length CV:   ${DIM}uncoached${RESET} ${uncoachedStructure.sentenceLengthCV.toFixed(2)} → ${DIM}coached${RESET} ${coachedStructure.sentenceLengthCV.toFixed(2)}`
  );
  console.log();

  // Opening words comparison
  console.log(`${BOLD}── Sentence Opening Words ──${RESET}`);
  const uOpeners = Array.from(uncoachedStructure.openingWords.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  const cOpeners = Array.from(coachedStructure.openingWords.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  console.log(`  ${DIM}Uncoached top openers:${RESET} ${uOpeners.map(([w, c]) => `${w}(${c})`).join(", ")}`);
  console.log(`  ${DIM}Coached top openers:${RESET}   ${cOpeners.map(([w, c]) => `${w}(${c})`).join(", ")}`);
  console.log();

  // Word frequency
  const { moreInUncoached, moreInCoached } = analyzeWordFrequency(allSamples);

  if (moreInUncoached.length > 0) {
    console.log(`${BOLD}── Words More Common in Uncoached ──${RESET}`);
    console.log(
      `  ${DIM}${"Word".padEnd(20)}${"Uncoached".padEnd(14)}${"Coached".padEnd(14)}Delta${RESET}`
    );
    for (const d of moreInUncoached.slice(0, 15)) {
      console.log(
        `  ${d.word.padEnd(20)}${RED}${d.uncoachedRate.toFixed(2).padEnd(14)}${RESET}${d.coachedRate.toFixed(2).padEnd(14)}${d.delta.toFixed(2)}`
      );
    }
    console.log();
  }

  if (moreInCoached.length > 0) {
    console.log(`${BOLD}── Words More Common in Coached ──${RESET}`);
    console.log(
      `  ${DIM}${"Word".padEnd(20)}${"Uncoached".padEnd(14)}${"Coached".padEnd(14)}Delta${RESET}`
    );
    for (const d of moreInCoached.slice(0, 15)) {
      console.log(
        `  ${d.word.padEnd(20)}${d.uncoachedRate.toFixed(2).padEnd(14)}${GREEN}${d.coachedRate.toFixed(2).padEnd(14)}${RESET}+${d.delta.toFixed(2)}`
      );
    }
    console.log();
  }
}

// ── CLI ────────────────────────────────────────────────────────────────

function findLatestComparison(dir: string): string | null {
  try {
    const files = readdirSync(dir)
      .filter((f) => f.startsWith("comparison-") && f.endsWith(".json"))
      .sort()
      .reverse();
    return files.length > 0 ? join(dir, files[0]) : null;
  } catch {
    return null;
  }
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(
      `Usage: npx tsx mcp/scripts/pattern-discovery.ts [--file path/to/comparison.json]`
    );
    console.log(`  --file    Read specific comparison JSON file`);
    console.log(
      `  Default: reads most recent comparison-*.json from mcp/scripts/regression/`
    );
    process.exit(0);
  }

  const fileIdx = args.indexOf("--file");
  let filePath: string;

  if (fileIdx !== -1 && args[fileIdx + 1]) {
    filePath = resolve(args[fileIdx + 1]);
  } else {
    const regressionDir = join(
      import.meta.dirname ?? ".",
      "regression"
    );
    const latest = findLatestComparison(regressionDir);
    if (!latest) {
      console.error(
        `${RED}No comparison files found in ${regressionDir}${RESET}`
      );
      console.error(
        `Run: npx tsx mcp/scripts/adversarial-test.ts --mode comparison --save`
      );
      process.exit(1);
    }
    filePath = latest;
  }

  let data: ComparisonResult;
  try {
    data = JSON.parse(readFileSync(filePath, "utf-8"));
  } catch (err) {
    console.error(
      `${RED}Failed to read ${filePath}:${RESET} ${(err as Error).message}`
    );
    process.exit(1);
  }

  if (data.mode !== "comparison") {
    console.error(
      `${RED}File is not a comparison result (mode: ${data.mode})${RESET}`
    );
    process.exit(1);
  }

  const filename = filePath.split("/").pop() ?? filePath;
  printReport(data, filename);
}

// Run main() only when executed directly
const __filename = fileURLToPath(import.meta.url);
const isDirectRun = resolve(process.argv[1] ?? "") === __filename;
if (isDirectRun) {
  main();
}
