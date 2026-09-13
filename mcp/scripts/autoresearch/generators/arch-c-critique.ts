/**
 * Architecture C-critique: two-pass editor where pass 2 self-critiques
 * instead of editing against the rule list (humanizer pattern).
 *
 * Pass 1: unconstrained draft (identical to arch-c).
 * Pass 2: "what makes this draft read as AI-generated?" → revise.
 *
 * Ablation for the arch-c win: if generic self-critique approaches
 * arch-c's 66.7%, the rule layer's value at edit time weakens. If it
 * flops, the rules are doing the work in pass 2, not the two-pass
 * structure itself.
 *
 * Costs 2 LLM calls per sample.
 */

import { execSync } from "child_process";
import { typeConstraint, stripMetaCommentary, cleanEnv, evalCmd } from "../../shared.ts";

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

function critiqueAndRevise(draft: string, type: string, register: string): string {
  const fullPrompt = `You are an editor with a sharp ear for AI-generated prose. Below is a draft (${type}, ${register} register).

Step 1 — Silently list everything that makes this draft read as machine-written: formulaic openers, empty intensifiers, hedge stacks, uniform sentence rhythm, triadic structures, "it's not X, it's Y" pivots, abstract conclusions, and anything no person would actually say.

Step 2 — Revise the draft to remove every item on your list. Keep the meaning and the strong parts. Make it read like a specific human wrote it.

DRAFT:
${draft}

---

Output ONLY the revised prose — no critique, no list, no commentary, no explanations.`;

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
      console.error("[arch-c-critique] Pass 1 (generation) failed");
      return "";
    }

    const edited = critiqueAndRevise(draft, type, register);
    if (!edited) {
      console.error("[arch-c-critique] Pass 2 (critique) failed — returning draft");
      return draft;
    }

    return edited;
  } catch (err) {
    console.error("Generation failed:", (err as Error).message);
    return "";
  }
}
