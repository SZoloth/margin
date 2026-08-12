#!/usr/bin/env -S node --experimental-strip-types

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { scanWithRawRegex, scoreCases } from "./compare.ts";
import { loadExecutableRules } from "./database.ts";
import type { AdapterFixture } from "./types.ts";
import { runValeCases, validateValeCompatibility, valeVersion } from "./vale.ts";

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function requiredOption(args: string[], name: string): string {
  const value = option(args, name);
  if (!value) throw new Error(`missing required option ${name}`);
  return value;
}

function loadFixture(path: string): AdapterFixture {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as AdapterFixture;
  if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.rules) || !Array.isArray(parsed.cases)) {
    throw new Error("unsupported Vale adapter fixture");
  }
  return parsed;
}

function idsFromRaw(fixture: AdapterFixture): Map<string, string[]> {
  return new Map(
    fixture.cases.map((testCase) => [
      testCase.name,
      scanWithRawRegex(fixture.rules, testCase.input, testCase.writingType).map(
        (detection) => detection.ruleId,
      ),
    ]),
  );
}

function main(): void {
  const args = process.argv.slice(2);
  const databasePath = requiredOption(args, "--db");
  const valeBin = requiredOption(args, "--vale-bin");
  const valeRevision = requiredOption(args, "--vale-revision");
  const fixturePath = resolve(
    option(args, "--fixtures") ?? "experiments/vale-adapter/fixtures/cases.json",
  );

  const fixture = loadFixture(fixturePath);
  const live = loadExecutableRules(databasePath);
  const compatibility = validateValeCompatibility(valeBin, live.rules);
  const valeRun = runValeCases(valeBin, fixture.rules, fixture.cases);
  const rawByCase = idsFromRaw(fixture);
  const valeByCase = new Map(
    [...valeRun.alertsByCase].map(([name, alerts]) => [
      name,
      [...new Set(alerts.map((alert) => alert.ruleId))],
    ]),
  );
  const rawScore = scoreCases(fixture.cases, rawByCase);
  const valeScore = scoreCases(fixture.cases, valeByCase);
  const passed =
    compatibility.executableRules === live.rules.length &&
    valeScore.falseNegatives === 0 &&
    valeScore.falsePositives < rawScore.falsePositives;

  process.stdout.write(
    `${JSON.stringify(
      {
        schemaVersion: 1,
        database: live.database,
        source: {
          executableRules: live.rules.length,
          writingTypes: compatibility.writingTypes,
        },
        vale: {
          version: valeVersion(valeBin),
          sourceRevision: valeRevision,
          compatibleRules: compatibility.executableRules,
          compatibilityElapsedMs: Math.round(compatibility.elapsedMs * 100) / 100,
        },
        fixtures: {
          cases: fixture.cases.length,
          rawRegex: rawScore,
          vale: valeScore,
          valeElapsedMs: Math.round(valeRun.elapsedMs * 100) / 100,
        },
        decision: {
          passed,
          recommendation: passed
            ? "continue with an optional derived Vale evaluator"
            : "borrow Vale concepts without adding a runtime dependency",
        },
      },
      null,
      2,
    )}\n`,
  );
}

try {
  main();
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
