/**
 * Architecture C-crit-rules: two-pass editor where pass 2 critiques the
 * draft against the rule list, then revises (humanizer + rules combined).
 *
 * Pass 1: unconstrained draft (identical to arch-c).
 * Pass 2: identify which specific rules the draft violates, then revise
 *         to fix them.
 *
 * Hypothesis: arch-c's edit pass underperforms because the model must
 * hold the whole rule list and the draft simultaneously. An explicit
 * violation-identification step focuses the edit — the critique does the
 * matching, the revision does the fixing. Most likely variant to beat
 * arch-c's 66.7% / 16-mech.
 *
 * Costs 2 LLM calls per sample.
 */

import { execSync } from "child_process";
import { typeConstraint, loadWritingRulesForType, stripMetaCommentary, cleanEnv, evalCmd } from "../../shared.ts";

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

function critiqueAgainstRules(draft: string, type: string, register: string): string {
  const rules = loadWritingRulesForType(type);

  const fullPrompt = `You are an editor. Work in two steps.

Step 1 — Read the draft against the writing rules below and silently identify every rule it violates.
Step 2 — Revise the draft to fix exactly those violations. Make minimal changes; preserve the meaning and structure. Fix only what violates a rule.

WRITING RULES:
${rules}

---

DRAFT:
${draft}

---

Output ONLY the revised prose — no violation list, no commentary, no explanations, no tracking changes.`;

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
      console.error("[arch-c-crit-rules] Pass 1 (generation) failed");
      return "";
    }

    const edited = critiqueAgainstRules(draft, type, register);
    if (!edited) {
      console.error("[arch-c-crit-rules] Pass 2 (critique) failed — returning draft");
      return draft;
    }

    return edited;
  } catch (err) {
    console.error("Generation failed:", (err as Error).message);
    return "";
  }
}
