#!/usr/bin/env npx tsx

/**
 * Evaluation harness for autoresearch.
 * Generates 27 samples (9 types x 3) using the selected architecture, scores them.
 * Outputs JSON to stdout.
 *
 * Usage:
 *   npx tsx eval.ts              # Architecture A (default, backward compat)
 *   npx tsx eval.ts --arch b     # Architecture B (exemplars)
 *   npx tsx eval.ts --arch c     # Architecture C (two-pass editor)
 *   npx tsx eval.ts --arch d     # Architecture D (corrections)
 *   npx tsx eval.ts --arch e     # Architecture E (hybrid, leading)
 *   npx tsx eval.ts --arch f     # Architecture F (Aegis governance schema)
 *   npx tsx eval.ts --arch h     # Architecture H (DSPy-optimized)
 *   npx tsx eval.ts --arch null  # Null hypothesis (zero-shot, no coaching)
 */

import {
  ADVERSARIAL_PROMPTS,
  SAMPLES_PER_TYPE,
  REGISTER_MAP,
} from "../shared.ts";
import {
  type ComplianceResult,
} from "../compliance-check.ts";
import {
  scoreSamples,
  collectViolationLabels,
  type GeneratedSample,
  type SampleResult,
  type EvalResult,
} from "./score.ts";

// Re-export types for backward compatibility
export type { SampleResult, EvalResult };

// ── Architecture loader ───────────────────────────────────────────────

type GenerateFn = (type: string, prompt: string, register: string) => string;

const ARCH_LABELS: Record<string, string> = {
  a: "rules",
  "a-top10": "rules-top10-klaassen",
  b: "exemplars",
  c: "editor",
  d: "corrections",
  "d-chrono": "corrections-chrono-lehmann",
  e: "hybrid",
  f: "aegis",
  h: "dspy",
  null: "null-hypothesis",
};

async function loadGenerator(arch: string): Promise<GenerateFn> {
  switch (arch) {
    case "a":
      return (await import("./generators/arch-a-rules.ts")).generate;
    case "a-top10":
      return (await import("./generators/arch-a-top10.ts")).generate;
    case "b":
      return (await import("./generators/arch-b-exemplars.ts")).generate;
    case "c":
      return (await import("./generators/arch-c-editor.ts")).generate;
    case "d":
      return (await import("./generators/arch-d-corrections.ts")).generate;
    case "d-chrono":
      return (await import("./generators/arch-d-chrono.ts")).generate;
    case "e":
      return (await import("./generators/arch-e-hybrid.ts")).generate;
    case "f":
      return (await import("./generators/arch-f-aegis.ts")).generate;
    case "h":
      return (await import("./generators/arch-h-dspy.ts")).generate;
    case "null":
      return (await import("./generators/arch-null.ts")).generate;
    default:
      console.error(`Unknown architecture: ${arch}. Use a, a-top10, b, c, d, d-chrono, e, f, h, or null.`);
      process.exit(1);
  }
}

// ── Parse args ────────────────────────────────────────────────────────

function parseArch(): string {
  const args = process.argv.slice(2);
  const archIdx = args.indexOf("--arch");
  if (archIdx === -1 || archIdx + 1 >= args.length) return "a";
  const value = args[archIdx + 1];
  if (!value || !["a", "a-top10", "b", "c", "d", "d-chrono", "e", "f", "h", "null"].includes(value)) {
    console.error(`Invalid --arch value: ${value}. Use a, a-top10, b, c, d, d-chrono, e, f, h, or null.`);
    process.exit(1);
  }
  return value;
}

// ── Main evaluation ───────────────────────────────────────────────────

async function runEval(): Promise<EvalResult> {
  const arch = parseArch();
  const label = ARCH_LABELS[arch] ?? arch;
  const generate = await loadGenerator(arch);
  const startTime = Date.now();
  const types = Object.keys(ADVERSARIAL_PROMPTS);

  const samples: GeneratedSample[] = [];

  for (const type of types) {
    const prompt = ADVERSARIAL_PROMPTS[type];
    const register = REGISTER_MAP[type] ?? "casual";

    console.error(`[arch-${arch}] Evaluating ${type}...`);

    for (let i = 0; i < SAMPLES_PER_TYPE; i++) {
      console.error(`  Sample ${i + 1}/${SAMPLES_PER_TYPE}`);
      let text = generate(type, prompt, register);

      // Retry once on generation failure
      if (!text) {
        console.error(`  Retrying sample ${i + 1}...`);
        text = generate(type, prompt, register);
      }

      samples.push({
        type,
        text,
        sampleIndex: i + 1,
      });
    }
  }

  return scoreSamples(samples, `${arch} (${label})`, startTime);
}

// ── CLI ─────────────────────────────────────────────────────────────

runEval().then((result) => {
  console.log(JSON.stringify(result, null, 2));
});
