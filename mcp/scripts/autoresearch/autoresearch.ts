#!/usr/bin/env npx tsx

/**
 * Unified autoresearch runner for all four categories.
 *
 * Usage:
 *   npx tsx autoresearch.ts --category recognition --baseline
 *   npx tsx autoresearch.ts --category creation --max 5
 *   npx tsx autoresearch.ts --category enforcement --max 5
 *   npx tsx autoresearch.ts --category pipeline --baseline
 *   npx tsx autoresearch.ts --category all --baseline
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { cleanEnv } from "../shared.ts";
import type { Category, CategoryEvalResult } from "./category-types.ts";

const SKILL_PATH = join(homedir(), ".claude/skills/writing-voice/SKILL.md");
const RESULTS_PATH = join(import.meta.dirname ?? ".", "autoresearch-results.tsv");
const EVAL_PATH = join(import.meta.dirname ?? ".", "eval.ts");

// ── Args ─────────────────────────────────────────────────────────────

type CategoryName = "recognition" | "creation" | "enforcement" | "pipeline" | "all";

function parseArgs(): { category: CategoryName; baseline: boolean; max: number } {
  const args = process.argv.slice(2);

  const catIdx = args.indexOf("--category");
  const catValue = catIdx !== -1 ? args[catIdx + 1] : "enforcement";
  const validCats = ["recognition", "creation", "enforcement", "pipeline", "all"];
  if (!validCats.includes(catValue)) {
    console.error(`Invalid --category: ${catValue}. Use: ${validCats.join(", ")}`);
    process.exit(1);
  }

  const baseline = args.includes("--baseline");
  const maxIdx = args.indexOf("--max");
  const max = maxIdx !== -1 && args[maxIdx + 1] ? parseInt(args[maxIdx + 1], 10) : 5;

  return { category: catValue as CategoryName, baseline, max };
}

// ── Category implementations ─────────────────────────────────────────

function createEnforcementCategory(): Category {
  return {
    name: "enforcement",
    targetSection: "steps 2-3",

    async runEval() {
      const output = execSync(`npx tsx ${EVAL_PATH} --arch skill`, {
        encoding: "utf-8",
        timeout: 1_200_000,
        maxBuffer: 10 * 1024 * 1024,
        env: cleanEnv(),
        stdio: ["pipe", "pipe", "inherit"],
      });
      const result = JSON.parse(output);
      return { ...result, category: "enforcement" as const };
    },

    isBetter(current, best) {
      if (current.category !== "enforcement" || best.category !== "enforcement") return false;
      return current.pass_rate >= best.pass_rate;
    },

    async proposeChange(skillMd, evalResult) {
      if (evalResult.category !== "enforcement") return null;
      const worstViolations = evalResult.worst_violations?.slice(0, 10).join("\n") ?? "";
      const perTypeReport = Object.entries(evalResult.per_type ?? {})
        .map(([type, s]: [string, any]) => `${type}: pass=${s.passRate}, mechAvg=${s.avgMechanical}`)
        .join("\n");

      const prompt = `You are improving a writing skill file (SKILL.md) for Claude Code.

Current eval results:
- Overall pass rate: ${evalResult.pass_rate}
- Total mechanical issues: ${evalResult.total_mechanical}

Per-type: ${perTypeReport}
Worst violations: ${worstViolations}

Current SKILL.md:
<skill>
${skillMd}
</skill>

Propose EXACTLY ONE change to steps 2-3 (coaching context loading and writing constraints) that would reduce violations.

Rules:
- The file MUST start with exactly \`---\` on the first line. Copy the frontmatter block verbatim.
- Do NOT remove \`margin export coaching-prompt\`, \`margin rules create\`, or \`margin export profile\`
- Do NOT add new sections — modify existing ones
- Keep it concise — one targeted change

Output the COMPLETE updated SKILL.md starting with \`---\`. No markdown fences, no commentary.`;

      try {
        let result = execSync("claude --print --model sonnet", {
          input: prompt, encoding: "utf-8", timeout: 120_000,
          maxBuffer: 1024 * 1024, env: cleanEnv(),
        }).trim();
        result = result.replace(/^```(?:markdown|md|yaml)?\n/, "").replace(/\n```$/, "");
        return result.trim();
      } catch { return null; }
    },

    validateSkillMd(content) {
      return content.startsWith("---")
        && content.includes("margin export coaching-prompt")
        && content.includes("margin rules create")
        && content.includes("margin export profile")
        && content.length >= 500;
    },

    formatSummary(result) {
      if (result.category !== "enforcement") return "";
      return `pass=${result.pass_rate}, mech=${result.total_mechanical}, dim=${result.mean_dimension}`;
    },
  };
}

function createRecognitionCategory(): Category {
  return {
    name: "recognition",
    targetSection: "step 4 triggers",

    async runEval() {
      const { scoreRecognition } = await import("./score-recognition.ts");
      return scoreRecognition();
    },

    isBetter(current, best) {
      if (current.category !== "recognition" || best.category !== "recognition") return false;
      return current.f1 >= best.f1;
    },

    async proposeChange(skillMd, evalResult) {
      if (evalResult.category !== "recognition") return null;
      const misses = evalResult.worst_misses
        .map((m) => `"${m.message}" — expected=${m.expected}, predicted=${m.predicted} (conf=${m.confidence})`)
        .join("\n");

      const prompt = `You are improving a writing skill file (SKILL.md) for Claude Code.
The skill needs to detect when the user gives a writing correction vs just conversing.

Current detection performance:
- F1: ${evalResult.f1}, Precision: ${evalResult.precision}, Recall: ${evalResult.recall}
- Confusion: TP=${evalResult.confusion.tp} FP=${evalResult.confusion.fp} TN=${evalResult.confusion.tn} FN=${evalResult.confusion.fn}

Worst misclassifications:
${misses}

Current SKILL.md:
<skill>
${skillMd}
</skill>

Propose EXACTLY ONE change to step 4 (Capture feedback) that would improve detection accuracy. Focus on the trigger language — what counts as a correction, what doesn't.

Rules:
- The file MUST start with exactly \`---\` on the first line. Copy the frontmatter block verbatim.
- Do NOT remove \`margin export coaching-prompt\`, \`margin rules create\`, or \`margin export profile\`
- Do NOT add new sections — modify existing ones
- Keep it concise — one targeted change

Output the COMPLETE updated SKILL.md starting with \`---\`. No markdown fences, no commentary.`;

      try {
        let result = execSync("claude --print --model sonnet", {
          input: prompt, encoding: "utf-8", timeout: 120_000,
          maxBuffer: 1024 * 1024, env: cleanEnv(),
        }).trim();
        result = result.replace(/^```(?:markdown|md|yaml)?\n/, "").replace(/\n```$/, "");
        return result.trim();
      } catch { return null; }
    },

    validateSkillMd(content) {
      return content.startsWith("---")
        && content.includes("margin export coaching-prompt")
        && content.includes("margin rules create")
        && content.includes("margin export profile")
        && content.length >= 500;
    },

    formatSummary(result) {
      if (result.category !== "recognition") return "";
      return `F1=${result.f1}, P=${result.precision}, R=${result.recall} (TP=${result.confusion.tp} FP=${result.confusion.fp} TN=${result.confusion.tn} FN=${result.confusion.fn})`;
    },
  };
}

function createCreationCategory(): Category {
  return {
    name: "creation",
    targetSection: "step 4 rule instructions",

    async runEval() {
      const { scoreCreation } = await import("./score-creation.ts");
      return scoreCreation();
    },

    isBetter(current, best) {
      if (current.category !== "creation" || best.category !== "creation") return false;
      return current.mean_score >= best.mean_score;
    },

    async proposeChange(skillMd, evalResult) {
      if (evalResult.category !== "creation") return null;
      const worst = evalResult.worst_cases
        .map((w) => `"${w.scenario}" — score=${w.score}, reason: ${w.reason}`)
        .join("\n");
      const dims = evalResult.dimension_means;

      const prompt = `You are improving a writing skill file (SKILL.md) for Claude Code.
The skill needs to create high-quality writing rules when the user gives corrections.

Current rule creation quality:
- Mean score: ${evalResult.mean_score}/5
- Intent match: ${dims.intent}/5, Severity: ${dims.severity}/5, Examples: ${dims.examples}/5, Specificity: ${dims.specificity}/5
- Pass rate: ${evalResult.pass_rate}

Worst-scoring scenarios:
${worst}

Current SKILL.md:
<skill>
${skillMd}
</skill>

Propose EXACTLY ONE change to step 4 (Capture feedback) that would improve rule creation quality. Focus on the \`margin rules create\` instructions — how to formulate the rule text, choose severity, write examples.

Rules:
- The file MUST start with exactly \`---\` on the first line. Copy the frontmatter block verbatim.
- Do NOT remove \`margin export coaching-prompt\`, \`margin rules create\`, or \`margin export profile\`
- Do NOT add new sections — modify existing ones
- Keep it concise — one targeted change

Output the COMPLETE updated SKILL.md starting with \`---\`. No markdown fences, no commentary.`;

      try {
        let result = execSync("claude --print --model sonnet", {
          input: prompt, encoding: "utf-8", timeout: 120_000,
          maxBuffer: 1024 * 1024, env: cleanEnv(),
        }).trim();
        result = result.replace(/^```(?:markdown|md|yaml)?\n/, "").replace(/\n```$/, "");
        return result.trim();
      } catch { return null; }
    },

    validateSkillMd(content) {
      return content.startsWith("---")
        && content.includes("margin export coaching-prompt")
        && content.includes("margin rules create")
        && content.includes("margin export profile")
        && content.length >= 500;
    },

    formatSummary(result) {
      if (result.category !== "creation") return "";
      const d = result.dimension_means;
      return `mean=${result.mean_score}, pass=${result.pass_rate} (I=${d.intent} S=${d.severity} E=${d.examples} Sp=${d.specificity})`;
    },
  };
}

// ── Loader ───────────────────────────────────────────────────────────

function loadCategory(name: string): Category {
  switch (name) {
    case "enforcement": return createEnforcementCategory();
    case "recognition": return createRecognitionCategory();
    case "creation": return createCreationCategory();
    case "pipeline":
      console.error("Pipeline category not yet implemented — run recognition, creation, or enforcement");
      process.exit(1);
    default:
      console.error(`Unknown category: ${name}`);
      process.exit(1);
  }
}

// ── Results logging ──────────────────────────────────────────────────

function initResultsFile(): void {
  if (!existsSync(RESULTS_PATH)) {
    writeFileSync(RESULTS_PATH, "category\titeration\tmetric\tvalue\tduration_s\taction\n");
  }
}

function logResult(category: string, iteration: number, result: CategoryEvalResult, action: string): void {
  let metric: string, value: number;
  switch (result.category) {
    case "recognition":
      metric = "f1"; value = result.f1; break;
    case "creation":
      metric = "mean_score"; value = result.mean_score; break;
    case "enforcement":
      metric = "pass_rate"; value = result.pass_rate; break;
    case "pipeline":
      metric = "non_recurrence"; value = result.non_recurrence_rate; break;
  }
  appendFileSync(RESULTS_PATH, `${category}\t${iteration}\t${metric}\t${value}\t${result.duration_seconds}\t${action}\n`);
}

// ── Main loop ────────────────────────────────────────────────────────

async function runCategory(name: string, baseline: boolean, max: number): Promise<void> {
  const cat = loadCategory(name);

  console.error(`\n${"=".repeat(60)}`);
  console.error(`Category: ${cat.name} (optimizes ${cat.targetSection})`);
  console.error(`${"=".repeat(60)}\n`);

  console.error("Running baseline eval...\n");
  const baselineResult = await cat.runEval();
  console.error(`\nBaseline: ${cat.formatSummary(baselineResult)}\n`);
  logResult(cat.name, 0, baselineResult, "baseline");

  if (baseline) {
    console.log(JSON.stringify(baselineResult, null, 2));
    return;
  }

  let bestResult = baselineResult;
  let bestMetric = getMetric(baselineResult);

  for (let i = 1; i <= max; i++) {
    console.error(`\n--- ${cat.name} iteration ${i}/${max} ---\n`);

    const currentSkill = readFileSync(SKILL_PATH, "utf-8");

    console.error("Proposing change...");
    const proposed = await cat.proposeChange(currentSkill, bestResult);
    if (!proposed) {
      console.error("Proposal failed — skipping");
      continue;
    }

    if (!cat.validateSkillMd(proposed)) {
      console.error("Proposed change failed validation — skipping");
      logResult(cat.name, i, bestResult, "invalid-proposal");
      continue;
    }

    writeFileSync(SKILL_PATH, proposed);
    console.error("Applied proposed change");

    console.error("Evaluating...");
    let iterResult: CategoryEvalResult;
    try {
      iterResult = await cat.runEval();
    } catch (err) {
      console.error("Eval failed — reverting");
      writeFileSync(SKILL_PATH, currentSkill);
      logResult(cat.name, i, bestResult, "eval-failed-reverted");
      continue;
    }

    const iterMetric = getMetric(iterResult);
    console.error(`Result: ${cat.formatSummary(iterResult)}`);

    if (cat.isBetter(iterResult, bestResult)) {
      console.error(`KEPT (${bestMetric} → ${iterMetric})`);
      bestResult = iterResult;
      bestMetric = iterMetric;
      logResult(cat.name, i, iterResult, "kept");
    } else {
      console.error(`REVERTED (${iterMetric} < ${bestMetric})`);
      writeFileSync(SKILL_PATH, currentSkill);
      logResult(cat.name, i, iterResult, "reverted");
    }
  }

  console.error(`\n=== ${cat.name} done. Best: ${cat.formatSummary(bestResult)} ===\n`);
  console.log(JSON.stringify(bestResult, null, 2));
}

function getMetric(result: CategoryEvalResult): number {
  switch (result.category) {
    case "recognition": return result.f1;
    case "creation": return result.mean_score;
    case "enforcement": return result.pass_rate;
    case "pipeline": return result.non_recurrence_rate;
  }
}

// ── CLI ──────────────────────────────────────────────────────────────

const { category, baseline, max } = parseArgs();

initResultsFile();

if (category === "all") {
  for (const cat of ["recognition", "creation", "enforcement"] as const) {
    await runCategory(cat, baseline, max);
  }
} else {
  await runCategory(category, baseline, max);
}
