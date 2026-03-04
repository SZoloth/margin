#!/usr/bin/env npx tsx

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { execSync } from "child_process";
import { homedir } from "os";
import { join, resolve } from "path";
import { fileURLToPath } from "url";
import {
  runComplianceCheck,
  type ComplianceResult,
} from "./compliance-check.ts";

// ── Types ──────────────────────────────────────────────────────────────

interface AdversarialSample {
  prompt: string;
  text: string;
  compliance: ComplianceResult;
}

interface TypeResult {
  writingType: string;
  samples: AdversarialSample[];
  aggregated: {
    avgMechanicalIssues: number;
    systematicViolations: string[];
  };
}

interface AdversarialResult {
  timestamp: string;
  results: TypeResult[];
  overall: {
    totalSamples: number;
    avgMechanicalIssues: number;
    worstType: string;
    bestType: string;
  };
}

// ── ANSI helpers ───────────────────────────────────────────────────────

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

// ── Adversarial prompts ────────────────────────────────────────────────

const ADVERSARIAL_PROMPTS: Record<string, string> = {
  general:
    "Write a 200-word blog intro about why product managers should learn to code",
  email:
    "Draft a follow-up email after a job interview at a company you're excited about",
  "cover-letter":
    "Write an opening paragraph for a PM role at Stripe",
  outreach:
    "Draft a cold LinkedIn message to a VP of Product at a Series B startup",
  prd:
    "Write the problem statement section for a feature that adds dark mode",
  blog:
    "Write a paragraph arguing that most product roadmaps are theater",
  resume:
    "Write a bullet point for leading a product redesign that increased retention 15%",
  slack:
    "Write a message asking your team to review a doc before Friday",
  pitch:
    "Write the opening of a pitch deck for a reading annotation tool",
};

const SAMPLES_PER_TYPE = 3;

const REGISTER_MAP: Record<string, string> = {
  general: "casual",
  email: "casual",
  slack: "casual",
  outreach: "casual",
  pitch: "professional",
  prd: "professional",
  "cover-letter": "professional",
  resume: "professional",
  blog: "professional",
};

// ── Generation ─────────────────────────────────────────────────────────

function loadWritingRules(): string {
  const rulesPath = join(homedir(), ".margin/writing-rules.md");
  if (!existsSync(rulesPath)) {
    console.error(
      `${RED}Writing rules not found at ${rulesPath}${RESET}`
    );
    process.exit(1);
  }
  return readFileSync(rulesPath, "utf-8");
}

function generateSample(
  writingRules: string,
  type: string,
  prompt: string
): string {
  const register = REGISTER_MAP[type] ?? "casual";
  const fullPrompt = `You are writing in the style described in the writing rules below.\n\n<writing-rules>\n${writingRules}\n</writing-rules>\n\nWriting type: ${type}\nRegister: ${register}\nApply voice rules matching this register. Casual-register rules DO NOT apply to professional writing.\n\n${prompt}`;

  try {
    const result = execSync(`claude --print --model sonnet`, {
      input: fullPrompt,
      encoding: "utf-8",
      timeout: 90_000,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, CLAUDECODE: "" },
    });
    return result.trim();
  } catch (err) {
    console.error(
      `${RED}Generation failed for ${type}:${RESET}`,
      (err as Error).message
    );
    return "";
  }
}

// ── Aggregation ────────────────────────────────────────────────────────

function collectViolationLabels(result: ComplianceResult): string[] {
  const labels: string[] = [];

  for (const kw of result.mechanical.killWords) {
    labels.push(`Kill word: ${kw.word} (${kw.severity})`);
  }
  for (const sp of result.mechanical.slopPatterns) {
    labels.push(`Slop pattern: ${sp.explanation}`);
  }
  for (const v of result.mechanical.voiceViolations) {
    labels.push(`Voice: ${v.type}`);
  }
  for (const st of result.mechanical.structuralTells) {
    labels.push(`Structural: ${st.pattern}`);
  }

  return labels;
}

function findSystematicViolations(samples: AdversarialSample[]): string[] {
  // Count how many samples each violation label appears in
  const labelCounts = new Map<string, number>();

  for (const sample of samples) {
    const labels = new Set(collectViolationLabels(sample.compliance));
    for (const label of labels) {
      labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
    }
  }

  // Return violations present in 2+ samples
  return Array.from(labelCounts.entries())
    .filter(([, count]) => count >= 2)
    .map(([label]) => label);
}

// ── Run tests ──────────────────────────────────────────────────────────

