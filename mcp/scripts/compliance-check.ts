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

export interface ComplianceResult {
  mechanical: {
    killWords: KillWordHit[];
    slopPatterns: SlopPatternHit[];
    voiceViolations: VoiceViolation[];
    structuralTells: StructuralTellHit[];
  };
  llmAudit?: {
    score: number;
    violations: LlmViolation[];
  };
  summary: {
    mechanicalIssues: number;
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

export function loadSlopPatterns(): { pattern: string; explanation: string }[] {
  const dbPath = join(homedir(), ".margin/margin.db");
  if (!existsSync(dbPath)) return [];

  try {
    const Database = require("better-sqlite3");
    const db = new Database(dbPath, { readonly: true });
    const rows = db
      .prepare(
        `SELECT example_before, rule_text FROM writing_rules WHERE category = 'ai-slop' AND example_before IS NOT NULL`
      )
      .all() as { example_before: string; rule_text: string }[];
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

  // Consecutive same-structure sentences (3+ in a row with similar length ±5 words)
  if (sentences.length >= 3) {
    const lengths = sentences.map(wordCount);
    let runStart = 0;

    for (let i = 1; i <= lengths.length; i++) {
      const inRun =
        i < lengths.length &&
        Math.abs(lengths[i] - lengths[runStart]) <= 5;

      if (!inRun) {
        const runLen = i - runStart;
        if (runLen >= 3) {
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
      env: { ...process.env, CLAUDECODE: "" },
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

  // Summary
  const { mechanicalIssues, llmScore, pass } = result.summary;
  console.log(`${BOLD}── Summary ──${RESET}`);
  console.log(
    `  Mechanical issues: ${mechanicalIssues === 0 ? GREEN : RED}${mechanicalIssues}${RESET}`
  );
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
    ...(llmAudit && { llmAudit }),
    summary: {
      mechanicalIssues,
      ...(llmAudit && { llmScore: llmAudit.score }),
      pass:
        mechanicalIssues === 0 &&
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
export function runComplianceCheck(text: string): ComplianceResult {
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

  return {
    mechanical: {
      killWords: killWordHits,
      slopPatterns: slopHits,
      voiceViolations,
      structuralTells,
    },
    summary: {
      mechanicalIssues,
      pass: mechanicalIssues === 0,
    },
  };
}
