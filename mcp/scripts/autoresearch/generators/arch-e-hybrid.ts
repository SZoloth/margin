/**
 * Architecture E: Hybrid (corrections + high-signal rules).
 *
 * Combines Architecture D (raw corrections for concrete mechanical signal)
 * with high-signal rules (signal_count >= 2 OR must-fix) for structural
 * patterns that may not appear in correction history.
 *
 * This is the LEADING architecture at ~72.3% mean pass rate (3-run average).
 * Used as the production baseline. arch-h (DSPy) matched but didn't exceed it,
 * confirming that data layer > prompt presentation layer.
 *
 * Data flow: corrections filtered by writing_type + high-signal rule subset.
 */

import { execSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { createRequire } from "module";
import { stripMetaCommentary, cleanEnv } from "../../shared.ts";

const require = createRequire(import.meta.url);

interface CorrectionRow {
  original_text: string;
  notes_json: string;
  writing_type: string | null;
  prefix_context: string | null;
  suffix_context: string | null;
}

interface RuleRow {
  rule_text: string;
  severity: string;
  example_before: string | null;
  example_after: string | null;
  category: string;
  signal_count: number;
}

function loadCorrections(type: string): CorrectionRow[] {
  const dbPath = join(homedir(), ".margin/margin.db");
  if (!existsSync(dbPath)) return [];

  try {
    const Database = require("better-sqlite3");
    const db = new Database(dbPath, { readonly: true });

    let rows = db
      .prepare(
        `SELECT original_text, notes_json, writing_type, prefix_context, suffix_context
         FROM corrections
         WHERE writing_type = ? AND notes_json IS NOT NULL AND notes_json != '[]'
         ORDER BY created_at DESC LIMIT 30`
      )
      .all(type) as CorrectionRow[];

    if (rows.length < 15) {
      const supplement = db
        .prepare(
          `SELECT original_text, notes_json, writing_type, prefix_context, suffix_context
           FROM corrections
           WHERE writing_type != ? AND notes_json IS NOT NULL AND notes_json != '[]'
           ORDER BY created_at DESC LIMIT ${30 - rows.length}`
        )
        .all(type) as CorrectionRow[];
      rows = [...rows, ...supplement];
    }

    db.close();
    return rows;
  } catch (err) {
    console.error("Failed to load corrections:", (err as Error).message);
    return [];
  }
}

function loadHighSignalRules(): RuleRow[] {
  const dbPath = join(homedir(), ".margin/margin.db");
  if (!existsSync(dbPath)) return [];

  try {
    const Database = require("better-sqlite3");
    const db = new Database(dbPath, { readonly: true });
    const rows = db
      .prepare(
        `SELECT rule_text, severity, example_before, example_after, category, signal_count
         FROM writing_rules
         WHERE signal_count >= 2 OR severity = 'must-fix'
         ORDER BY signal_count DESC, severity ASC
         LIMIT 40`
      )
      .all() as RuleRow[];
    db.close();
    return rows;
  } catch {
    return [];
  }
}

function formatCorrection(c: CorrectionRow, index: number): string {
  let notes: string;
  try {
    const parsed = JSON.parse(c.notes_json);
    notes = Array.isArray(parsed)
      ? parsed.map((n: { text?: string }) => n.text ?? String(n)).join("; ")
      : String(parsed);
  } catch {
    notes = c.notes_json;
  }
  const ctx = c.prefix_context ? ` [context: "...${c.prefix_context}"]` : "";
  return `[${index + 1}] "${c.original_text}"${ctx} → ${notes}`;
}

function formatRules(rules: RuleRow[]): string {
  const byCategory = new Map<string, RuleRow[]>();
  for (const r of rules) {
    if (!byCategory.has(r.category)) byCategory.set(r.category, []);
    byCategory.get(r.category)!.push(r);
  }

  const lines: string[] = [];
  for (const [cat, catRules] of byCategory) {
    lines.push(`## ${cat}`);
    for (const r of catRules) {
      lines.push(`- [${r.severity}] ${r.rule_text}`);
      if (r.example_before) lines.push(`  ✗ "${r.example_before}"`);
      if (r.example_after) lines.push(`  ✓ "${r.example_after}"`);
    }
  }
  return lines.join("\n");
}

export function generate(type: string, prompt: string, register: string): string {
  const corrections = loadCorrections(type);
  const rules = loadHighSignalRules();

  const correctionBlock =
    corrections.length > 0
      ? `FLAGGED CORRECTIONS (avoid these patterns):\n${corrections.map((c, i) => formatCorrection(c, i)).join("\n")}`
      : "";

  const rulesBlock =
    rules.length > 0
      ? `HIGH-SIGNAL WRITING RULES:\n${formatRules(rules)}`
      : "";

  const hardProhibitions = `HARD PROHIBITIONS (never violate):
- Negative parallelism: "it's not X — it's Y" / "not about X, it's about Y"
- Em dash overuse: max 1-2 per piece
- AI slop intensifiers: "genuinely", "exactly", "actually" as fillers
- Filler colons: max 1 per prose piece`;

  const fullPrompt = `You are a writing assistant. Follow the rules and corrections below to produce output that matches the editor's voice.

${hardProhibitions}

${rulesBlock}

${correctionBlock}

---
Writing type: ${type}
Register: ${register}

Output ONLY the prose — no commentary, critique, word counts, or meta-discussion.

${prompt}`;

  try {
    const result = execSync("claude --print --model sonnet", {
      input: fullPrompt,
      encoding: "utf-8",
      timeout: 90_000,
      maxBuffer: 1024 * 1024,
      env: cleanEnv(),
    });
    return stripMetaCommentary(result.trim());
  } catch (err) {
    console.error("Generation failed:", (err as Error).message);
    return "";
  }
}
