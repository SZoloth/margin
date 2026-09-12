/**
 * Shared utilities for adversarial testing and autoresearch.
 * Extracted from adversarial-test.ts to avoid duplication.
 */

import { readFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import { homedir } from "os";
import { join } from "path";

// ── Adversarial prompts ────────────────────────────────────────────────

export const ADVERSARIAL_PROMPTS: Record<string, string> = {
  general:
    "Write a 200-word blog intro about why product managers should learn to code",
  email:
    "Draft a follow-up email after a job interview at a company you're excited about",
  "cover-letter":
    "Write an opening paragraph for a PM role at Stripe",
  outreach:
    "Draft a cold LinkedIn message to a VP of Product at a Series B startup",
  prd:
    "Write the problem statement section for a feature that adds dark mode",
  blog:
    "Write a paragraph arguing that most product roadmaps are theater",
  resume:
    "Write a bullet point for leading a product redesign that increased retention 15%",
  slack:
    "Write a message asking your team to review a doc before Friday",
  pitch:
    "Write the opening of a pitch deck for a reading annotation tool",
};

export const SAMPLES_PER_TYPE = 3;

// Aligned to registerDefaults in cli/profile/coaching.go — the eval must
// coach against the same register assignments production uses.
export const REGISTER_MAP: Record<string, string> = {
  general: "professional",
  email: "professional",
  slack: "casual",
  outreach: "professional",
  pitch: "professional",
  prd: "explaining",
  "cover-letter": "professional",
  resume: "professional",
  blog: "casual",
  "case-study": "professional",
  "email-hiring": "professional",
  "email-friend": "casual",
  "social-post": "casual",
  "text-friend": "casual",
  text: "casual",
};

// ── Types ──────────────────────────────────────────────────────────────

export interface WritingRuleRow {
  writing_type: string;
  category: string;
  rule_text: string;
  severity: string;
  example_before: string | null;
  example_after: string | null;
  register: string | null;
}

// ── Shared utilities ───────────────────────────────────────────────────

function loadWritingRules(): string {
  const rulesPath = join(homedir(), ".margin/writing-rules.md");
  if (!existsSync(rulesPath)) {
    console.error(`Writing rules not found at ${rulesPath}`);
    process.exit(1);
  }
  return readFileSync(rulesPath, "utf-8");
}

export function loadWritingRulesForType(type: string): string {
  try {
    const Database = require("better-sqlite3");
    const dbPath = join(homedir(), ".margin/margin.db");
    if (!existsSync(dbPath)) return loadWritingRules();

    const db = new Database(dbPath, { readonly: true });
    const register = REGISTER_MAP[type] ?? "casual";

    const rows = db
      .prepare(
        `SELECT writing_type, category, rule_text, severity, example_before, example_after, register
         FROM writing_rules
         WHERE ${RULE_FILTER}
           AND (writing_type = ? OR writing_type = 'general' OR register = ?)
         ORDER BY signal_count DESC, created_at DESC`
      )
      .all(type, register) as WritingRuleRow[];
    db.close();

    if (rows.length === 0) return loadWritingRules();

    const grouped = new Map<string, Map<string, WritingRuleRow[]>>();
    for (const row of rows) {
      if (!grouped.has(row.writing_type)) grouped.set(row.writing_type, new Map());
      const categories = grouped.get(row.writing_type)!;
      if (!categories.has(row.category)) categories.set(row.category, []);
      categories.get(row.category)!.push(row);
    }

    const lines: string[] = [`# Writing Rules (filtered for: ${type}, register: ${register})`];

    for (const [writingType, categories] of grouped) {
      lines.push("", `## ${writingType.charAt(0).toUpperCase() + writingType.slice(1)}`);
      for (const [category, rules] of categories) {
        lines.push(`### ${category}`);
        for (const rule of rules) {
          lines.push(`- [${rule.severity}] ${rule.rule_text}`);
          if (rule.example_before) lines.push(`  - Before: "${rule.example_before}"`);
          if (rule.example_after) lines.push(`  - After: "${rule.example_after}"`);
        }
      }
    }

    return lines.join("\n");
  } catch {
    return loadWritingRules();
  }
}

/**
 * Production correction predicates, mirroring GetCorrectionsWithNotes in
 * cli/db/corrections.go. Triage-junk and positive-polarity rows must never
 * render as "avoid this" examples in eval prompts.
 */
export const CORRECTION_FILTER = `notes_json IS NOT NULL AND notes_json != '[]'
    AND session_id != '__backfilled__'
    AND UPPER(notes_json) NOT LIKE '%NOT FEEDBACK%'
    AND (category IS NULL OR category != 'non-feedback')
    AND (polarity IS NULL OR polarity != 'positive')`;

/**
 * Production rule predicates: exclude unreviewed synthesis candidates and
 * the auto-synthesized category (the rules-quality audit found its
 * example_before/example_after fields inverted — corrected prose stored as
 * the violation).
 */
export const RULE_FILTER = `category != 'auto-synthesized'
    AND NOT (source = 'synthesis-candidate' AND reviewed_at IS NULL)`;

export function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.CLAUDECODE;
  return env;
}

/**
 * The generator command for eval runs. Override with MARGIN_EVAL_CMD —
 * e.g. `poolside` (free local model) when the Claude CLI is unavailable.
 * Any `stdin → stdout` command works.
 */
export function evalCmd(): string {
  return process.env.MARGIN_EVAL_CMD ?? "claude --print --model sonnet";
}

/**
 * LLM generator for eval runs. The command receives the prompt on stdin and
 * must print the prose to stdout.
 */
export function evalGenerate(prompt: string): string {
  const cmd = evalCmd();
  return execSync(cmd, {
    input: prompt,
    encoding: "utf-8",
    timeout: 120_000,
    maxBuffer: 1024 * 1024,
    env: cleanEnv(),
  }).trim();
}

export function stripMetaCommentary(text: string): string {
  const fenceMatch = text.match(/---\n([\s\S]+?)\n---/);
  if (fenceMatch) return fenceMatch[1].trim();

  let cleaned = text.replace(/^(?:Here['']s|Writing rules|I['']ll)[^\n]*\n+/i, "");
  cleaned = cleaned.replace(/\n+(?:\*\*Critique|~\d+\s*words|^\(.+\)$|\*\(.+\)\*).*/ms, "");

  return cleaned.trim();
}
