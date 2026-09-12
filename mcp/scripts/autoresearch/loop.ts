#!/usr/bin/env npx tsx

/**
 * Autoresearch orchestrator.
 * Modify coaching-prompt.md → eval → keep/revert → repeat.
 * Domain-agnostic infrastructure — knows about files, metrics, and git.
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";
import { cleanEnv, evalCmd } from "../shared.ts";
import type { EvalResult } from "./eval.ts";

// ── Config ─────────────────────────────────────────────────────────────

const DIR = import.meta.dirname ?? ".";
const COACHING_PROMPT_PATH = join(DIR, "coaching-prompt.md");
const RESULTS_PATH = join(DIR, "results.tsv");
const IDEAS_PATH = join(DIR, "ideas.md");
const SESSION_PATH = join(DIR, "session.md");
const LAST_EVAL_PATH = join(DIR, "last-eval.json");
const KEPT_EVAL_PATH = join(DIR, "kept-eval.json");
const PROGRAM_PATH = join(DIR, "program.md");
const EVAL_SCRIPT = join(DIR, "eval.ts");

// ── Helpers ────────────────────────────────────────────────────────────

function readFile(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf-8") : "";
}

interface ResultsState {
  nextRun: number;
  best: { passRate: number; meanDimension: number };
  hasKept: boolean;
  lastN: string;
}

const LOOP_ARCH = "coached";

function parseResults(n: number = 10): ResultsState {
  if (!existsSync(RESULTS_PATH)) {
    return { nextRun: 1, best: { passRate: 0, meanDimension: 0 }, hasKept: false, lastN: "(no results yet)" };
  }
  const lines = readFileSync(RESULTS_PATH, "utf-8").trim().split("\n");
  const header = lines[0];
  const dataLines = lines.slice(1).filter((l) => l.trim());

  // Next run number
  let nextRun = 1;
  if (dataLines.length > 0) {
    const lastRun = parseInt(dataLines[dataLines.length - 1].split("\t")[0], 10);
    nextRun = (isNaN(lastRun) ? 0 : lastRun) + 1;
  }

  // Best kept result — scoped to current provider AND arch. Scores aren't
  // comparable across generators or eval targets; a poolside run must never
  // be judged against a claude-era best, nor a coached run against an
  // arch-a noise number. Missing provider col → claude; missing arch col → "a".
  const provider = evalCmd();
  let best = { passRate: 0, meanDimension: 0 };
  let hasKept = false;
  for (const line of dataLines) {
    const cols = line.split("\t");
    const rowProvider = cols[8] ?? "claude --print --model sonnet";
    const rowArch = cols[9] ?? "a";
    if (rowProvider !== provider || rowArch !== LOOP_ARCH) continue;
    if (cols[5] === "true") {
      hasKept = true;
      const passRate = parseFloat(cols[1]);
      const meanDim = parseFloat(cols[2]);
      if (!isNaN(passRate) && passRate >= best.passRate) {
        if (passRate > best.passRate || (!isNaN(meanDim) && meanDim > best.meanDimension)) {
          best = { passRate, meanDimension: isNaN(meanDim) ? 0 : meanDim };
        }
      }
    }
  }

  // Last N rows
  const tail = dataLines.slice(-n);
  const lastN = [header, ...tail].join("\n");

  return { nextRun, best, hasKept, lastN };
}

function runEval(): EvalResult {
  console.log("Running evaluation...");
  const result = execSync(`npx tsx ${EVAL_SCRIPT} --arch coached`, {
    encoding: "utf-8",
    timeout: 600_000, // 10 min max
    maxBuffer: 10 * 1024 * 1024,
    env: cleanEnv(),
    cwd: DIR,
  });

  // eval.ts logs progress to stderr, JSON to stdout
  // execSync captures stdout only
  return JSON.parse(result);
}

function gitCommit(message: string): void {
  try {
    const repoRoot = join(DIR, "../../..");
    // -o/--only: commit only the named paths — never sweep other agents'
    // staged work into an experiment commit.
    const paths = [COACHING_PROMPT_PATH, RESULTS_PATH, SESSION_PATH, IDEAS_PATH, LAST_EVAL_PATH, KEPT_EVAL_PATH]
      .map((p) => `"${p}"`)
      .join(" ");
    // add first so untracked files (e.g. first kept-eval.json) become
    // committable; -o/--only still scopes the commit to these paths alone.
    execSync(`git add -- ${paths} && git commit -o -F - -- ${paths}`, {
      input: message,
      cwd: repoRoot,
      encoding: "utf-8",
    });
  } catch (err) {
    console.error("Git commit failed:", (err as Error).message);
  }
}

function gitRevert(): void {
  try {
    execSync(`git checkout -- ${COACHING_PROMPT_PATH}`, {
      cwd: join(DIR, "../../.."),
      encoding: "utf-8",
    });
  } catch (err) {
    console.error("Git revert failed:", (err as Error).message);
  }
}

function initResultsTsv(): void {
  if (!existsSync(RESULTS_PATH)) {
    writeFileSync(
      RESULTS_PATH,
      "run\tpass_rate\tmean_dimension\ttotal_mechanical\thypothesis\tkept\tnotes\ttimestamp\tprovider\tarch\n"
    );
  }
}

function appendResult(
  run: number,
  evalResult: EvalResult,
  hypothesis: string,
  kept: boolean,
  notes: string
): void {
  const row = [
    run,
    evalResult.pass_rate,
    evalResult.mean_dimension,
    evalResult.total_mechanical,
    hypothesis.replace(/\t/g, " ").replace(/\n/g, " "),
    kept,
    notes.replace(/\t/g, " ").replace(/\n/g, " "),
    new Date().toISOString(),
    evalCmd(),
    LOOP_ARCH,
  ].join("\t");
  appendFileSync(RESULTS_PATH, row + "\n");
}

function updateSession(run: number, evalResult: EvalResult, hypothesis: string, kept: boolean): void {
  const entry = `\n### Run ${String(run).padStart(3, "0")} — ${new Date().toISOString().slice(0, 16)}\n- Hypothesis: ${hypothesis}\n- Pass rate: ${evalResult.pass_rate} | Dim: ${evalResult.mean_dimension} | Mech: ${evalResult.total_mechanical}\n- Result: ${kept ? "KEPT" : "REVERTED"}\n`;

  const current = readFile(SESSION_PATH);
  const historyMarker = "## History";
  if (current.includes(historyMarker)) {
    const [before, after] = current.split(historyMarker);
    writeFileSync(SESSION_PATH, `${before}${historyMarker}\n${entry}${after ? after.replace(/^\n*/, "\n") : "\n"}`);
  } else {
    appendFileSync(SESSION_PATH, `\n${historyMarker}\n${entry}`);
  }
}

function appendIdeas(newIdeas: string): void {
  if (!newIdeas.trim()) return;
  appendFileSync(IDEAS_PATH, "\n" + newIdeas.trim() + "\n");
}

// ── Eval feedback channel ──────────────────────────────────────────────
// Persist per-run detail so the next mutation sees *why* the last prompt
// failed (violation labels + per-type scores), not just the scalar result.

interface LastEvalSummary {
  pass_rate: number;
  mean_dimension: number;
  total_mechanical: number;
  worst_violations: string[];
  per_type: Record<string, { passed: number; total: number; mean_dimension: number }>;
}

function writeLastEval(evalResult: EvalResult): void {
  const summary: LastEvalSummary = {
    pass_rate: evalResult.pass_rate,
    mean_dimension: evalResult.mean_dimension,
    total_mechanical: evalResult.total_mechanical,
    worst_violations: evalResult.worst_violations ?? [],
    per_type: evalResult.per_type ?? {},
  };
  writeFileSync(LAST_EVAL_PATH, JSON.stringify(summary, null, 2));
}

function readLastEval(): LastEvalSummary | null {
  try {
    return JSON.parse(readFileSync(LAST_EVAL_PATH, "utf-8"));
  } catch {
    return null;
  }
}

// kept-eval.json records the incumbent prompt's eval — floors compare a
// candidate against what it would *revert to*, not the last attempt.
function writeKeptEval(evalResult: EvalResult): void {
  const summary: LastEvalSummary = {
    pass_rate: evalResult.pass_rate,
    mean_dimension: evalResult.mean_dimension,
    total_mechanical: evalResult.total_mechanical,
    worst_violations: evalResult.worst_violations ?? [],
    per_type: evalResult.per_type ?? {},
  };
  writeFileSync(KEPT_EVAL_PATH, JSON.stringify(summary, null, 2));
}

function readKeptEval(): LastEvalSummary | null {
  try {
    return JSON.parse(readFileSync(KEPT_EVAL_PATH, "utf-8"));
  } catch {
    return null;
  }
}

// A candidate must not collapse any writing type: allow 1-sample wobble
// (n=3 noise budget) but forbid dropping ≥2 samples or a type hitting 0
// that wasn't already at 0. This is the slack-regression guard.
function perTypeFloorsHold(
  cur: LastEvalSummary["per_type"],
  base: LastEvalSummary["per_type"] | undefined
): { ok: boolean; regressions: string[] } {
  if (!base) return { ok: true, regressions: [] };
  const regressions: string[] = [];
  for (const [t, b] of Object.entries(base)) {
    const c = cur[t];
    if (!c || b.passed === 0) continue;
    if (c.passed < Math.max(b.passed - 1, 1)) {
      regressions.push(`${t}: ${b.passed}/${b.total} → ${c.passed}/${c.total}`);
    }
  }
  return { ok: regressions.length === 0, regressions };
}

// ── Agent call ─────────────────────────────────────────────────────────

function callAgent(
  currentPrompt: string,
  lastResults: string,
  worstViolations: string[],
  perType: LastEvalSummary["per_type"] | undefined,
  ideas: string
): { prompt: string; hypothesis: string; newIdeas: string } {
  const program = readFile(PROGRAM_PATH);

  const agentPrompt = `${program}

