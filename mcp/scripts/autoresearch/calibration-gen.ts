#!/usr/bin/env npx tsx

/**
 * Generate 9 calibration samples (1 per writing type) with proxy scores.
 * Outputs JSON to stdout.
 */

import { writeFileSync } from "fs";
import { ADVERSARIAL_PROMPTS, REGISTER_MAP } from "../shared.ts";
import { runComplianceCheck } from "../compliance-check.ts";
import { collectViolationLabels } from "./score.ts";

// Dynamic import to match eval.ts pattern
async function main() {
  const { generate } = await import("./generators/arch-e-hybrid.ts");

  const types = Object.keys(ADVERSARIAL_PROMPTS);
  const results: {
    type: string;
    register: string;
    text: string;
    proxy: {
      pass: boolean;
      mechIssues: number;
      dimTotal: number;
      violations: string[];
    };
  }[] = [];

  for (const type of types) {
    const prompt = ADVERSARIAL_PROMPTS[type];
    const register = REGISTER_MAP[type] ?? "casual";

    console.error(`Generating ${type}...`);
    const text = generate(type, prompt, register);

    if (!text) {
      console.error(`  FAILED — skipping`);
      continue;
    }

    const compliance = runComplianceCheck(text, type);
    const mechIssues = compliance.summary.mechanicalIssues;
    const dimTotal = compliance.dimensions?.total ?? 0;
    const pass = mechIssues === 0 && dimTotal >= 35;
    const violations = collectViolationLabels(compliance);

    results.push({
      type,
      register,
      text,
      proxy: { pass, mechIssues, dimTotal, violations },
    });
  }

  console.log(JSON.stringify(results, null, 2));
  console.error(`\nGenerated ${results.length} samples.`);
}

main();
