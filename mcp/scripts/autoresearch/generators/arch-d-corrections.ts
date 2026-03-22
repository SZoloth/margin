/**
 * Architecture D: Diff-based preference learning (corrections as context).
 *
 * Feeds Claude the raw correction diffs: "Sam changed THIS to THAT."
 * No explicit rules. The model learns the pattern directly from the
 * correction history, filtered by writing_type.
 *
 * Based on Lehmann's feedback.log concept and Dropbox's DSPy/GEPA approach:
 * preserve full correction context rather than abstracting into rules.
 *
 * Prior results: ~67% pass rate. Corrections > rules for concrete patterns,
 * but misses structural issues not captured in correction history.
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
  created_at: string;
}

function loadCorrections(type: string): CorrectionRow[] {
  const dbPath = join(homedir(), ".margin/margin.db");
  if (!existsSync(dbPath)) return [];

  try {
    const Database = require("better-sqlite3");
    const db = new Database(dbPath, { readonly: true });

    // Type-filtered first (we have 100% writing_type coverage)
    let rows = db
      .prepare(
        `SELECT original_text, notes_json, writing_type, prefix_context, suffix_context, created_at
         FROM corrections
         WHERE writing_type = ? AND notes_json IS NOT NULL AND notes_json != '[]'
         ORDER BY created_at DESC LIMIT 30`
      )
      .all(type) as CorrectionRow[];

    // Supplement with general corrections if fewer than 15 type-specific
    if (rows.length < 15) {
      const supplement = db
        .prepare(
          `SELECT original_text, notes_json, writing_type, prefix_context, suffix_context, created_at
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

  const context = c.prefix_context
    ? `\nContext before: "...${c.prefix_context}"`
    : "";

  return `[${index + 1}] Flagged: "${c.original_text}"${context}
    Editor note: ${notes}`;
}

export function generate(type: string, prompt: string, register: string): string {
  const corrections = loadCorrections(type);

  if (corrections.length === 0) {
    console.error("[arch-d] No corrections found — generating unconstrained");
  }

  const correctionBlock =
    corrections.length > 0
      ? `CORRECTION HISTORY — passages the editor flagged:\n\n${corrections.map((c, i) => formatCorrection(c, i)).join("\n\n")}`
      : "";

  const fullPrompt = `You are a writing assistant. ${correctionBlock ? "The editor has flagged the passages below in previous work. Learn from these corrections and avoid the same patterns." : "Write with clarity and directness."}

${correctionBlock}

${correctionBlock ? "---\n\n" : ""}Writing type: ${type}
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
