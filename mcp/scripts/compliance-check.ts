#!/usr/bin/env npx tsx

import { readFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import { homedir } from "os";
import { join, resolve } from "path";
import { fileURLToPath } from "url";

// ── Types ──────────────────────────────────────────────────────────────

export interface KillWordHit {
  word: string;
  severity: string;
  count: number;
}

export interface SlopPatternHit {
  pattern: string;
  explanation: string;
  matches: string[];
}

export interface VoiceViolation {
  type: string;
  detail: string;
}

export interface StructuralTellHit {
  pattern: string;
  matches: string[];
}

export interface LlmViolation {
  rule: string;
  text: string;
  severity: string;
}

export interface DimensionScores {
  directness: number;   // 1-10
  rhythm: number;       // 1-10
  trust: number;        // 1-10
  authenticity: number; // 1-10
  density: number;      // 1-10
  total: number;        // sum, out of 50
}

export interface ComplianceResult {
  mechanical: {
    killWords: KillWordHit[];
    slopPatterns: SlopPatternHit[];
    voiceViolations: VoiceViolation[];
    structuralTells: StructuralTellHit[];
  };
  dimensions?: DimensionScores;
  llmAudit?: {
    score: number;
    violations: LlmViolation[];
  };
  summary: {
    mechanicalIssues: number;
    dimensionScore?: number;
    llmScore?: number;
    pass: boolean;
  };
}

// ── ANSI helpers ───────────────────────────────────────────────────────

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

// ── Kill words parsing ─────────────────────────────────────────────────

export function parseKillWords(): Map<string, string> {
  const killWordsPath = join(
    homedir(),
    ".claude/skills/writing-quality-gate/references/KILL_WORDS.md"
  );

  if (!existsSync(killWordsPath)) {
    return new Map();
  }

  const content = readFileSync(killWordsPath, "utf-8");
  const words = new Map<string, string>();
  let currentSeverity: string | null = null;

  for (const line of content.split("\n")) {
    // Track which severity section we're in
    if (/^## HIGH/i.test(line)) {
      currentSeverity = "high";
      continue;
    }
    if (/^## MEDIUM/i.test(line)) {
      currentSeverity = "medium";
      continue;
    }
    if (/^## LOW/i.test(line)) {
      // Stop — we only want HIGH + MEDIUM
      currentSeverity = null;
      continue;
    }

    if (!currentSeverity) continue;

    // Parse table rows: | word/phrase | replacement |
    const tableMatch = line.match(/^\|\s*(.+?)\s*\|.*\|$/);
    if (!tableMatch) continue;

    const phrase = tableMatch[1].trim();
    // Skip header rows
    if (phrase === "Phrase" || phrase === "Pattern" || phrase === "Verb" || phrase === "AI Version" || phrase.startsWith("---")) continue;

    // Clean up: remove markdown formatting, parentheticals like "(into)"
    const cleaned = phrase.replace(/[*_`]/g, "").trim();
    if (cleaned.length > 0) {
      words.set(cleaned.toLowerCase(), currentSeverity);
    }
  }

  return words;
}

export function scanKillWords(text: string, killWords: Map<string, string>): KillWordHit[] {
  const lowerText = text.toLowerCase();
  const hits: KillWordHit[] = [];

  for (const [phrase, severity] of killWords) {
    // Word-boundary-aware search
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "gi");
    const matches = text.match(regex);
    if (matches && matches.length > 0) {
      hits.push({ word: phrase, severity, count: matches.length });
    }
  }

  return hits.sort((a, b) => {
    const sevOrder = { high: 0, medium: 1 };
    return (sevOrder[a.severity as keyof typeof sevOrder] ?? 2) - (sevOrder[b.severity as keyof typeof sevOrder] ?? 2);
  });
}

// ── AI slop patterns from DB ───────────────────────────────────────────

export function loadSlopPatterns(writingType?: string): { pattern: string; explanation: string }[] {
  const dbPath = join(homedir(), ".margin/margin.db");
  if (!existsSync(dbPath)) return [];

  try {
    const Database = require("better-sqlite3");
    const db = new Database(dbPath, { readonly: true });
    let rows: { example_before: string; rule_text: string }[];

    if (writingType) {
      rows = db
        .prepare(
          `SELECT example_before, rule_text FROM writing_rules WHERE category = 'ai-slop' AND (writing_type = ? OR writing_type = 'general') AND example_before IS NOT NULL`
        )
        .all(writingType) as { example_before: string; rule_text: string }[];
    } else {
      rows = db
        .prepare(
          `SELECT example_before, rule_text FROM writing_rules WHERE category = 'ai-slop' AND example_before IS NOT NULL`
        )
        .all() as { example_before: string; rule_text: string }[];
    }
    db.close();

    return rows.map((r) => ({
      pattern: r.example_before,
      explanation: r.rule_text,
    }));
  } catch {
    return [];
  }
}

export function scanSlopPatterns(
  text: string,
  patterns: { pattern: string; explanation: string }[]
): SlopPatternHit[] {
  const hits: SlopPatternHit[] = [];

  for (const { pattern, explanation } of patterns) {
    // Treat example_before as a literal substring to search for
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    try {
      const regex = new RegExp(escaped, "gi");
      const matches: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = regex.exec(text)) !== null) {
        matches.push(m[0]);
      }
      if (matches.length > 0) {
        hits.push({ pattern, explanation, matches });
      }
    } catch {
      // Skip invalid patterns
    }
  }

  return hits;
}

// ── Voice calibration ──────────────────────────────────────────────────

function splitSentences(text: string): string[] {
  // Split on sentence-ending punctuation, filter empties
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function wordCount(sentence: string): number {
  return sentence.split(/\s+/).filter((w) => w.length > 0).length;
}

export function checkVoice(text: string): VoiceViolation[] {
  const violations: VoiceViolation[] = [];
  const sentences = splitSentences(text);

  // Flag sentences > 40 words
  for (const s of sentences) {
    const wc = wordCount(s);
    if (wc > 40) {
      const preview = s.length > 80 ? s.slice(0, 80) + "..." : s;
      violations.push({
        type: "long-sentence",
        detail: `${wc} words: "${preview}"`,
      });
    }
  }

  // Consecutive same-structure sentences (4+ in a row with similar length ±7 words)
  if (sentences.length >= 4) {
    const lengths = sentences.map(wordCount);
    let runStart = 0;

    for (let i = 1; i <= lengths.length; i++) {
      const inRun =
        i < lengths.length &&
        Math.abs(lengths[i] - lengths[runStart]) <= 7;

      if (!inRun) {
        const runLen = i - runStart;
        if (runLen >= 4) {
          const previews = sentences
            .slice(runStart, runStart + 3)
            .map((s) => (s.length > 60 ? s.slice(0, 60) + "..." : s));
          violations.push({
            type: "repetitive-structure",
            detail: `${runLen} consecutive sentences with similar length (~${lengths[runStart]} words): "${previews.join('" / "')}"`,
          });
        }
        runStart = i;
      }
    }
  }

  return violations;
}

// ── Structural tells ───────────────────────────────────────────────────

const STRUCTURAL_PATTERNS: { label: string; regex: RegExp }[] = [
  {
    label: "\"It's important to note\" opener",
    regex: /\bIt(?:'s|'s| is) important to note\b/gi,
  },
  { label: "\"Moreover\" opener", regex: /(?:^|\.\s+)Moreover\b/gm },
  { label: "\"Furthermore\" opener", regex: /(?:^|\.\s+)Furthermore\b/gm },
  { label: "\"In conclusion\" opener", regex: /(?:^|\.\s+)In conclusion\b/gm },
  {
    label: "Negative parallelism (isn't X — it's Y)",
    regex: /\bisn(?:'t|'t|'t)\s+.{3,40}?\s*[—–-]\s*it(?:'s|'s|'s)\b/gi,
  },
  {
    label: "Negative parallelism (isn't X. It's Y)",
    regex: /\bisn(?:'t|'t|'t)\s+.{3,40}?\.\s*It(?:'s|'s|'s)\b/gi,
  },
  {
    label: "Negative parallelism (not about X — it's about Y)",
    regex: /\bnot about\s+.{3,40}?\s*[—–-]\s*it(?:'s|'s|'s) about\b/gi,
  },
  {
    label: "Superficial analysis verb: underscoring",
    regex: /\bunderscoring\b/gi,
  },
  {
    label: "Superficial analysis verb: highlighting",
    regex: /\bhighlighting\b/gi,
  },
  {
    label: "Superficial analysis verb: showcasing",
    regex: /\bshowcasing\b/gi,
  },
  {
    label: "Superficial analysis verb: leveraging",
    regex: /\bleveraging\b/gi,
  },
];

export function scanStructuralTells(text: string): StructuralTellHit[] {
  const hits: StructuralTellHit[] = [];

  for (const { label, regex } of STRUCTURAL_PATTERNS) {
    // Reset lastIndex for global regexes
    regex.lastIndex = 0;
    const matches: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      const start = Math.max(0, m.index - 20);
      const end = Math.min(text.length, m.index + m[0].length + 20);
      matches.push("..." + text.slice(start, end).replace(/\n/g, " ") + "...");
    }
    if (matches.length > 0) {
      hits.push({ pattern: label, matches });
    }
  }

  return hits;
}

// ── Dimension scoring ─────────────────────────────────────────────────

const HEDGE_PHRASES = [
  "might potentially",
  "could possibly",
  "it seems like",
  "to some extent",
  "in a sense",
  "you may want to",
  "it is advisable",
  "there are a few considerations",
  "it could be argued",
  "one might say",
  "it's worth considering",
  "perhaps it would be",
  "it remains to be seen",
];

const OVER_EXPLANATION_PHRASES = [
  "in other words",
  "to put it simply",
  "what this means is",
  "that is to say",
  "let me explain",
  "to be clear",
  "as mentioned earlier",
  "as previously mentioned",
  "as noted above",
  "as we discussed",
];

const FILLER_PHRASES = [
  "moreover",
  "furthermore",
  "additionally",
  "it's important to note",
  "it should be noted",
  "in order to",
  "due to the fact that",
  "the fact that",
  "very",
  "really",
  "quite",
  "somewhat",
  "basically",
  "literally",
  "obviously",
  "clearly",
  "genuinely",
  "absolutely",
  "certainly",
];

function countPhrasesPer100Words(text: string, phrases: string[]): number {
  const lowerText = text.toLowerCase();
  const totalWords = wordCount(text);
  if (totalWords === 0) return 0;

  let count = 0;
  for (const phrase of phrases) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "gi");
    const matches = lowerText.match(regex);
    if (matches) count += matches.length;
  }

  return (count / totalWords) * 100;
}

function scoreDirectness(text: string, killWordHits: KillWordHit[] = []): number {
  // Count hedges from hardcoded list
  let hedgeCount = 0;
  const lowerText = text.toLowerCase();
  for (const phrase of HEDGE_PHRASES) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "gi");
    const matches = lowerText.match(regex);
    if (matches) hedgeCount += matches.length;
  }

  // Kill words are the strongest signal of AI indirectness
  // Each kill word hit is worse than a hedge
  const killWordPenalty = killWordHits.reduce((sum, kw) => sum + kw.count, 0);
  const totalIndirectness = hedgeCount + killWordPenalty * 2;

  if (totalIndirectness === 0) return 10;
  if (totalIndirectness <= 2) return 7;
  if (totalIndirectness <= 5) return 5;
  if (totalIndirectness <= 10) return 3;
  return 1;
}

function scoreRhythm(text: string, voiceViolations: VoiceViolation[]): number {
  const sentences = splitSentences(text);
  if (sentences.length < 2) return 7; // very short text is fine, don't penalize

  // Short texts (2-4 sentences) get a floor of 7 — brevity is a feature
  const isShort = sentences.length <= 4;

  const lengths = sentences.map(wordCount);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  if (mean === 0) return 2;

  const variance =
    lengths.reduce((sum, len) => sum + (len - mean) ** 2, 0) / lengths.length;
  const stddev = Math.sqrt(variance);
  const cv = stddev / mean;

  let score: number;
  if (cv > 0.6) score = 10;
  else if (cv >= 0.4) score = 8;
  else if (cv >= 0.3) score = 6;
  else if (cv >= 0.2) score = 4;
  else score = 2;

  // Short texts shouldn't be penalized for lack of variance
  if (isShort) {
    score = Math.max(7, score);
  }

  // Penalize for repetitive-structure violations
  const hasRepetitive = voiceViolations.some(
    (v) => v.type === "repetitive-structure"
  );
  if (hasRepetitive) {
    score = Math.max(1, score - 2);
  }

  return score;
}

function scoreTrust(text: string, structuralTells: StructuralTellHit[] = []): number {
  const lowerText = text.toLowerCase();
  let count = 0;

  // Count over-explanation phrases
  for (const phrase of OVER_EXPLANATION_PHRASES) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "gi");
    const matches = lowerText.match(regex);
    if (matches) count += matches.length;
  }

  // Count self-answering rhetorical questions
  const sentences = splitSentences(text);
  for (let i = 0; i < sentences.length - 1; i++) {
    if (sentences[i].trim().endsWith("?")) {
      const next = sentences[i + 1].trim().toLowerCase();
      if (
        next.startsWith("the answer") ||
        next.startsWith("the result") ||
        next.startsWith("the takeaway") ||
        next.startsWith("simply put")
      ) {
        count++;
      }
    }
  }

  // Structural tells (negative parallelisms, AI presentation verbs) erode trust
  const structuralCount = structuralTells.reduce((sum, st) => sum + st.matches.length, 0);
  count += structuralCount;

  if (count === 0) return 10;
  if (count === 1) return 7;
  if (count === 2) return 5;
  if (count <= 4) return 3;
  return 1;
}

function scoreAuthenticity(
  killWordHits: KillWordHit[] = [],
  slopHits: SlopPatternHit[] = [],
  structuralTells: StructuralTellHit[] = []
): number {
  // Weighted: kill words (3pts each) > slop patterns (2pts) > structural tells (1pt)
  const weighted =
    killWordHits.reduce((s, kw) => s + kw.count * 3, 0) +
    slopHits.reduce((s, sp) => s + sp.matches.length * 2, 0) +
    structuralTells.reduce((s, st) => s + st.matches.length, 0);

  if (weighted === 0) return 10;
  if (weighted <= 3) return 7;
  if (weighted <= 8) return 5;
  if (weighted <= 15) return 3;
  return 1;
}

function scoreDensity(text: string, slopHits: SlopPatternHit[] = []): number {
  const lowerText = text.toLowerCase();
  const totalWords = wordCount(text);
  if (totalWords === 0) return 10;

  // Count hardcoded filler phrases
  let fillerCount = 0;
  for (const phrase of FILLER_PHRASES) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "gi");
    const matches = lowerText.match(regex);
    if (matches) fillerCount += matches.length;
  }

  // Include slop pattern matches as noise/filler
  const slopCount = slopHits.reduce((s, sp) => s + sp.matches.length, 0);
  const totalNoise = fillerCount + slopCount;

  // Normalize to per 100 words
  const per100 = (totalNoise / totalWords) * 100;

  if (per100 <= 0.5) return 10;
  if (per100 <= 1.5) return 7;
  if (per100 <= 3) return 5;
  if (per100 <= 5) return 3;
  return 1;
}

export function scoreDimensions(
  text: string,
  mechanicalIssueCount: number,
  voiceViolations: VoiceViolation[] = [],
  killWordHits: KillWordHit[] = [],
  slopHits: SlopPatternHit[] = [],
  structuralTells: StructuralTellHit[] = []
): DimensionScores {
  const directness = scoreDirectness(text, killWordHits);
  const rhythm = scoreRhythm(text, voiceViolations);
  const trust = scoreTrust(text, structuralTells);
  const authenticity = scoreAuthenticity(killWordHits, slopHits, structuralTells);
  const density = scoreDensity(text, slopHits);

  return {
    directness,
    rhythm,
    trust,
    authenticity,
    density,
    total: directness + rhythm + trust + authenticity + density,
  };
}

// ── LLM audit ──────────────────────────────────────────────────────────

function runLlmAudit(
  text: string
): { score: number; violations: LlmViolation[] } | null {
  const rulesPath = join(homedir(), ".margin/writing-rules.md");
  let rulesContext = "";

  if (existsSync(rulesPath)) {
    rulesContext = readFileSync(rulesPath, "utf-8");
  }

  const prompt = `You are a writing quality auditor. Score this prose against the writing rules below.

<writing-rules>
${rulesContext}
</writing-rules>

<prose>
${text}
</prose>

For each rule category, indicate pass/fail with specific violations. Output ONLY valid JSON (no markdown fences, no commentary) with this schema:
{ "score": 0-100, "violations": [{"rule": "rule name", "text": "violating excerpt", "severity": "high|medium|low"}] }`;

  try {
    const result = execSync(`claude --print --model sonnet`, {
      input: prompt,
      encoding: "utf-8",
      timeout: 60_000,
      maxBuffer: 1024 * 1024,
      env: (() => { const e = { ...process.env }; delete e.CLAUDECODE; return e; })(),
    });

    // Extract JSON from response (handle potential markdown fences)
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      score: typeof parsed.score === "number" ? parsed.score : 50,
      violations: Array.isArray(parsed.violations) ? parsed.violations : [],
    };
  } catch (err) {
    console.error(`${RED}LLM audit failed:${RESET}`, (err as Error).message);
    return null;
  }
}

// ── Formatted output ───────────────────────────────────────────────────

function printReport(result: ComplianceResult): void {
  console.log(`\n${BOLD}═══ Margin Compliance Report ═══${RESET}\n`);

  // Kill words
  if (result.mechanical.killWords.length > 0) {
    console.log(`${RED}${BOLD}Kill Words${RESET}`);
    for (const kw of result.mechanical.killWords) {
      const sevColor = kw.severity === "high" ? RED : YELLOW;
      console.log(
        `  ${sevColor}■${RESET} ${kw.word} ${DIM}(${kw.severity}, ${kw.count}×)${RESET}`
      );
    }
    console.log();
  }

  // Slop patterns
  if (result.mechanical.slopPatterns.length > 0) {
    console.log(`${RED}${BOLD}AI Slop Patterns${RESET}`);
    for (const sp of result.mechanical.slopPatterns) {
      console.log(`  ${RED}■${RESET} ${sp.explanation}`);
      for (const match of sp.matches) {
        const preview = match.length > 80 ? match.slice(0, 80) + "..." : match;
        console.log(`    ${DIM}"${preview}"${RESET}`);
      }
    }
    console.log();
  }

  // Voice violations
  if (result.mechanical.voiceViolations.length > 0) {
    console.log(`${YELLOW}${BOLD}Voice Calibration${RESET}`);
    for (const v of result.mechanical.voiceViolations) {
      const icon = v.type === "long-sentence" ? "↔" : "≡";
      console.log(`  ${YELLOW}${icon}${RESET} ${v.detail}`);
    }
    console.log();
  }

  // Structural tells
  if (result.mechanical.structuralTells.length > 0) {
    console.log(`${YELLOW}${BOLD}Structural Tells${RESET}`);
    for (const st of result.mechanical.structuralTells) {
      console.log(`  ${YELLOW}■${RESET} ${st.pattern}`);
      for (const match of st.matches) {
        console.log(`    ${DIM}${match}${RESET}`);
      }
    }
    console.log();
  }

  // LLM audit
  if (result.llmAudit) {
    const scoreColor =
      result.llmAudit.score >= 80
        ? GREEN
        : result.llmAudit.score >= 60
          ? YELLOW
          : RED;
    console.log(
      `${CYAN}${BOLD}LLM Audit${RESET} — Score: ${scoreColor}${result.llmAudit.score}/100${RESET}`
    );
    for (const v of result.llmAudit.violations) {
      const sevColor = v.severity === "high" ? RED : v.severity === "medium" ? YELLOW : DIM;
      console.log(`  ${sevColor}■${RESET} [${v.rule}] "${v.text}"`);
    }
    console.log();
  }

  // Dimensions
  if (result.dimensions) {
    const d = result.dimensions;
    const totalColor = d.total >= 35 ? GREEN : d.total >= 25 ? YELLOW : RED;
    console.log(
      `${BOLD}── Dimensions (${totalColor}${d.total}/50${RESET}${BOLD}) ──${RESET}`
    );

    const dimEntries: [string, number][] = [
      ["Directness", d.directness],
      ["Rhythm", d.rhythm],
      ["Trust", d.trust],
      ["Authenticity", d.authenticity],
      ["Density", d.density],
    ];

    for (const [label, score] of dimEntries) {
      const filled = "\u2588".repeat(score);
      const empty = "\u2591".repeat(10 - score);
      const color = score >= 7 ? GREEN : score >= 5 ? YELLOW : RED;
      console.log(
        `  ${label.padEnd(15)}${color}${filled}${DIM}${empty}${RESET} ${score}`
      );
    }
    console.log();
  }

  // Summary
  const { mechanicalIssues, dimensionScore, llmScore, pass } = result.summary;
  console.log(`${BOLD}── Summary ──${RESET}`);
  console.log(
    `  Mechanical issues: ${mechanicalIssues === 0 ? GREEN : RED}${mechanicalIssues}${RESET}`
  );
  if (dimensionScore !== undefined) {
    const dimColor = dimensionScore >= 35 ? GREEN : dimensionScore >= 25 ? YELLOW : RED;
    console.log(`  Dimension score: ${dimColor}${dimensionScore}/50${RESET}`);
  }
  if (llmScore !== undefined) {
    const scoreColor = llmScore >= 80 ? GREEN : llmScore >= 60 ? YELLOW : RED;
    console.log(`  LLM score: ${scoreColor}${llmScore}/100${RESET}`);
  }
  console.log(
    `  Result: ${pass ? `${GREEN}${BOLD}PASS${RESET}` : `${RED}${BOLD}FAIL${RESET}`}`
  );
  console.log();
}

// ── Main ───────────────────────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2);
  const useLlm = args.includes("--llm");
  const useJson = args.includes("--json");
  const fileArgs = args.filter((a) => !a.startsWith("--"));

  let text: string;

  if (fileArgs.length > 0) {
    const filePath = fileArgs[0];
    if (!existsSync(filePath)) {
      console.error(`${RED}File not found: ${filePath}${RESET}`);
      process.exit(1);
    }
    text = readFileSync(filePath, "utf-8");
  } else if (!process.stdin.isTTY) {
    text = readFileSync("/dev/stdin", "utf-8");
  } else {
    console.error(
      `Usage: npx tsx mcp/scripts/compliance-check.ts [--llm] [--json] <file-or-stdin>`
    );
    console.error(`  --llm     Enable LLM audit layer (slower, costs API tokens)`);
    console.error(`  --json    Output raw JSON instead of formatted report`);
    console.error(`  <file>    Path to prose file to check (or reads from stdin if no file arg)`);
    process.exit(1);
  }

  // Layer 1: Mechanical checks
  const killWords = parseKillWords();
  const killWordHits = scanKillWords(text, killWords);
  const slopPatterns = loadSlopPatterns();
  const slopHits = scanSlopPatterns(text, slopPatterns);
  const voiceViolations = checkVoice(text);
  const structuralTells = scanStructuralTells(text);

  const mechanicalIssues =
    killWordHits.length +
    slopHits.length +
    voiceViolations.length +
    structuralTells.length;

  // Dimension scoring
  const dimensions = scoreDimensions(text, mechanicalIssues, voiceViolations, killWordHits, slopHits, structuralTells);

  // Layer 2: LLM audit (optional)
  let llmAudit: { score: number; violations: LlmViolation[] } | undefined;
  if (useLlm) {
    const audit = runLlmAudit(text);
    if (audit) {
      llmAudit = audit;
    }
  }

  const result: ComplianceResult = {
    mechanical: {
      killWords: killWordHits,
      slopPatterns: slopHits,
      voiceViolations,
      structuralTells,
    },
    dimensions,
    ...(llmAudit && { llmAudit }),
    summary: {
      mechanicalIssues,
      dimensionScore: dimensions.total,
      ...(llmAudit && { llmScore: llmAudit.score }),
      pass:
        mechanicalIssues === 0 &&
        dimensions.total >= 35 &&
        (llmAudit ? llmAudit.score >= 80 : true),
    },
  };

  if (useJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printReport(result);
  }

  // Exit with non-zero if failed
  if (!result.summary.pass) {
    process.exit(2);
  }
}

// Run main() only when executed directly, not when imported
const __filename = fileURLToPath(import.meta.url);
const isDirectRun = resolve(process.argv[1] ?? "") === __filename;
if (isDirectRun) {
  main();
}

// Re-export a programmatic compliance check for use by other scripts
export function runComplianceCheck(text: string, writingType?: string): ComplianceResult {
  const killWords = parseKillWords();
  const killWordHits = scanKillWords(text, killWords);
  const slopPatterns = loadSlopPatterns(writingType);
  const slopHits = scanSlopPatterns(text, slopPatterns);
  const voiceViolations = checkVoice(text);
  const structuralTells = scanStructuralTells(text);

  const mechanicalIssues =
    killWordHits.length +
    slopHits.length +
    voiceViolations.length +
    structuralTells.length;

  const dimensions = scoreDimensions(text, mechanicalIssues, voiceViolations, killWordHits, slopHits, structuralTells);

  return {
    mechanical: {
      killWords: killWordHits,
      slopPatterns: slopHits,
      voiceViolations,
      structuralTells,
    },
    dimensions,
    summary: {
      mechanicalIssues,
      dimensionScore: dimensions.total,
      pass: mechanicalIssues === 0 && dimensions.total >= 35,
    },
  };
}
