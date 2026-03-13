#!/usr/bin/env npx tsx

/**
 * Frozen evaluation harness for autoresearch.
 * Reads coaching-prompt.md, generates 27 samples (9 types × 3), scores them.
 * Outputs JSON to stdout. Do not modify this file during experiments.
 */

import { readFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";
import {
  ADVERSARIAL_PROMPTS,
  SAMPLES_PER_TYPE,
  REGISTER_MAP,
  loadWritingRulesForType,
  stripMetaCommentary,
  cleanEnv,
} from "../shared.ts";
import {
  runComplianceCheck,
  type ComplianceResult,
} from "../compliance-check.ts";

// ── Types ──────────────────────────────────────────────────────────────

interface SampleResult {
  type: string;
  sample: number;
  mechanicalIssues: number;
  dimensionTotal: number;
  pass: boolean;
  worstViolations: string[];
}

interface TypeSummary {
  type: string;
  passRate: number;
  avgMechanical: number;
  avgDimension: number;
  samples: SampleResult[];
}

export interface EvalResult {
  pass_rate: number;
  mean_dimension: number;
  total_mechanical: number;
  per_type: Record<string, TypeSummary>;
  worst_violations: string[];
  total_samples: number;
  duration_seconds: number;
}

// ── Helpers ────────────────────────────────────────────────────────────

function loadCoachingPrompt(): string {
  const promptPath = join(import.meta.dirname ?? ".", "coaching-prompt.md");
  if (!existsSync(promptPath)) {
    console.error(`coaching-prompt.md not found at ${promptPath}`);
    process.exit(1);
  }
  return readFileSync(promptPath, "utf-8");
}

function assemblePrompt(
  template: string,
  rules: string,
  type: string,
  register: string,
  prompt: string
): string {
  return template
    .replace("{{RULES}}", rules)
    .replace("{{TYPE}}", type)
    .replace("{{REGISTER}}", register)
    .replace("{{PROMPT}}", prompt);
}

function generate(fullPrompt: string): string {
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

function collectViolationLabels(compliance: ComplianceResult): string[] {
  const labels: string[] = [];
  for (const kw of compliance.mechanical.killWords) {
    labels.push(`Kill word: ${kw.word} (${kw.severity})`);
  }
  for (const sp of compliance.mechanical.slopPatterns) {
    labels.push(`Slop: ${sp.explanation}`);
  }
  for (const v of compliance.mechanical.voiceViolations) {
    labels.push(`Voice: ${v.type} — ${v.detail.slice(0, 80)}`);
  }
  for (const st of compliance.mechanical.structuralTells) {
    labels.push(`Structural: ${st.pattern}`);
  }
  return labels;
}

// ── Main evaluation ────────────────────────────────────────────────────

function runEval(): EvalResult {
  const startTime = Date.now();
  const template = loadCoachingPrompt();
  const types = Object.keys(ADVERSARIAL_PROMPTS);

  const allSamples: SampleResult[] = [];
  const perType: Record<string, TypeSummary> = {};
  const allViolations: string[] = [];

  for (const type of types) {
    const prompt = ADVERSARIAL_PROMPTS[type];
    const rules = loadWritingRulesForType(type);
    const register = REGISTER_MAP[type] ?? "casual";
    const typeSamples: SampleResult[] = [];

    console.error(`Evaluating ${type}...`);

    for (let i = 0; i < SAMPLES_PER_TYPE; i++) {
      console.error(`  Sample ${i + 1}/${SAMPLES_PER_TYPE}`);
      const fullPrompt = assemblePrompt(template, rules, type, register, prompt);
      const text = generate(fullPrompt);

      if (!text) {
        typeSamples.push({
          type,
          sample: i + 1,
          mechanicalIssues: 99,
          dimensionTotal: 0,
          pass: false,
          worstViolations: ["Generation failed"],
        });
        continue;
      }

      const compliance = runComplianceCheck(text, type);
      const mechIssues = compliance.summary.mechanicalIssues;
      const dimTotal = compliance.dimensions?.total ?? 0;
      const pass = mechIssues === 0 && dimTotal >= 35;
      const violations = collectViolationLabels(compliance);

      const sample: SampleResult = {
        type,
        sample: i + 1,
        mechanicalIssues: mechIssues,
        dimensionTotal: dimTotal,
        pass,
        worstViolations: violations,
      };

      typeSamples.push(sample);
      allViolations.push(...violations.map((v) => `[${type}] ${v}`));
    }

    const passCount = typeSamples.filter((s) => s.pass).length;
    const avgMech = typeSamples.reduce((s, x) => s + x.mechanicalIssues, 0) / typeSamples.length;
    const avgDim = typeSamples.reduce((s, x) => s + x.dimensionTotal, 0) / typeSamples.length;

    perType[type] = {
      type,
      passRate: Math.round((passCount / typeSamples.length) * 1000) / 1000,
      avgMechanical: Math.round(avgMech * 10) / 10,
      avgDimension: Math.round(avgDim * 10) / 10,
      samples: typeSamples,
    };

    allSamples.push(...typeSamples);
  }

  const totalPass = allSamples.filter((s) => s.pass).length;
  const totalMech = allSamples.reduce((s, x) => s + x.mechanicalIssues, 0);
  const meanDim = allSamples.reduce((s, x) => s + x.dimensionTotal, 0) / allSamples.length;

  // Deduplicate and count violations for worst_violations
  const violationCounts = new Map<string, number>();
  for (const v of allViolations) {
    violationCounts.set(v, (violationCounts.get(v) ?? 0) + 1);
  }
  const worstViolations = Array.from(violationCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([v, count]) => `${v} (×${count})`);

  return {
    pass_rate: Math.round((totalPass / allSamples.length) * 1000) / 1000,
    mean_dimension: Math.round(meanDim * 10) / 10,
    total_mechanical: totalMech,
    per_type: perType,
    worst_violations: worstViolations,
    total_samples: allSamples.length,
    duration_seconds: Math.round((Date.now() - startTime) / 1000),
  };
}

// ── CLI ────────────────────────────────────────────────────────────────

const result = runEval();
console.log(JSON.stringify(result, null, 2));
