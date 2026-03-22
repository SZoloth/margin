/**
 * Architecture D-chrono: Lehmann chronological accumulation variant.
 *
 * Loads corrections oldest-first rather than newest-first. Tests Lehmann's
 * "feedback.log" hypothesis: corrections accumulate like a learning diary,
 * and chronological order provides narrative context that helps the model
 * understand the pattern of improvement over time.
 *
 * Hypothesis: chronological ordering mimics how humans internalize feedback,
 * creating a "story of improvement" that helps the model generalize better.
 * Prior arch-d (newest-first): ~78%. If chrono matches or exceeds, Lehmann confirmed.
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
  created_at: string;
}

function loadCorrectionsChronological(type: string): CorrectionRow[] {
  const dbPath = join(homedir(), ".margin/margin.db");
  if (!existsSync(dbPath)) return [];

  try {
    const Database = require("better-sqlite3");
    const db = new Database(dbPath, { readonly: true });

    // Oldest-first: accumulation style (Lehmann method)
    let rows = db
      .prepare(
        `SELECT original_text, notes_json, writing_type, prefix_context, created_at
         FROM corrections
         WHERE writing_type = ? AND notes_json IS NOT NULL AND notes_json != '[]'
         ORDER BY created_at ASC LIMIT 30`
      )
      .all(type) as CorrectionRow[];

    if (rows.length < 15) {
      const supplement = db
        .prepare(
          `SELECT original_text, notes_json, writing_type, prefix_context, created_at
           FROM corrections
           WHERE writing_type != ? AND notes_json IS NOT NULL AND notes_json != '[]'
           ORDER BY created_at ASC LIMIT ${30 - rows.length}`
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
  const corrections = loadCorrectionsChronological(type);

  if (corrections.length === 0) {
    console.error("[arch-d-chrono] No corrections found — generating unconstrained");
  }

  const correctionBlock =
    corrections.length > 0
      ? `CORRECTION HISTORY (chronological — oldest to newest) — passages the editor flagged:\n\n${corrections.map((c, i) => formatCorrection(c, i)).join("\n\n")}`
      : "";

  const fullPrompt = `You are a writing assistant. ${correctionBlock ? "The editor has flagged the passages below over time. This is a learning log showing how the editor's taste evolved. Learn from these corrections and avoid the same patterns." : "Write with clarity and directness."}

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