---

## Current state

### Current coaching prompt
\`\`\`
${currentPrompt}
\`\`\`

### Last 10 results
\`\`\`
${lastResults}
\`\`\`

### Worst violations from last eval
${worstViolations.length > 0 ? worstViolations.map((v) => `- ${v}`).join("\n") : "(none — this is the baseline or previous run had no violations)"}

### Per-type results from last eval
${perType && Object.keys(perType).length > 0 ? Object.entries(perType).map(([t, r]) => `- ${t}: ${r.passed}/${r.total} passed, mean dim ${r.mean_dimension.toFixed(1)}`).join("\n") : "(none — no prior eval detail)"}
Note: casual types (general, email, slack, outreach) and professional types (pitch, prd, cover-letter, resume, blog) may need different coaching. A prompt change that helps one register but regresses the other is a net loss — check the per-type table.

### Ideas backlog
${ideas || "(empty)"}

---

Based on the above, propose your next modification to coaching-prompt.md. Remember: one hypothesis, output between <prompt> tags, hypothesis in <hypothesis> tags, optional <ideas> for deferred hypotheses.`;

  const result = execSync(evalCmd(), {
    input: agentPrompt,
    encoding: "utf-8",
    timeout: 120_000,
    maxBuffer: 2 * 1024 * 1024,
    env: cleanEnv(),
  });

  // Parse response
  const hypothesisMatch = result.match(/<hypothesis>([\s\S]*?)<\/hypothesis>/);
  const promptMatch = result.match(/<prompt>([\s\S]*?)<\/prompt>/);
  const ideasMatch = result.match(/<ideas>([\s\S]*?)<\/ideas>/);

  if (!promptMatch) {
    throw new Error("Agent did not return a <prompt> block");
  }

  const newPrompt = promptMatch[1].trim();

  // Validate placeholders
  const required = ["{{RULES}}", "{{TYPE}}", "{{REGISTER}}", "{{PROMPT}}"];
  for (const placeholder of required) {
    if (!newPrompt.includes(placeholder)) {
      throw new Error(`Agent prompt missing required placeholder: ${placeholder}`);
    }
  }

  return {
    prompt: newPrompt,
    hypothesis: hypothesisMatch ? hypothesisMatch[1].trim() : "no hypothesis provided",
    newIdeas: ideasMatch ? ideasMatch[1].trim() : "",
  };
}

