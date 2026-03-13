#!/usr/bin/env npx tsx

/**
 * Autoresearch orchestrator.
 * Modify coaching-prompt.md → eval → keep/revert → repeat.
 * Domain-agnostic infrastructure — knows about files, metrics, and git.
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";
import { cleanEnv } from "../shared.ts";
import type { EvalResult } from "./eval.ts";

// ── Config ─────────────────────────────────────────────────────────────

const DIR = import.meta.dirname ?? ".";
const COACHING_PROMPT_PATH = join(DIR, "coaching-prompt.md");
const RESULTS_PATH = join(DIR, "results.tsv");
const IDEAS_PATH = join(DIR, "ideas.md");
const SESSION_PATH = join(DIR, "session.md");
const PROGRAM_PATH = join(DIR, "program.md");
const EVAL_SCRIPT = join(DIR, "eval.ts");

// ── Helpers ────────────────────────────────────────────────────────────

function readFile(path: string): string {
  return existsSync(path) ? readFileSync(path, "utf-8") : "";
}

interface ResultsState {
  nextRun: number;
  best: { passRate: number; meanDimension: number };
  lastN: string;
}

function parseResults(n: number = 10): ResultsState {
  if (!existsSync(RESULTS_PATH)) {
    return { nextRun: 1, best: { passRate: 0, meanDimension: 0 }, lastN: "(no results yet)" };
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

  // Best kept result
  let best = { passRate: 0, meanDimension: 0 };
  for (const line of dataLines) {
    const cols = line.split("\t");
    if (cols[5] === "true") {
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

  return { nextRun, best, lastN };
}

function runEval(): EvalResult {
  console.log("Running evaluation...");
  const result = execSync(`npx tsx ${EVAL_SCRIPT}`, {
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
    execSync(`git add ${COACHING_PROMPT_PATH} ${RESULTS_PATH} ${SESSION_PATH} ${IDEAS_PATH}`, {
      cwd: join(DIR, "../../.."),
      encoding: "utf-8",
    });
    const repoRoot = join(DIR, "../../..");
    execSync("git commit -F -", {
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
      "run\tpass_rate\tmean_dimension\ttotal_mechanical\thypothesis\tkept\tnotes\ttimestamp\n"
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

// ── Agent call ─────────────────────────────────────────────────────────

function callAgent(
  currentPrompt: string,
  lastResults: string,
  worstViolations: string[],
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

### Ideas backlog
${ideas || "(empty)"}

---

Based on the above, propose your next modification to coaching-prompt.md. Remember: one hypothesis, output between <prompt> tags, hypothesis in <hypothesis> tags, optional <ideas> for deferred hypotheses.`;

  const result = execSync("claude --print --model sonnet", {
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

  // Check if we need a baseline
  const { nextRun: runNum } = parseResults();

  if (runNum === 1 || baselineOnly) {
    console.log("Running baseline evaluation...");
    const evalResult = runEval();
    appendResult(1, evalResult, "baseline", true, "initial baseline");
    updateSession(1, evalResult, "baseline", true);
    gitCommit("autoresearch: baseline run 001");
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

    // Get last eval's worst violations from results
    let lastWorstViolations: string[] = [];
    try {
      // Re-run would be expensive; parse from session if available
      const session = readFile(SESSION_PATH);
      // Simple approach: we'll pass empty if no previous violations cached
      // The agent will work with results.tsv data instead
      lastWorstViolations = [];
    } catch {
      // fine
    }

    // Step 1: Ask agent for modification
    console.log("Asking agent for next modification...");
    let agentResult;
    try {
      agentResult = callAgent(currentPrompt, state.lastN, lastWorstViolations, ideas);
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
      appendResult(currentRun, { pass_rate: 0, mean_dimension: 0, total_mechanical: 99, worst_violations: [], total_samples: 0, duration_seconds: 0 }, agentResult.hypothesis, false, "eval failed");
      updateSession(currentRun, { pass_rate: 0, mean_dimension: 0, total_mechanical: 99, worst_violations: [], total_samples: 0, duration_seconds: 0 }, agentResult.hypothesis, false);
      continue;
    }

    console.log(`Result: pass_rate=${evalResult.pass_rate}, dim=${evalResult.mean_dimension}, mech=${evalResult.total_mechanical}`);

    // Step 5: Keep or revert
    const improved = evalResult.pass_rate > best.passRate;
    const equalButNotWorse = evalResult.pass_rate === best.passRate && evalResult.mean_dimension >= (best.meanDimension - 2);
    const kept = improved || (equalButNotWorse && evalResult.pass_rate > 0);

    if (kept) {
      console.log(`KEPT — pass_rate improved or held (${best.passRate} → ${evalResult.pass_rate})`);
      appendResult(currentRun, evalResult, agentResult.hypothesis, true, "");
      updateSession(currentRun, evalResult, agentResult.hypothesis, true);
      gitCommit(`autoresearch: run ${String(currentRun).padStart(3, "0")} — ${agentResult.hypothesis.slice(0, 60)}`);
    } else {
      console.log(`REVERTED — pass_rate regressed (${best.passRate} → ${evalResult.pass_rate})`);
      writeFileSync(COACHING_PROMPT_PATH, backupPrompt);
      appendResult(currentRun, evalResult, agentResult.hypothesis, false, "reverted");
      updateSession(currentRun, evalResult, agentResult.hypothesis, false);
    }
  }

  console.log("\nAutoresearch loop complete.");
}

main();
