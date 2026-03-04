#!/usr/bin/env npx tsx

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath } from "url";
import { runAdversarialTests } from "../adversarial-test.ts";

// ── Types (mirrors adversarial-test output) ────────────────────────────

interface AdversarialResult {
  timestamp: string;
  results: {
    writingType: string;
    samples: {
      prompt: string;
      text: string;
      compliance: {
        mechanical: {
          killWords: { word: string; severity: string; count: number }[];
          slopPatterns: { pattern: string; explanation: string; matches: string[] }[];
          voiceViolations: { type: string; detail: string }[];
          structuralTells: { pattern: string; matches: string[] }[];
        };
        summary: {
          mechanicalIssues: number;
          pass: boolean;
        };
      };
    }[];
    aggregated: {
      avgMechanicalIssues: number;
      systematicViolations: string[];
    };
  }[];
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
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

// ── Baseline loading ───────────────────────────────────────────────────

function findLatestBaseline(dir: string): string | null {
  if (!existsSync(dir)) return null;

  const files = readdirSync(dir)
    .filter((f) => f.startsWith("baseline-") && f.endsWith(".json"))
    .sort();

  if (files.length === 0) return null;
  return join(dir, files[files.length - 1]);
}

function loadBaseline(path: string): AdversarialResult {
  const content = readFileSync(path, "utf-8");
  return JSON.parse(content) as AdversarialResult;
}

// ── Comparison ─────────────────────────────────────────────────────────

interface TypeComparison {
  type: string;
  baselineAvg: number;
  currentAvg: number;
  change: number;
  newSystematic: string[];
  resolvedSystematic: string[];
}

function compareResults(
  baseline: AdversarialResult,
  current: AdversarialResult
): TypeComparison[] {
  const baselineMap = new Map(
    baseline.results.map((r) => [r.writingType, r])
  );
  const comparisons: TypeComparison[] = [];

  for (const currentType of current.results) {
    const baselineType = baselineMap.get(currentType.writingType);

    const baselineAvg = baselineType?.aggregated.avgMechanicalIssues ?? 0;
    const currentAvg = currentType.aggregated.avgMechanicalIssues;
    const change = currentAvg - baselineAvg;

    const baselineViolations = new Set(
      baselineType?.aggregated.systematicViolations ?? []
    );
    const currentViolations = new Set(
      currentType.aggregated.systematicViolations
    );

    const newSystematic = [...currentViolations].filter(
      (v) => !baselineViolations.has(v)
    );
    const resolvedSystematic = [...baselineViolations].filter(
      (v) => !currentViolations.has(v)
    );

    comparisons.push({
      type: currentType.writingType,
      baselineAvg,
      currentAvg,
      change,
      newSystematic,
      resolvedSystematic,
    });
  }

  return comparisons;
}

// ── Report printing ────────────────────────────────────────────────────

function printRegressionReport(
  baselineDate: string,
  currentDate: string,
  comparisons: TypeComparison[],
  baselineOverall: { avgMechanicalIssues: number },
  currentOverall: { avgMechanicalIssues: number }
): void {
  console.log(`\n${BOLD}═══ Regression Report ═══${RESET}`);
  console.log(`Baseline: ${baselineDate}`);
  console.log(`Current:  ${currentDate}\n`);

  // Per-type table
  console.log(
    `${"Type".padEnd(16)}${"Baseline".padEnd(10)}${"Current".padEnd(10)}Change`
  );
  console.log(`${"─".repeat(16)}${"─".repeat(10)}${"─".repeat(10)}${"─".repeat(24)}`);

  for (const comp of comparisons) {
    const changeAbs = Math.abs(comp.change);
    const changeRounded = Math.round(changeAbs * 10) / 10;
    let changeStr: string;

    if (changeAbs < 0.05) {
      changeStr = `${DIM}— no change${RESET}`;
    } else if (comp.change < 0) {
      changeStr = `${GREEN}▼ ${changeRounded} improved${RESET}`;
    } else {
      changeStr = `${RED}▲ ${changeRounded} degraded${RESET}`;
    }

    console.log(
      `${comp.type.padEnd(16)}${String(comp.baselineAvg).padEnd(10)}${String(comp.currentAvg).padEnd(10)}${changeStr}`
    );
  }

  // New systematic violations
  const allNewViolations = comparisons.flatMap((c) =>
    c.newSystematic.map((v) => ({ type: c.type, violation: v }))
  );
  if (allNewViolations.length > 0) {
    console.log(`\n${RED}${BOLD}New systematic violations:${RESET}`);
    for (const { type, violation } of allNewViolations) {
      console.log(`  ${RED}-${RESET} [${type}] "${violation}"`);
    }
  }

  // Resolved systematic violations
  const allResolved = comparisons.flatMap((c) =>
    c.resolvedSystematic.map((v) => ({ type: c.type, violation: v }))
  );
  if (allResolved.length > 0) {
    console.log(`\n${GREEN}${BOLD}Resolved systematic violations:${RESET}`);
    for (const { type, violation } of allResolved) {
      console.log(`  ${GREEN}-${RESET} [${type}] "${violation}"`);
    }
  }

  // Net change
  const baseTotal = baselineOverall.avgMechanicalIssues;
  const curTotal = currentOverall.avgMechanicalIssues;
  const pctChange =
    baseTotal > 0
      ? Math.round(((curTotal - baseTotal) / baseTotal) * 100)
      : 0;
  const pctAbs = Math.abs(pctChange);

  let netStr: string;
  if (pctAbs < 1) {
    netStr = `${DIM}no significant change${RESET}`;
  } else if (pctChange < 0) {
    netStr = `${GREEN}▼ ${pctAbs}% improved${RESET}`;
  } else {
    netStr = `${RED}▲ ${pctAbs}% degraded${RESET}`;
  }

  console.log(
    `\n${BOLD}Net mechanical issues:${RESET} ${baseTotal} → ${curTotal} (${netStr})`
  );
  console.log();
}

// ── CLI ────────────────────────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(
      `Usage: npx tsx mcp/scripts/regression/run-regression.ts [--types type1,type2]`
    );
    console.log(
      `  --types      Comma-separated list of types to test (default: all 9)`
    );
    console.log(
      `\nCompares current adversarial test results against the most recent baseline.`
    );
    console.log(
      `If no baseline exists, runs tests and saves as the initial baseline.`
    );
    process.exit(0);
  }

  const typesIdx = args.indexOf("--types");
  let types: string[] | undefined;
  if (typesIdx !== -1 && args[typesIdx + 1]) {
    types = args[typesIdx + 1].split(",").map((t) => t.trim());
  }

  const regressionDir = import.meta.dirname ?? join("mcp", "scripts", "regression");
  const baselinePath = findLatestBaseline(regressionDir);

  if (!baselinePath) {
    console.log(
      `${YELLOW}No baseline found. Running tests to create initial baseline...${RESET}\n`
    );
    const allTypes = types ?? [
      "general", "email", "cover-letter", "outreach",
      "prd", "blog", "resume", "slack", "pitch",
    ];
    const result = runAdversarialTests(allTypes);

    const date = new Date().toISOString().slice(0, 10);
    mkdirSync(regressionDir, { recursive: true });
    const outPath = join(regressionDir, `baseline-${date}.json`);
    writeFileSync(outPath, JSON.stringify(result, null, 2));
    console.log(`\n${GREEN}Saved initial baseline to ${outPath}${RESET}`);
    return;
  }

  // Load baseline
  const baseline = loadBaseline(baselinePath);
  const baselineDate = baselinePath.match(/baseline-(\d{4}-\d{2}-\d{2})/)?.[1] ?? "unknown";

  console.log(
    `${DIM}Baseline: ${baselinePath}${RESET}\n`
  );

  // Determine types to test — use baseline types unless overridden
  const testTypes =
    types ?? baseline.results.map((r) => r.writingType);

  // Run current tests
  const current = runAdversarialTests(testTypes);

  // Compare and report
  const comparisons = compareResults(baseline, current);
  const currentDate = new Date().toISOString().slice(0, 10);

  printRegressionReport(
    baselineDate,
    currentDate,
    comparisons,
    baseline.overall,
    current.overall
  );

  // Save current run
  mkdirSync(regressionDir, { recursive: true });
  const runPath = join(regressionDir, `run-${currentDate}.json`);
  writeFileSync(runPath, JSON.stringify(current, null, 2));
  console.log(`${DIM}Saved current run to ${runPath}${RESET}`);
}

// Run main() only when executed directly
const __filename = fileURLToPath(import.meta.url);
const isDirectRun = resolve(process.argv[1] ?? "") === __filename;
if (isDirectRun) {
  main();
}
