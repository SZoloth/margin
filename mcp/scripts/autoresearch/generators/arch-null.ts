/**
 * Architecture Null: Zero-shot (null hypothesis).
 *
 * No rules, no corrections, no coaching. Just Claude writing with the
 * prompt and writing type. This is the null hypothesis for falsification:
 * if this scores within 5pp of the optimized pipeline, the entire
 * correction→rule→enforcement pipeline adds no measurable value.
 *
 * Expected result: ~25-35% pass rate (baseline unconstrained Claude).
 */

import { execSync } from "child_process";
import { stripMetaCommentary, cleanEnv } from "../../shared.ts";

export function generate(type: string, prompt: string, register: string): string {
  const fullPrompt = `Write the following.

Writing type: ${type}
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
