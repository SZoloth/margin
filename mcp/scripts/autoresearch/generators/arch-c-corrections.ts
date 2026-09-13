/**
 * Architecture C variant: Two-pass editor against correction history.
 *
 * Pass 1: Claude writes freely with no constraints (same as arch-c).
 * Pass 2: Claude edits the draft using Sam's raw correction diffs
 *         ("flagged THIS, note said THAT") instead of the rule dump.
 *
 * Hypothesis: the editor pass is the strongest architecture (66.7% under
 * the repaired checker), and corrections beat rules as a data layer in
 * single-pass tests (51.9% vs 25.9%). Editing against concrete diffs
 * should outperform editing against abstracted rules.
 *
 * Costs 2 LLM calls per sample.
 */

import { execSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { createRequire } from "module";
import { typeConstraint, CORRECTION_FILTER, stripMetaCommentary, cleanEnv, evalCmd } from "../../shared.ts";

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

    let rows = db
      .prepare(
        `SELECT original_text, notes_json, writing_type, prefix_context, suffix_context, created_at
         FROM corrections
         WHERE writing_type = ? AND ${CORRECTION_FILTER}
         ORDER BY created_at DESC LIMIT 30`
      )
      .all(type) as CorrectionRow[];

    if (rows.length < 15) {
      const supplement = db
        .prepare(
          `SELECT original_text, notes_json, writing_type, prefix_context, suffix_context, created_at
           FROM corrections
           WHERE writing_type != ? AND ${CORRECTION_FILTER}
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

function generateUnconstrained(type: string, prompt: string, register: string): string {
  const fullPrompt = `Write the following. Be clear, direct, and specific.

Writing type: ${type}
Register: ${register}
${typeConstraint(type)}

Output ONLY the prose — no commentary, critique, word counts, or meta-discussion.

${prompt}`;

  const result = execSync(evalCmd(), {
    input: fullPrompt,
    encoding: "utf-8",
    timeout: 90_000,
    maxBuffer: 1024 * 1024,
    env: cleanEnv(),
  });
  return stripMetaCommentary(result.trim());
}

function editWithCorrections(draft: string, type: string): string {
  const corrections = loadCorrections(type);

  const correctionBlock =
    corrections.length > 0
      ? `CORRECTION HISTORY — passages the editor flagged in previous work, with their notes. Infer the editing standards from these examples and apply them to the draft:\n\n${corrections.map((c, i) => formatCorrection(c, i)).join("\n\n")}`
      : "";

  const fullPrompt = `You are an editor. Revise the draft below to match the standards shown in the correction history. Make minimal changes — only what's needed to fix patterns the editor has flagged before. Preserve the meaning and structure.

${correctionBlock}

---

DRAFT TO EDIT:
${draft}

---

Output ONLY the revised prose — no commentary, explanations, or tracking changes.`;

  const result = execSync(evalCmd(), {
    input: fullPrompt,
    encoding: "utf-8",
    timeout: 90_000,
    maxBuffer: 1024 * 1024,
    env: cleanEnv(),
  });
  return stripMetaCommentary(result.trim());
}

export function generate(type: string, prompt: string, register: string): string {
  try {
    const draft = generateUnconstrained(type, prompt, register);
    if (!draft) {
      console.error("[arch-c-corr] Pass 1 (generation) failed");
      return "";
    }

    const edited = editWithCorrections(draft, type);
    if (!edited) {
      console.error("[arch-c-corr] Pass 2 (editing) failed — returning draft");
      return draft;
    }

    return edited;
  } catch (err) {
    console.error("Generation failed:", (err as Error).message);
    return "";
  }
}
