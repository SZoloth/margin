/**
 * Shared utilities for adversarial testing and autoresearch.
 * Extracted from adversarial-test.ts to avoid duplication.
 */

import { readFileSync, existsSync } from "fs";
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

export const REGISTER_MAP: Record<string, string> = {
  general: "casual",
  email: "casual",
  slack: "casual",
  outreach: "casual",
  pitch: "professional",
  prd: "professional",
  "cover-letter": "professional",
  resume: "professional",
  blog: "professional",
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
         WHERE (writing_type = ? OR writing_type = 'general' OR register = ?)
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

export function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.CLAUDECODE;
  return env;
}

export function stripMetaCommentary(text: string): string {
  const fenceMatch = text.match(/---\n([\s\S]+?)\n---/);
  if (fenceMatch) return fenceMatch[1].trim();

  let cleaned = text.replace(/^(?:Here['']s|Writing rules|I['']ll)[^\n]*\n+/i, "");
  cleaned = cleaned.replace(/\n+(?:\*\*Critique|~\d+\s*words|^\(.+\)$|\*\(.+\)\*).*/ms, "");

  return cleaned.trim();
}
