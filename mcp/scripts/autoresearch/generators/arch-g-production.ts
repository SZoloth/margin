/**
 * Architecture G (production): Uses the Go CLI `margin export coaching-prompt`
 * to generate the coaching context, then passes it to Claude for generation.
 *
 * This tests the ACTUAL production codepath — the same CLI command that
 * /writing-voice, /draft-text, and /writing-quality-gate invoke.
 *
 * Compare results against arch-e-hybrid.ts (TypeScript reference) to
 * validate production parity.
 */

import { execSync } from "child_process";
import { cleanEnv, stripMetaCommentary } from "../../shared.ts";

export function generate(type: string, prompt: string, register: string): string {
  // Step 1: Get coaching context from Go CLI (production codepath)
  let coachingContext: string;
  try {
    coachingContext = execSync(
      `margin export coaching-prompt --type ${type} --register ${register}`,
      { encoding: "utf-8", timeout: 10_000 }
    ).trim();
  } catch (err) {
    console.error("Failed to run margin export coaching-prompt:", (err as Error).message);
    return "";
  }

  if (!coachingContext) {
    console.error("Empty coaching context from CLI");
    return "";
  }

  // Step 2: Generate with Claude using the coaching context
  const fullPrompt = `${coachingContext}\n\n${prompt}`;

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
