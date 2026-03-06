#!/usr/bin/env npx tsx

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { execSync } from "child_process";
import { homedir } from "os";
import { join, resolve } from "path";
import { fileURLToPath } from "url";
import {
  runComplianceCheck,
  type ComplianceResult,
  type DimensionScores,
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
    avgDimensionScore?: number;
    systematicViolations: string[];
  };
}

interface AdversarialResult {
  timestamp: string;
  mode: "coached" | "uncoached";
  results: TypeResult[];
  overall: {
    totalSamples: number;
    avgMechanicalIssues: number;
    avgDimensionScore: number;
    worstType: string;
    bestType: string;
  };
}

// ── Comparison types ──────────────────────────────────────────────────

interface ComparisonSample {
  prompt: string;
  uncoached: { text: string; compliance: ComplianceResult };
  coached: { text: string; compliance: ComplianceResult };
}

interface ComparisonTypeResult {
  writingType: string;
  samples: ComparisonSample[];
  delta: {
    mechanicalDelta: number;
    dimensionDeltas: Record<string, number>;
    totalScoreDelta: number;
  };
}

interface ComparisonResult {
  timestamp: string;
  mode: "comparison";
  results: ComparisonTypeResult[];
  overall: {
    totalSamples: number;
    avgMechanicalDelta: number;
    avgDimensionDelta: number;
    perDimensionDelta: Record<string, number>;
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

interface WritingRuleRow {
  writing_type: string;
  category: string;
  rule_text: string;
  severity: string;
  example_before: string | null;
  example_after: string | null;
  register: string | null;
}

function loadWritingRulesForType(type: string): string {
  try {
    const Database = require("better-sqlite3");
    const dbPath = join(homedir(), ".margin/margin.db");
    if (!existsSync(dbPath)) return loadWritingRules();

    const db = new Database(dbPath, { readonly: true });
    const register = REGISTER_MAP[type] ?? "casual";

    const rows = db
      .prepare(
        `SELECT writing_type, category, rule_text, severity, example_before, example_after, register
         FROM writing_rules
         WHERE (writing_type = ? OR writing_type = 'general' OR register = ?)
         ORDER BY signal_count DESC, created_at DESC`
      )
      .all(type, register) as WritingRuleRow[];
    db.close();

    if (rows.length === 0) return loadWritingRules();

    // Group by writing_type, then by category
    const grouped = new Map<string, Map<string, WritingRuleRow[]>>();
    for (const row of rows) {
      if (!grouped.has(row.writing_type)) grouped.set(row.writing_type, new Map());
      const categories = grouped.get(row.writing_type)!;
      if (!categories.has(row.category)) categories.set(row.category, []);
      categories.get(row.category)!.push(row);
    }

    const lines: string[] = [`# Writing Rules (filtered for: ${type}, register: ${register})`];

    for (const [writingType, categories] of grouped) {
      lines.push("", `## ${writingType.charAt(0).toUpperCase() + writingType.slice(1)}`);
      for (const [category, rules] of categories) {
        lines.push(`### ${category}`);
        for (const rule of rules) {
          lines.push(`- [${rule.severity}] ${rule.rule_text}`);
          if (rule.example_before) lines.push(`  - Before: "${rule.example_before}"`);
          if (rule.example_after) lines.push(`  - After: "${rule.example_after}"`);
        }
      }
    }

    return lines.join("\n");
  } catch {
    return loadWritingRules();
  }
}

function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.CLAUDECODE;
  return env;
}

function stripMetaCommentary(text: string): string {
  // Remove content between --- delimiters (Claude wraps prose in ---)
  const fenceMatch = text.match(/---\n([\s\S]+?)\n---/);
  if (fenceMatch) return fenceMatch[1].trim();

  // Remove leading meta like "Here's a 200-word intro:" or "Here's the draft:"
  let cleaned = text.replace(/^(?:Here['']s|Writing rules|I['']ll)[^\n]*\n+/i, "");

  // Remove trailing meta like "~195 words." or "Critique pass:" or "(207 words..."
  cleaned = cleaned.replace(/\n+(?:\*\*Critique|~\d+\s*words|^\(.+\)$|\*\(.+\)\*).*/ms, "");

  return cleaned.trim();
}

function generateSample(
  writingRules: string,
  type: string,
  prompt: string
): string {
  const register = REGISTER_MAP[type] ?? "casual";
  const fullPrompt = `You are writing in the style described in the writing rules below.\n\n<writing-rules>\n${writingRules}\n</writing-rules>\n\nWriting type: ${type}\nRegister: ${register}\nApply voice rules matching this register. Casual-register rules DO NOT apply to professional writing.\n\nOutput ONLY the prose — no commentary, critique, word counts, or meta-discussion.\n\n${prompt}`;

  try {
    const result = execSync(`claude --print --model sonnet`, {
      input: fullPrompt,
      encoding: "utf-8",
      timeout: 90_000,
      maxBuffer: 1024 * 1024,
      env: cleanEnv(),
    });
    return stripMetaCommentary(result.trim());
  } catch (err) {
    console.error(
      `${RED}Generation failed for ${type}:${RESET}`,
      (err as Error).message
    );
    return "";
  }
}

function generateUncoached(type: string, prompt: string): string {
  const register = REGISTER_MAP[type] ?? "casual";
  const fullPrompt = `Writing type: ${type}\nRegister: ${register}\n\nOutput ONLY the prose — no commentary, critique, word counts, or meta-discussion.\n\n${prompt}`;

  try {
    const result = execSync(`claude --print --model sonnet`, {
      input: fullPrompt,
      encoding: "utf-8",
      timeout: 90_000,
      maxBuffer: 1024 * 1024,
      env: cleanEnv(),
    });
    return stripMetaCommentary(result.trim());
  } catch (err) {
    console.error(
      `${RED}Uncoached generation failed for ${type}:${RESET}`,
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
  types: string[],
  mode: "coached" | "uncoached" = "coached"
): AdversarialResult {
  const modeLabel = mode === "coached" ? "coached" : "uncoached";
  const results: TypeResult[] = [];

  for (const type of types) {
    const prompt = ADVERSARIAL_PROMPTS[type];
    if (!prompt) {
      console.error(
        `${YELLOW}Unknown writing type: ${type}, skipping${RESET}`
      );
      continue;
    }

    const writingRules = mode === "coached" ? loadWritingRulesForType(type) : "";

    console.log(
      `${CYAN}Testing ${BOLD}${type}${RESET} ${DIM}(${modeLabel})${RESET}${CYAN}...${RESET}`
    );

    const samples: AdversarialSample[] = [];

    for (let i = 0; i < SAMPLES_PER_TYPE; i++) {
      process.stdout.write(
        `  ${DIM}Sample ${i + 1}/${SAMPLES_PER_TYPE}...${RESET}`
      );
      const text =
        mode === "coached"
          ? generateSample(writingRules, type, prompt)
          : generateUncoached(type, prompt);

      if (!text) {
        console.log(` ${RED}failed${RESET}`);
        continue;
      }

      const compliance = runComplianceCheck(text, type);
      samples.push({ prompt, text, compliance });

      const issues = compliance.summary.mechanicalIssues;
      const dimScore = compliance.dimensions?.total ?? 0;
      const color = issues === 0 ? GREEN : issues <= 2 ? YELLOW : RED;
      console.log(` ${color}${issues} issues${RESET} ${DIM}(${dimScore}/50)${RESET}`);
    }

    const avgMechanicalIssues =
      samples.length > 0
        ? samples.reduce(
            (sum, s) => sum + s.compliance.summary.mechanicalIssues,
            0
          ) / samples.length
        : 0;

    const avgDimensionScore =
      samples.length > 0
        ? samples.reduce(
            (sum, s) => sum + (s.compliance.dimensions?.total ?? 0),
            0
          ) / samples.length
        : 0;

    const systematicViolations = findSystematicViolations(samples);

    results.push({
      writingType: type,
      samples,
      aggregated: {
        avgMechanicalIssues: Math.round(avgMechanicalIssues * 10) / 10,
        avgDimensionScore: Math.round(avgDimensionScore * 10) / 10,
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

  const totalDimension = allSamples.reduce(
    (sum, s) => sum + (s.compliance.dimensions?.total ?? 0),
    0
  );
  const avgDimension =
    allSamples.length > 0 ? totalDimension / allSamples.length : 0;

  const sorted = [...results].sort(
    (a, b) =>
      a.aggregated.avgMechanicalIssues - b.aggregated.avgMechanicalIssues
  );

  const bestType = sorted[0]?.writingType ?? "none";
  const worstType = sorted[sorted.length - 1]?.writingType ?? "none";

  const adversarialResult: AdversarialResult = {
    timestamp: new Date().toISOString(),
    mode,
    results,
    overall: {
      totalSamples: allSamples.length,
      avgMechanicalIssues: Math.round(avgMechanical * 10) / 10,
      avgDimensionScore: Math.round(avgDimension * 10) / 10,
      worstType,
      bestType,
    },
  };

  return adversarialResult;
}

// ── Comparison mode ───────────────────────────────────────────────────

function avgDimensions(samples: { compliance: ComplianceResult }[]): Record<string, number> {
  const dims = ["directness", "rhythm", "trust", "authenticity", "density"];
  const result: Record<string, number> = {};
  for (const dim of dims) {
    const sum = samples.reduce(
      (s, sample) => s + ((sample.compliance.dimensions as any)?.[dim] ?? 0),
      0
    );
    result[dim] = samples.length > 0 ? Math.round((sum / samples.length) * 10) / 10 : 0;
  }
  return result;
}

export function runComparisonTests(types: string[]): ComparisonResult {
  const results: ComparisonTypeResult[] = [];

  for (const type of types) {
    const prompt = ADVERSARIAL_PROMPTS[type];
    if (!prompt) continue;

    const writingRules = loadWritingRulesForType(type);

    console.log(`${CYAN}Comparing ${BOLD}${type}${RESET}${CYAN}...${RESET}`);
    const samples: ComparisonSample[] = [];

    for (let i = 0; i < SAMPLES_PER_TYPE; i++) {
      process.stdout.write(`  ${DIM}Sample ${i + 1}/${SAMPLES_PER_TYPE}${RESET}`);

      // Uncoached
      process.stdout.write(` ${DIM}[uncoached...${RESET}`);
      const uncoachedText = generateUncoached(type, prompt);
      const uncoachedCompliance = uncoachedText ? runComplianceCheck(uncoachedText, type) : runComplianceCheck("", type);

      // Coached
      process.stdout.write(`${DIM}coached...]${RESET}`);
      const coachedText = generateSample(writingRules, type, prompt);
      const coachedCompliance = coachedText ? runComplianceCheck(coachedText, type) : runComplianceCheck("", type);

      const uIssues = uncoachedCompliance.summary.mechanicalIssues;
      const cIssues = coachedCompliance.summary.mechanicalIssues;
      const uDim = uncoachedCompliance.dimensions?.total ?? 0;
      const cDim = coachedCompliance.dimensions?.total ?? 0;
      const delta = cDim - uDim;
      const deltaColor = delta > 0 ? GREEN : delta < 0 ? RED : DIM;
      console.log(` ${DIM}mech:${RESET} ${uIssues}→${cIssues} ${DIM}dim:${RESET} ${uDim}→${cDim} ${deltaColor}(${delta > 0 ? "+" : ""}${delta})${RESET}`);

      samples.push({
        prompt,
        uncoached: { text: uncoachedText, compliance: uncoachedCompliance },
        coached: { text: coachedText, compliance: coachedCompliance },
      });
    }

    // Compute deltas
    const avgUncoachedMech = samples.reduce((s, x) => s + x.uncoached.compliance.summary.mechanicalIssues, 0) / samples.length;
    const avgCoachedMech = samples.reduce((s, x) => s + x.coached.compliance.summary.mechanicalIssues, 0) / samples.length;
    const uncoachedDims = avgDimensions(samples.map((s) => s.uncoached));
    const coachedDims = avgDimensions(samples.map((s) => s.coached));

    const dimensionDeltas: Record<string, number> = {};
    for (const dim of Object.keys(uncoachedDims)) {
      dimensionDeltas[dim] = Math.round((coachedDims[dim] - uncoachedDims[dim]) * 10) / 10;
    }

    const avgUncoachedTotal = samples.reduce((s, x) => s + (x.uncoached.compliance.dimensions?.total ?? 0), 0) / samples.length;
    const avgCoachedTotal = samples.reduce((s, x) => s + (x.coached.compliance.dimensions?.total ?? 0), 0) / samples.length;

    results.push({
      writingType: type,
      samples,
      delta: {
        mechanicalDelta: Math.round((avgCoachedMech - avgUncoachedMech) * 10) / 10,
        dimensionDeltas,
        totalScoreDelta: Math.round((avgCoachedTotal - avgUncoachedTotal) * 10) / 10,
      },
    });
  }

  // Overall
  const allUncoached = results.flatMap((r) => r.samples.map((s) => s.uncoached));
  const allCoached = results.flatMap((r) => r.samples.map((s) => s.coached));
  const avgMechDelta =
    (allCoached.reduce((s, x) => s + x.compliance.summary.mechanicalIssues, 0) -
      allUncoached.reduce((s, x) => s + x.compliance.summary.mechanicalIssues, 0)) /
    Math.max(allCoached.length, 1);
  const avgDimDelta =
    (allCoached.reduce((s, x) => s + (x.compliance.dimensions?.total ?? 0), 0) -
      allUncoached.reduce((s, x) => s + (x.compliance.dimensions?.total ?? 0), 0)) /
    Math.max(allCoached.length, 1);

  const uncoachedOverallDims = avgDimensions(allUncoached);
  const coachedOverallDims = avgDimensions(allCoached);
  const perDimensionDelta: Record<string, number> = {};
  for (const dim of Object.keys(uncoachedOverallDims)) {
    perDimensionDelta[dim] = Math.round((coachedOverallDims[dim] - uncoachedOverallDims[dim]) * 10) / 10;
  }

  return {
    timestamp: new Date().toISOString(),
    mode: "comparison",
    results,
    overall: {
      totalSamples: allCoached.length,
      avgMechanicalDelta: Math.round(avgMechDelta * 10) / 10,
      avgDimensionDelta: Math.round(avgDimDelta * 10) / 10,
      perDimensionDelta,
    },
  };
}

// ── Print summary ──────────────────────────────────────────────────────

function printSummary(result: AdversarialResult): void {
  console.log(`\n${BOLD}═══ Adversarial Test Summary (${result.mode}) ═══${RESET}\n`);

  console.log(
    `${"Type".padEnd(16)}${"Avg Issues".padEnd(12)}${"Dim Score".padEnd(12)}Systematic Violations`
  );
  console.log(`${"─".repeat(16)}${"─".repeat(12)}${"─".repeat(12)}${"─".repeat(40)}`);

  for (const r of result.results) {
    const issues = r.aggregated.avgMechanicalIssues;
    const dimScore = r.aggregated.avgDimensionScore ?? 0;
    const issueColor = issues === 0 ? GREEN : issues <= 2 ? YELLOW : RED;
    const dimColor = dimScore >= 35 ? GREEN : dimScore >= 25 ? YELLOW : RED;
    const sysViol =
      r.aggregated.systematicViolations.length > 0
        ? r.aggregated.systematicViolations.join("; ")
        : `${DIM}none${RESET}`;

    console.log(
      `${r.writingType.padEnd(16)}${issueColor}${String(issues).padEnd(12)}${RESET}${dimColor}${String(dimScore).padEnd(12)}${RESET}${sysViol}`
    );
  }

  console.log(`\n${BOLD}── Overall ──${RESET}`);
  console.log(`  Total samples: ${result.overall.totalSamples}`);
  console.log(`  Avg mechanical issues: ${result.overall.avgMechanicalIssues}`);
  console.log(`  Avg dimension score: ${result.overall.avgDimensionScore}/50`);
  console.log(`  Best type:  ${GREEN}${result.overall.bestType}${RESET}`);
  console.log(`  Worst type: ${RED}${result.overall.worstType}${RESET}`);
  console.log();
}

function printComparisonSummary(result: ComparisonResult): void {
  console.log(`\n${BOLD}═══ Coached vs Uncoached Delta ═══${RESET}\n`);

  const dims = ["directness", "rhythm", "trust", "authenticity", "density"];
  const header = `${"Type".padEnd(16)}${"Mech Δ".padEnd(10)}${dims.map((d) => d.slice(0, 6).padEnd(10)).join("")}${"Total Δ".padEnd(10)}`;
  console.log(header);
  console.log("─".repeat(header.length));

  for (const r of result.results) {
    const mechDelta = r.delta.mechanicalDelta;
    const mechStr = (mechDelta <= 0 ? `▼ ${Math.abs(mechDelta)}` : `▲ ${mechDelta}`).padEnd(10);
    const mechColor = mechDelta <= 0 ? GREEN : RED;

    const dimStrs = dims.map((d) => {
      const v = r.delta.dimensionDeltas[d] ?? 0;
      const s = (v >= 0 ? `+${v}` : `${v}`).padEnd(10);
      const c = v > 0 ? GREEN : v < 0 ? RED : DIM;
      return `${c}${s}${RESET}`;
    });

    const totalDelta = r.delta.totalScoreDelta;
    const totalStr = (totalDelta >= 0 ? `+${totalDelta}` : `${totalDelta}`).padEnd(10);
    const totalColor = totalDelta > 0 ? GREEN : totalDelta < 0 ? RED : DIM;

    console.log(
      `${r.writingType.padEnd(16)}${mechColor}${mechStr}${RESET}${dimStrs.join("")}${totalColor}${totalStr}${RESET}`
    );
  }

  const o = result.overall;
  console.log(`\n${BOLD}── Net Delta ──${RESET}`);
  const dimColor = o.avgDimensionDelta > 0 ? GREEN : o.avgDimensionDelta < 0 ? RED : DIM;
  const mechColor = o.avgMechanicalDelta <= 0 ? GREEN : RED;
  console.log(`  Dimension score: ${dimColor}${o.avgDimensionDelta > 0 ? "+" : ""}${o.avgDimensionDelta}${RESET} points per sample`);
  console.log(`  Mechanical issues: ${mechColor}${o.avgMechanicalDelta <= 0 ? "" : "+"}${o.avgMechanicalDelta}${RESET} per sample`);

  console.log(`\n  ${BOLD}Per dimension:${RESET}`);
  for (const dim of dims) {
    const v = o.perDimensionDelta[dim] ?? 0;
    const c = v > 0 ? GREEN : v < 0 ? RED : DIM;
    console.log(`    ${dim.padEnd(15)} ${c}${v > 0 ? "+" : ""}${v}${RESET}`);
  }
  console.log();
}

// ── CLI ────────────────────────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(
      `Usage: npx tsx mcp/scripts/adversarial-test.ts [--mode coached|uncoached|comparison] [--save] [--types type1,type2]`
    );
    console.log(
      `  --mode       coached (default), uncoached (no profile), comparison (both + delta)`
    );
    console.log(
      `  --save       Save results to mcp/scripts/regression/`
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
  const modeIdx = args.indexOf("--mode");
  const mode = (modeIdx !== -1 && args[modeIdx + 1]) ? args[modeIdx + 1] : "coached";
  const typesIdx = args.indexOf("--types");
  let types: string[];

  if (typesIdx !== -1 && args[typesIdx + 1]) {
    types = args[typesIdx + 1].split(",").map((t) => t.trim());
  } else {
    types = Object.keys(ADVERSARIAL_PROMPTS);
  }

  const date = new Date().toISOString().slice(0, 10);
  const dir = join(import.meta.dirname ?? ".", "regression");

  if (mode === "comparison") {
    const result = runComparisonTests(types);
    printComparisonSummary(result);

    if (save) {
      mkdirSync(dir, { recursive: true });
      const outPath = join(dir, `comparison-${date}.json`);
      writeFileSync(outPath, JSON.stringify(result, null, 2));
      console.log(`${GREEN}Saved comparison to ${outPath}${RESET}`);
    }
  } else {
    const testMode = mode === "uncoached" ? "uncoached" : "coached";
    const result = runAdversarialTests(types, testMode as "coached" | "uncoached");
    printSummary(result);

    if (save) {
      mkdirSync(dir, { recursive: true });
      const outPath = join(dir, `${testMode}-${date}.json`);
      writeFileSync(outPath, JSON.stringify(result, null, 2));
      console.log(`${GREEN}Saved ${testMode} results to ${outPath}${RESET}`);
    }
  }
}

// Run main() only when executed directly
const __filename = fileURLToPath(import.meta.url);
const isDirectRun = resolve(process.argv[1] ?? "") === __filename;
if (isDirectRun) {
  main();
}
