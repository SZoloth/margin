/**
 * Architecture B: Exemplars / few-shot learning.
 *
 * Shows Claude corrections as negative examples (flagged passages + why they
 * were corrected) rather than abstract rules. No explicit rule list.
 *
 * Inspired by Every.to's paired-example method. With only 14 polarity-tagged
 * corrections (all "corrective"), falls back to loading the 20 most recent
 * corrections filtered by writing_type when available.
 *
 * Prior results: ~56% pass rate (exemplars capture surface style but miss
 * structural patterns not represented in corrections).
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

function loadExemplars(type: string): CorrectionRow[] {
  const dbPath = join(homedir(), ".margin/margin.db");
  if (!existsSync(dbPath)) return [];

  try {
    const Database = require("better-sqlite3");
    const db = new Database(dbPath, { readonly: true });

    // Prefer type-filtered corrections (we have 100% writing_type coverage)
    let rows = db
      .prepare(
        `SELECT original_text, notes_json, writing_type, prefix_context, suffix_context
         FROM corrections
         WHERE writing_type = ? AND notes_json IS NOT NULL AND notes_json != '[]'
         ORDER BY created_at DESC LIMIT 20`
      )
      .all(type) as CorrectionRow[];

    // Fall back to general if not enough type-specific
    if (rows.length < 10) {
      rows = db
        .prepare(
          `SELECT original_text, notes_json, writing_type, prefix_context, suffix_context
           FROM corrections
           WHERE notes_json IS NOT NULL AND notes_json != '[]'
           ORDER BY created_at DESC LIMIT 20`
        )
        .all() as CorrectionRow[];
    }

    db.close();
    return rows;
  } catch (err) {
    console.error("Failed to load exemplars:", (err as Error).message);
    return [];
  }
}

function formatExemplar(c: CorrectionRow, index: number): string {
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
    ? `Context: "...${c.prefix_context}"`
    : "";

  return `Example ${index + 1} — FLAGGED PASSAGE:
"${c.original_text}"
${context ? context + "\n" : ""}Why it was flagged: ${notes}`;
}

export function generate(type: string, prompt: string, register: string): string {
  const exemplars = loadExemplars(type);

  if (exemplars.length === 0) {
    console.error("[arch-b] No exemplars found — falling back to unconstrained generation");
  }

  const exemplarBlock =
    exemplars.length > 0
      ? `PASSAGES THAT WERE FLAGGED AND CORRECTED\n\nStudy these. Avoid the patterns they represent.\n\n${exemplars.map((e, i) => formatExemplar(e, i)).join("\n\n---\n\n")}`
      : "";

  const fullPrompt = `You are a writing assistant. ${exemplarBlock ? "Study the flagged examples below and write in a way that avoids their patterns." : "Write with clarity, specificity, and directness."}

${exemplarBlock}

${exemplarBlock ? "---\n\n" : ""}Writing type: ${type}
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
