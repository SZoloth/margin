#!/usr/bin/env npx tsx

/**
 * Runs all 4 architecture variants sequentially and outputs a comparison table.
 *
 * Usage: npx tsx baseline-all.ts
 */

import { execSync } from "child_process";
import { join } from "path";
import { writeFileSync } from "fs";
import { cleanEnv } from "../shared.ts";
import type { EvalResult } from "./score.ts";

const ARCHITECTURES = ["a", "b", "c", "d"] as const;

const ARCH_NAMES: Record<string, string> = {
  a: "A (rules)",
  b: "B (exemplars)",
  c: "C (editor)",
  d: "D (corrections)",
};

interface ArchResult {
  arch: string;
  name: string;
  result: EvalResult | null;
  error?: string;
}

function runArch(arch: string): ArchResult {
  const name = ARCH_NAMES[arch] ?? arch;
  const evalPath = join(import.meta.dirname ?? ".", "eval.ts");

  console.error(`\n${"=".repeat(60)}`);
  console.error(`Running Architecture ${name}...`);
  console.error(`${"=".repeat(60)}\n`);

  try {
    const output = execSync(`npx tsx ${evalPath} --arch ${arch}`, {
      encoding: "utf-8",
      timeout: 1_200_000, // 20 minutes per architecture (C needs 2x calls)
      maxBuffer: 10 * 1024 * 1024,
      env: cleanEnv(),
      stdio: ["pipe", "pipe", "inherit"], // stderr passes through for progress
    });

    const result = JSON.parse(output) as EvalResult;
    return { arch, name, result };
  } catch (err) {
    const message = (err as Error).message;
    console.error(`Architecture ${name} failed: ${message}`);
    return { arch, name, result: null, error: message };
  }
}

function padRight(str: string, len: number): string {
  return str.length >= len ? str : str + " ".repeat(len - str.length);
}

function padLeft(str: string, len: number): string {
  return str.length >= len ? str : " ".repeat(len - str.length) + str;
}

function printComparisonTable(results: ArchResult[]): void {
  const header = `${padRight("Architecture", 16)}| ${padLeft("Pass Rate", 10)} | ${padLeft("Mean Dim", 9)} | ${padLeft("Total Mech", 11)} | ${padLeft("Duration", 9)}`;
  const separator = "\u2500".repeat(header.length);

  console.log(`\n${separator}`);
  console.log(header);
  console.log(separator);

  for (const { name, result, error } of results) {
    if (!result) {
      console.log(`${padRight(name, 16)}| ${padLeft("FAILED", 10)} | ${padLeft("-", 9)} | ${padLeft("-", 11)} | ${padLeft("-", 9)}`);
      continue;
    }

    const passRate = result.pass_rate.toFixed(3);
    const meanDim = result.mean_dimension.toFixed(1);
    const totalMech = String(result.total_mechanical);
    const duration = `${result.duration_seconds}s`;

    console.log(
      `${padRight(name, 16)}| ${padLeft(passRate, 10)} | ${padLeft(meanDim, 9)} | ${padLeft(totalMech, 11)} | ${padLeft(duration, 9)}`
    );
  }

  console.log(separator);
}

// ── Main ──────────────────────────────────────────────────────────────

const allResults: ArchResult[] = [];

for (const arch of ARCHITECTURES) {
  const archResult = runArch(arch);
  allResults.push(archResult);
}

// Print comparison table to stdout
printComparisonTable(allResults);

// Write full results to file
const timestamp = new Date().toISOString().slice(0, 10);
const outputPath = join(
  import.meta.dirname ?? ".",
  "..",
  "regression",
  `baseline-all-${timestamp}.json`
);

const fullOutput = {
  timestamp: new Date().toISOString(),
  results: Object.fromEntries(
    allResults.map((r) => [r.arch, r.result ?? { error: r.error }])
  ),
};

try {
  writeFileSync(outputPath, JSON.stringify(fullOutput, null, 2));
  console.error(`\nFull results written to: ${outputPath}`);
} catch {
  // regression directory may not exist; print to stderr instead
  console.error(`\nCould not write to ${outputPath} — printing full JSON:`);
  console.error(JSON.stringify(fullOutput, null, 2));
}
