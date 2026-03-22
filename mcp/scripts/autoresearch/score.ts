/**
 * Scoring bridge between eval.ts and compliance-check.ts.
 *
 * eval.ts generates raw text samples, delegates all scoring here.
 * This module runs compliance checks and aggregates into EvalResult.
 */

import {
  runComplianceCheck,
  type ComplianceResult,
} from "../compliance-check.ts";

// ── Types ─────────────────────────────────────────────────────────────

export interface GeneratedSample {
  type: string;
  text: string;
  sampleIndex: number;
}

export interface SampleResult {
  type: string;
  sampleIndex: number;
  text: string;
  compliance: ComplianceResult;
  pass: boolean;
}

export interface EvalResult {
  arch: string;
  pass_rate: number;
  mean_dimension: number;
  total_mechanical: number;
  worst_violations: string[];
  total_samples: number;
  duration_seconds: number;
  samples: SampleResult[];
}

// ── Violation label extraction ─────────────────────────────────────────

export function collectViolationLabels(result: ComplianceResult): string[] {
  const labels: string[] = [];

  for (const hit of result.mechanical.killWords) {
    labels.push(`kill-word:${hit.word}`);
  }
  for (const hit of result.mechanical.slopPatterns) {
    labels.push(`slop:${hit.pattern}`);
  }
  for (const v of result.mechanical.voiceViolations) {
    labels.push(`voice:${v.type}`);
  }
  for (const hit of result.mechanical.structuralTells) {
    labels.push(`structural:${hit.pattern}`);
  }

  return labels;
}

// ── Aggregation ────────────────────────────────────────────────────────

export async function scoreSamples(
  samples: GeneratedSample[],
  archLabel: string,
  startTime: number
): Promise<EvalResult> {
  const results: SampleResult[] = [];
  const violationCounts = new Map<string, number>();

  for (const sample of samples) {
    if (!sample.text) {
      // Empty text (generation failure) — count as fail with max mechanical issues
      results.push({
        type: sample.type,
        sampleIndex: sample.sampleIndex,
        text: "",
        compliance: {
          mechanical: { killWords: [], slopPatterns: [], voiceViolations: [], structuralTells: [] },
          summary: { mechanicalIssues: 1, dimensionScore: 0, pass: false },
        },
        pass: false,
      });
      continue;
    }

    const compliance = runComplianceCheck(sample.text, sample.type);
    const pass = compliance.summary.pass;

    results.push({
      type: sample.type,
      sampleIndex: sample.sampleIndex,
      text: sample.text,
      compliance,
      pass,
    });

    // Tally violations for worst_violations
    for (const label of collectViolationLabels(compliance)) {
      violationCounts.set(label, (violationCounts.get(label) ?? 0) + 1);
    }
  }

  const passCount = results.filter((r) => r.pass).length;
  const pass_rate = results.length > 0 ? passCount / results.length : 0;

  const dimensionScores = results
    .map((r) => r.compliance.summary.dimensionScore ?? 0)
    .filter((s) => s > 0);
  const mean_dimension =
    dimensionScores.length > 0
      ? dimensionScores.reduce((a, b) => a + b, 0) / dimensionScores.length
      : 0;

  const total_mechanical = results.reduce(
    (sum, r) => sum + r.compliance.summary.mechanicalIssues,
    0
  );

  // Top 5 most frequent violations
  const worst_violations = [...violationCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count]) => `${label} (×${count})`);

  return {
    arch: archLabel,
    pass_rate: Math.round(pass_rate * 1000) / 1000,
    mean_dimension: Math.round(mean_dimension * 10) / 10,
    total_mechanical,
    worst_violations,
    total_samples: results.length,
    duration_seconds: Math.round((Date.now() - startTime) / 100) / 10,
    samples: results,
  };
}
