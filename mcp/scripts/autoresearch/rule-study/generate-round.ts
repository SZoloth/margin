#!/usr/bin/env npx tsx

/**
 * Rule Study: Generate samples for a review round.
 *
 * Usage:
 *   npx tsx generate-round.ts --round baseline [--prompt-index 0]
 *   npx tsx generate-round.ts --round 2 --prompt-index 1
 *   npx tsx generate-round.ts --round final --prompt-index 2 --samples-per-type 3
 *
 * Generates one sample per type (or N for final validation), saves to:
 *   results/<round>.json  — full data (text, proxy scores, metadata)
 *   samples/<round>/      — one .md file per sample for opening in Margin
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { parseArgs } from "util";

import {
  BASELINE_TYPES,
  REGISTER_MAP,
  getPrompt,
  type WritingType,
} from "./types.ts";
import { runComplianceCheck } from "../../compliance-check.ts";
import { collectViolationLabels } from "../score.ts";

interface SampleRecord {
  type: WritingType;
  register: string;
  promptIndex: number;
  prompt: string;
  sampleIndex: number;
  text: string;
  filePath: string;
  proxy: {
    pass: boolean;
    mechIssues: number;
    dimTotal: number;
    violations: string[];
  };
}

interface RoundResult {
  round: string;
  generatedAt: string;
  promptIndex: number;
  samplesPerType: number;
  samples: SampleRecord[];
  summary: {
    total: number;
    generated: number;
    failed: number;
    proxyPassRate: number;
  };
}

const SCRIPT_DIR = new URL(".", import.meta.url).pathname;
const RESULTS_DIR = join(SCRIPT_DIR, "results");
const SAMPLES_DIR = join(SCRIPT_DIR, "samples");

async function main() {
  const { values } = parseArgs({
    options: {
      round: { type: "string", default: "baseline" },
      "prompt-index": { type: "string", default: "0" },
      "samples-per-type": { type: "string", default: "1" },
    },
  });

  const round = values.round!;
  const promptIndex = parseInt(values["prompt-index"]!, 10);
  const samplesPerType = parseInt(values["samples-per-type"]!, 10);

  console.error(`\n=== Rule Study: Round "${round}" ===`);
  console.error(`Prompt index: ${promptIndex}, Samples/type: ${samplesPerType}`);
  console.error(`Types: ${BASELINE_TYPES.length}\n`);

  // Import generator
  const { generate } = await import("../generators/arch-e-hybrid.ts");

  // Create output directories
  const roundSamplesDir = join(SAMPLES_DIR, round);
  mkdirSync(RESULTS_DIR, { recursive: true });
  mkdirSync(roundSamplesDir, { recursive: true });

  const samples: SampleRecord[] = [];
  let failed = 0;

  for (const type of BASELINE_TYPES) {
    const register = REGISTER_MAP[type];
    const prompt = getPrompt(type, promptIndex);

    for (let si = 0; si < samplesPerType; si++) {
      const label = samplesPerType > 1 ? `${type} (${si + 1}/${samplesPerType})` : type;
      console.error(`Generating ${label}...`);

      const text = generate(type, prompt, register);

      if (!text) {
        console.error(`  FAILED — skipping`);
        failed++;
        continue;
      }

      // Run proxy scorer (not shown to Sam — correlation data only)
      const compliance = runComplianceCheck(text, type);
      const mechIssues = compliance.summary.mechanicalIssues;
      const dimTotal = compliance.dimensions?.total ?? 0;
      const pass = mechIssues === 0 && dimTotal >= 35;
      const violations = collectViolationLabels(compliance);

      // Write sample as .md file for Margin
      const fileName = samplesPerType > 1
        ? `${type}-${si + 1}.md`
        : `${type}.md`;
      const filePath = join(roundSamplesDir, fileName);

      // Title line helps identify the sample in Margin's document list
      const mdContent = `# Rule Study: ${type} (Round ${round})\n\n${text}`;
      writeFileSync(filePath, mdContent, "utf-8");

      const record: SampleRecord = {
        type,
        register,
        promptIndex,
        prompt,
        sampleIndex: si,
        text,
        filePath,
        proxy: { pass, mechIssues, dimTotal, violations },
      };

      samples.push(record);

      const proxyLabel = pass ? "PASS" : `FAIL (${mechIssues} mech, ${dimTotal} dim)`;
      console.error(`  ${proxyLabel} → ${fileName}`);
    }
  }

  // Summary
  const proxyPasses = samples.filter((s) => s.proxy.pass).length;
  const result: RoundResult = {
    round,
    generatedAt: new Date().toISOString(),
    promptIndex,
    samplesPerType,
    samples,
    summary: {
      total: BASELINE_TYPES.length * samplesPerType,
      generated: samples.length,
      failed,
      proxyPassRate: samples.length > 0
        ? Math.round((proxyPasses / samples.length) * 1000) / 1000
        : 0,
    },
  };

  // Save results JSON
  const resultPath = join(RESULTS_DIR, `${round}.json`);
  writeFileSync(resultPath, JSON.stringify(result, null, 2), "utf-8");

  console.error(`\n=== Summary ===`);
  console.error(`Generated: ${samples.length}/${result.summary.total}`);
  console.error(`Failed: ${failed}`);
  console.error(`Proxy pass rate: ${(result.summary.proxyPassRate * 100).toFixed(1)}%`);
  console.error(`\nResults: ${resultPath}`);
  console.error(`Samples: ${roundSamplesDir}/`);
  console.error(`\nNext: Open samples in Margin, review and correct, then run extract-round.ts`);
}

main();
