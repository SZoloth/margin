/**
 * Architecture: coached — the loop's mutation target.
 *
 * Reads coaching-prompt.md (the file the autoresearch loop rewrites each
 * iteration), substitutes {{RULES}} / {{TYPE}} / {{REGISTER}} / {{PROMPT}},
 * and generates. Without this generator the loop was mutating a dead file
 * and comparing noise against noise — every keep/revert decision was
 * evaluating the same underlying arch-a behavior.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import {
  typeConstraint,
  loadWritingRulesForType,
  stripMetaCommentary,
  cleanEnv,
  evalCmd,
} from "../../shared.ts";
import { execSync } from "child_process";

const COACHING_PROMPT_PATH = join(import.meta.dirname ?? ".", "..", "coaching-prompt.md");

export function generate(type: string, prompt: string, register: string): string {
  if (!existsSync(COACHING_PROMPT_PATH)) {
    console.error(`coaching-prompt.md not found at ${COACHING_PROMPT_PATH}`);
    return "";
  }

  const template = readFileSync(COACHING_PROMPT_PATH, "utf-8");
  const rules = loadWritingRulesForType(type);
  const constraint = typeConstraint(type);

  const fullPrompt = template
      .replace("{{RULES}}", rules)
      .replace("{{TYPE}}", type)
      .replace("{{REGISTER}}", register)
      .replace("{{PROMPT}}", (constraint ? constraint + "\n\n" : "") + prompt);

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
