/**
 * Architecture A: Rules-only (baseline).
 *
 * Loads all writing rules from SQLite (filtered by writing_type + register)
 * and injects them as text instructions into the coaching prompt.
 *
 * This is the simplest architecture and the baseline for comparison.
 * Prior results: ~52% pass rate.
 */

import { execSync } from "child_process";
import { typeConstraint, loadWritingRulesForType, stripMetaCommentary, cleanEnv, evalCmd } from "../../shared.ts";

export function generate(type: string, prompt: string, register: string): string {
  const rules = loadWritingRulesForType(type);

  const fullPrompt = `You are a writing assistant. Follow these writing rules precisely.

${rules}

---
Writing type: ${type}
Register: ${register}
${typeConstraint(type)}

Output ONLY the prose — no commentary, critique, word counts, or meta-discussion.

${prompt}`;

  try {
    const result = execSync(evalCmd(), {
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