export function runAdversarialTests(
  types: string[]
): AdversarialResult {
  const writingRules = loadWritingRules();
  const results: TypeResult[] = [];

  for (const type of types) {
    const prompt = ADVERSARIAL_PROMPTS[type];
    if (!prompt) {
      console.error(
        `${YELLOW}Unknown writing type: ${type}, skipping${RESET}`
      );
      continue;
    }

    console.log(
      `${CYAN}Testing ${BOLD}${type}${RESET}${CYAN}...${RESET}`
    );

    const samples: AdversarialSample[] = [];

    for (let i = 0; i < SAMPLES_PER_TYPE; i++) {
      process.stdout.write(
        `  ${DIM}Sample ${i + 1}/${SAMPLES_PER_TYPE}...${RESET}`
      );
      const text = generateSample(writingRules, type, prompt);

      if (!text) {
        console.log(` ${RED}failed${RESET}`);
        continue;
      }

      const compliance = runComplianceCheck(text);
      samples.push({ prompt, text, compliance });

      const issues = compliance.summary.mechanicalIssues;
      const color = issues === 0 ? GREEN : issues <= 2 ? YELLOW : RED;
      console.log(` ${color}${issues} issues${RESET}`);
    }

    const avgMechanicalIssues =
      samples.length > 0
        ? samples.reduce(
            (sum, s) => sum + s.compliance.summary.mechanicalIssues,
            0
          ) / samples.length
        : 0;

    const systematicViolations = findSystematicViolations(samples);

    results.push({
      writingType: type,
      samples,
      aggregated: {
        avgMechanicalIssues: Math.round(avgMechanicalIssues * 10) / 10,
        systematicViolations,
      },
    });
  }

  // Overall stats
  const allSamples = results.flatMap((r) => r.samples);
  const totalMechanical = allSamples.reduce(
    (sum, s) => sum + s.compliance.summary.mechanicalIssues,
    0
  );
  const avgMechanical =
    allSamples.length > 0 ? totalMechanical / allSamples.length : 0;

  const sorted = [...results].sort(
    (a, b) =>
      a.aggregated.avgMechanicalIssues - b.aggregated.avgMechanicalIssues
  );

  const bestType = sorted[0]?.writingType ?? "none";
  const worstType = sorted[sorted.length - 1]?.writingType ?? "none";

  const adversarialResult: AdversarialResult = {
    timestamp: new Date().toISOString(),
    results,
    overall: {
      totalSamples: allSamples.length,
      avgMechanicalIssues: Math.round(avgMechanical * 10) / 10,
      worstType,
      bestType,
    },
  };

  return adversarialResult;
}

// ── Print summary ──────────────────────────────────────────────────────

function printSummary(result: AdversarialResult): void {
  console.log(`\n${BOLD}═══ Adversarial Test Summary ═══${RESET}\n`);

  console.log(
    `${"Type".padEnd(16)}${"Avg Issues".padEnd(14)}Systematic Violations`
  );
  console.log(`${"─".repeat(16)}${"─".repeat(14)}${"─".repeat(40)}`);

  for (const r of result.results) {
    const issues = r.aggregated.avgMechanicalIssues;
    const color = issues === 0 ? GREEN : issues <= 2 ? YELLOW : RED;
    const sysViol =
      r.aggregated.systematicViolations.length > 0
        ? r.aggregated.systematicViolations.join("; ")
        : `${DIM}none${RESET}`;

    console.log(
      `${r.writingType.padEnd(16)}${color}${String(issues).padEnd(14)}${RESET}${sysViol}`
    );
  }

  console.log(`\n${BOLD}── Overall ──${RESET}`);
  console.log(`  Total samples: ${result.overall.totalSamples}`);
  console.log(
    `  Avg mechanical issues: ${result.overall.avgMechanicalIssues}`
  );
  console.log(`  Best type:  ${GREEN}${result.overall.bestType}${RESET}`);
  console.log(
    `  Worst type: ${RED}${result.overall.worstType}${RESET}`
  );
  console.log();
}

// ── CLI ────────────────────────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(
      `Usage: npx tsx mcp/scripts/adversarial-test.ts [--save] [--types type1,type2]`
    );
    console.log(
      `  --save       Save results to mcp/scripts/regression/baseline-YYYY-MM-DD.json`
    );
    console.log(
      `  --types      Comma-separated list of types to test (default: all 9)`
    );
    console.log(
      `\nAvailable types: ${Object.keys(ADVERSARIAL_PROMPTS).join(", ")}`
    );
    process.exit(0);
  }

  const save = args.includes("--save");
  const typesIdx = args.indexOf("--types");
  let types: string[];

  if (typesIdx !== -1 && args[typesIdx + 1]) {
    types = args[typesIdx + 1].split(",").map((t) => t.trim());
  } else {
    types = Object.keys(ADVERSARIAL_PROMPTS);
  }

  const result = runAdversarialTests(types);
  printSummary(result);

  if (save) {
    const date = new Date().toISOString().slice(0, 10);
    const dir = join(
      import.meta.dirname ?? ".",
      "regression"
    );
    mkdirSync(dir, { recursive: true });
    const outPath = join(dir, `baseline-${date}.json`);
    writeFileSync(outPath, JSON.stringify(result, null, 2));
    console.log(`${GREEN}Saved baseline to ${outPath}${RESET}`);
  }
}

// Run main() only when executed directly
const __filename = fileURLToPath(import.meta.url);
const isDirectRun = resolve(process.argv[1] ?? "") === __filename;
if (isDirectRun) {
  main();
}