// ── Main loop ──────────────────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2);
  const maxIterations = args.includes("--max")
    ? parseInt(args[args.indexOf("--max") + 1], 10)
    : Infinity;
  const baselineOnly = args.includes("--baseline");

  initResultsTsv();

  // Experiments never run on main — repo policy is worktree/branch
  // isolation, and the loop auto-commits. Auto-create a dated branch.
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: join(DIR, "../../.."),
      encoding: "utf-8",
    }).trim();
    if (branch === "main") {
      const expBranch = `autoresearch/loop-${new Date().toISOString().slice(0, 10)}`;
      execSync(`git checkout -b ${expBranch}`, { cwd: join(DIR, "../../.."), encoding: "utf-8" });
      console.log(`On main — switched to ${expBranch} for experiment commits.`);
    }
  } catch (err) {
    console.error("Branch check failed:", (err as Error).message);
  }

  const initial = parseResults();

  // Baseline: first run ever, explicit --baseline, or no kept row for this
  // provider+arch (the auto-keep bug: an empty scoped history made the
  // first mutation the "best" no matter how bad).
  if (initial.nextRun === 1 || baselineOnly || !initial.hasKept) {
    console.log("Running baseline evaluation...");
    const evalResult = runEval();
    writeLastEval(evalResult);
    writeKeptEval(evalResult);
    appendResult(initial.nextRun, evalResult, `baseline (${evalCmd()} / ${LOOP_ARCH})`, true, "provider+arch baseline");
    updateSession(initial.nextRun, evalResult, "baseline", true);
    gitCommit(`autoresearch: baseline run ${String(initial.nextRun).padStart(3, "0")}`);
    console.log(`Baseline: pass_rate=${evalResult.pass_rate}, dim=${evalResult.mean_dimension}, mech=${evalResult.total_mechanical}`);

    if (baselineOnly) {
      console.log("Baseline recorded. Exiting.");
      return;
    }
  }

  // Main loop
  let iteration = 0;
  while (iteration < maxIterations) {
    const state = parseResults();
    const currentRun = state.nextRun;
    iteration++;

    console.log(`\n${"=".repeat(60)}`);
    console.log(`Run ${String(currentRun).padStart(3, "0")} (iteration ${iteration})`);
    console.log("=".repeat(60));

    const currentPrompt = readFile(COACHING_PROMPT_PATH);
    const best = state.best;
    const ideas = readFile(IDEAS_PATH);

    // Last eval's failure detail — the "which rules fired" channel the
    // mutating agent needs to aim hypotheses instead of guessing.
    const lastEval = readLastEval();
    const lastWorstViolations = lastEval?.worst_violations ?? [];
    const perType = lastEval?.per_type;

    // Step 1: Ask agent for modification
    console.log("Asking agent for next modification...");
    let agentResult;
    try {
      agentResult = callAgent(currentPrompt, state.lastN, lastWorstViolations, perType, ideas);
    } catch (err) {
      console.error("Agent call failed:", (err as Error).message);
      console.log("Waiting 30s before retry...");
      execSync("sleep 30");
      continue;
    }

    console.log(`Hypothesis: ${agentResult.hypothesis}`);

    // Step 2: Write new coaching prompt
    const backupPrompt = currentPrompt;
    writeFileSync(COACHING_PROMPT_PATH, agentResult.prompt);

    // Step 3: Append any new ideas
    if (agentResult.newIdeas) {
      appendIdeas(agentResult.newIdeas);
    }

    // Step 4: Evaluate
    let evalResult: EvalResult;
    try {
      evalResult = runEval();
    } catch (err) {
      console.error("Eval failed:", (err as Error).message);
      writeFileSync(COACHING_PROMPT_PATH, backupPrompt);
      const failedResult: EvalResult = { arch: LOOP_ARCH, pass_rate: 0, mean_dimension: 0, total_mechanical: 99, worst_violations: [], per_type: {}, total_samples: 0, duration_seconds: 0, samples: [] };
      appendResult(currentRun, failedResult, agentResult.hypothesis, false, "eval failed");
      updateSession(currentRun, failedResult, agentResult.hypothesis, false);
      continue;
    }

    writeLastEval(evalResult);
    console.log(`Result: pass_rate=${evalResult.pass_rate}, dim=${evalResult.mean_dimension}, mech=${evalResult.total_mechanical}`);

    // Step 5: Keep or revert — scalar gate AND per-type floors against the
    // incumbent (kept-eval), so a net win can't hide a register collapse.
    const improved = evalResult.pass_rate > best.passRate;
    const equalButNotWorse = evalResult.pass_rate === best.passRate && evalResult.mean_dimension >= (best.meanDimension - 2);
    const floors = perTypeFloorsHold(evalResult.per_type, readKeptEval()?.per_type);
    const kept = (improved || (equalButNotWorse && evalResult.pass_rate > 0)) && floors.ok;

    if (kept) {
      console.log(`KEPT — pass_rate improved or held (${best.passRate} → ${evalResult.pass_rate})`);
      writeKeptEval(evalResult);
      appendResult(currentRun, evalResult, agentResult.hypothesis, true, "");
      updateSession(currentRun, evalResult, agentResult.hypothesis, true);
      gitCommit(`autoresearch: run ${String(currentRun).padStart(3, "0")} — ${agentResult.hypothesis.slice(0, 60)}`);
    } else {
      const reason = !floors.ok ? `type regressions: ${floors.regressions.join(", ")}` : "reverted";
      console.log(`REVERTED — ${!floors.ok ? `per-type floor(s) broke (${floors.regressions.join("; ")})` : `pass_rate regressed (${best.passRate} → ${evalResult.pass_rate})`}`);
      writeFileSync(COACHING_PROMPT_PATH, backupPrompt);
      appendResult(currentRun, evalResult, agentResult.hypothesis, false, reason);
      updateSession(currentRun, evalResult, agentResult.hypothesis, false);
    }
  }

  console.log("\nAutoresearch loop complete.");
}

main();
