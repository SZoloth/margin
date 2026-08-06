#!/usr/bin/env npx tsx

/**
 * Autoresearch loop for the /writing-voice skill (SKILL.md).
 *
 * Iteratively improves SKILL.md by:
 * 1. Running a full eval using arch-skill (SKILL.md + coaching-prompt)
 * 2. Asking an LLM to propose one change to SKILL.md
 * 3. Validating the change didn't break required elements
 * 4. Keeping if pass rate improved, reverting if not
 *
 * Usage:
 *   npx tsx skill-loop.ts --baseline          # Run baseline only
 *   npx tsx skill-loop.ts --max 10            # Run up to 10 iterations
 *   npx tsx skill-loop.ts                     # Default: 5 iterations
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { cleanEnv } from "../shared.ts";
import type { EvalResult } from "./score.ts";

const SKILL_PATH = join(homedir(), ".claude/skills/writing-voice/SKILL.md");
const RESULTS_PATH = join(import.meta.dirname ?? ".", "skill-results.tsv");
const EVAL_PATH = join(import.meta.dirname ?? ".", "eval.ts");

// ── Args ─────────────────────────────────────────────────────────────

function parseArgs(): { baseline: boolean; max: number } {
  const args = process.argv.slice(2);
  const baseline = args.includes("--baseline");
  const maxIdx = args.indexOf("--max");
  const max = maxIdx !== -1 && args[maxIdx + 1] ? parseInt(args[maxIdx + 1], 10) : 5;
  return { baseline, max };
}

// ── Eval runner ──────────────────────────────────────────────────────

function runEval(): EvalResult | null {
  try {
    const output = execSync(`npx tsx ${EVAL_PATH} --arch skill`, {
      encoding: "utf-8",
      timeout: 1_200_000, // 20 min
      maxBuffer: 10 * 1024 * 1024,
      env: cleanEnv(),
      stdio: ["pipe", "pipe", "inherit"],
    });
    return JSON.parse(output) as EvalResult;
  } catch (err) {
    console.error("Eval failed:", (err as Error).message);
    return null;
  }
}

// ── SKILL.md mutation ────────────────────────────────────────────────

function proposeChange(
  currentSkill: string,
  evalResult: EvalResult
): string | null {
  const worstViolations = evalResult.worst_violations.slice(0, 10).join("\n");
  const perTypeReport = Object.entries(evalResult.per_type)
    .map(([type, summary]) => `${type}: pass=${summary.passRate}, mechAvg=${summary.avgMechanical}, dimAvg=${summary.avgDimension}`)
    .join("\n");

  const prompt = `You are improving a writing skill file (SKILL.md) for Claude Code.
The skill instructs Claude how to write in a specific voice.

Current eval results:
- Overall pass rate: ${evalResult.pass_rate}
- Mean dimension score: ${evalResult.mean_dimension}
- Total mechanical issues: ${evalResult.total_mechanical}

Per-type breakdown:
${perTypeReport}

Worst violations (most frequent):
${worstViolations}

Current SKILL.md:
<skill>
${currentSkill}
</skill>

Propose EXACTLY ONE change to the SKILL.md instructions that would reduce the most common violations above. The change should be a modification to existing instruction text, an added bullet point, or rephrasing for clarity.

Rules:
- The file MUST start with exactly \`---\` on the first line (YAML frontmatter). Copy the frontmatter block verbatim from the current file.
- Do NOT remove the \`margin export coaching-prompt\` command
- Do NOT remove the \`margin rules create\` command
- Do NOT remove the \`margin export profile\` command
- Do NOT add new sections — modify existing ones
- Keep it concise — one targeted change

Output the COMPLETE updated SKILL.md file starting with \`---\`. No markdown fences, no commentary before or after — just the raw file content.`;

  try {
    const result = execSync("claude --print --model sonnet", {
      input: prompt,
      encoding: "utf-8",
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
      env: cleanEnv(),
    });
    let cleaned = result.trim();
    // Strip markdown fences if Sonnet wraps the output
    cleaned = cleaned.replace(/^```(?:markdown|md|yaml)?\n/, "").replace(/\n```$/, "");
    return cleaned.trim();
  } catch (err) {
    console.error("Proposal failed:", (err as Error).message);
    return null;
  }
}

function validateSkillMd(content: string): boolean {
  if (!content.startsWith("---")) {
    console.error("Validation failed: missing frontmatter");
    return false;
  }
  if (!content.includes("margin export coaching-prompt")) {
    console.error("Validation failed: missing coaching-prompt command");
    return false;
  }
  if (!content.includes("margin rules create")) {
    console.error("Validation failed: missing rules create command");
    return false;
  }
  if (!content.includes("margin export profile")) {
    console.error("Validation failed: missing export profile command");
    return false;
  }
  if (content.length < 500) {
    console.error("Validation failed: suspiciously short");
    return false;
  }
  return true;
}

// ── Results logging ──────────────────────────────────────────────────

function initResultsFile(): void {
  if (!existsSync(RESULTS_PATH)) {
    writeFileSync(
      RESULTS_PATH,
      "iteration\tpass_rate\tmean_dim\ttotal_mech\tduration_s\taction\n"
    );
  }
}

function logResult(
  iteration: number,
  result: EvalResult,
  action: string
): void {
  appendFileSync(
    RESULTS_PATH,
    `${iteration}\t${result.pass_rate}\t${result.mean_dimension}\t${result.total_mechanical}\t${result.duration_seconds}\t${action}\n`
  );
}

// ── Main loop ────────────────────────────────────────────────────────

const { baseline, max } = parseArgs();

initResultsFile();

console.error("=== Skill Autoresearch Loop ===\n");
console.error("Running baseline eval...\n");

const baselineResult = runEval();
if (!baselineResult) {
  console.error("Baseline eval failed — aborting");
  process.exit(1);
}

console.error(
  `\nBaseline: pass=${baselineResult.pass_rate}, dim=${baselineResult.mean_dimension}, mech=${baselineResult.total_mechanical}\n`
);
logResult(0, baselineResult, "baseline");

if (baseline) {
  console.log(JSON.stringify(baselineResult, null, 2));
  process.exit(0);
}

let bestPassRate = baselineResult.pass_rate;
let bestResult = baselineResult;

for (let i = 1; i <= max; i++) {
  console.error(`\n--- Iteration ${i}/${max} ---\n`);

  const currentSkill = readFileSync(SKILL_PATH, "utf-8");

  // Propose a change
  console.error("Proposing change...");
  const proposed = proposeChange(currentSkill, bestResult);
  if (!proposed) {
    console.error("Proposal failed — skipping iteration");
    continue;
  }

  // Validate
  if (!validateSkillMd(proposed)) {
    console.error("Proposed change failed validation — skipping");
    logResult(i, bestResult, "invalid-proposal");
    continue;
  }

  // Apply change
  writeFileSync(SKILL_PATH, proposed);
  console.error("Applied proposed change");

  // Eval
  console.error("Evaluating...");
  const iterResult = runEval();
  if (!iterResult) {
    console.error("Eval failed — reverting");
    writeFileSync(SKILL_PATH, currentSkill);
    logResult(i, bestResult, "eval-failed-reverted");
    continue;
  }

  console.error(
    `Result: pass=${iterResult.pass_rate}, dim=${iterResult.mean_dimension}, mech=${iterResult.total_mechanical}`
  );

  // Keep or revert
  if (iterResult.pass_rate >= bestPassRate) {
    console.error(`KEPT (${bestPassRate} → ${iterResult.pass_rate})`);
    bestPassRate = iterResult.pass_rate;
    bestResult = iterResult;
    logResult(i, iterResult, "kept");
  } else {
    console.error(
      `REVERTED (${iterResult.pass_rate} < ${bestPassRate})`
    );
    writeFileSync(SKILL_PATH, currentSkill);
    logResult(i, iterResult, "reverted");
  }
}

console.error(`\n=== Done. Best pass rate: ${bestPassRate} ===\n`);
console.log(JSON.stringify(bestResult, null, 2));
