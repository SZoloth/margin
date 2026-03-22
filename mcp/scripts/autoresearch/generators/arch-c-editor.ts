/**
 * Architecture C: Two-pass editor.
 *
 * Pass 1: Claude writes freely with no constraints.
 * Pass 2: Claude edits the draft to comply with writing rules.
 *
 * Hypothesis: separating generation from compliance editing produces
 * better output than constrained generation. The edit pass is more
 * aggressive because it's not fighting the generation process.
 *
 * Costs 2 LLM calls per sample.
 * Prior results: ~63% pass rate.
 */

import { execSync } from "child_process";
import { loadWritingRulesForType, stripMetaCommentary, cleanEnv } from "../../shared.ts";

function generateUnconstrained(type: string, prompt: string, register: string): string {
  const fullPrompt = `Write the following. Be clear, direct, and specific.

Writing type: ${type}
Register: ${register}

Output ONLY the prose — no commentary, critique, word counts, or meta-discussion.

${prompt}`;

  const result = execSync("claude --print --model sonnet", {
    input: fullPrompt,
    encoding: "utf-8",
    timeout: 90_000,
    maxBuffer: 1024 * 1024,
    env: cleanEnv(),
  });
  return stripMetaCommentary(result.trim());
}

function editWithRules(draft: string, type: string, register: string): string {
  const rules = loadWritingRulesForType(type);

  const fullPrompt = `You are an editor. Revise the draft below to comply with the writing rules. Make minimal changes — only what's needed to fix violations. Preserve the meaning and structure.

WRITING RULES:
${rules}

---

DRAFT TO EDIT:
${draft}

---

Output ONLY the revised prose — no commentary, explanations, or tracking changes.`;

  const result = execSync("claude --print --model sonnet", {
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
      console.error("[arch-c] Pass 1 (generation) failed");
      return "";
    }

    const edited = editWithRules(draft, type, register);
    if (!edited) {
      console.error("[arch-c] Pass 2 (editing) failed — returning draft");
      return draft;
    }

    return edited;
  } catch (err) {
    console.error("Generation failed:", (err as Error).message);
    return "";
  }
}
