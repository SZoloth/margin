import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { compileValeProject, type ValeProject } from "./compiler.ts";
import type { FixtureCase, MarginRule, ValeAlert } from "./types.ts";

interface RawValeAlert {
  Check?: unknown;
  Severity?: unknown;
  Message?: unknown;
  Match?: unknown;
  Line?: unknown;
  Span?: unknown;
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberField(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

export function parseValeAlerts(
  output: string,
  checkToRuleId: Readonly<Record<string, string>>,
): ValeAlert[] {
  const parsed = JSON.parse(output) as Record<string, RawValeAlert[]>;
  const alerts: ValeAlert[] = [];

  for (const [path, rows] of Object.entries(parsed)) {
    for (const row of rows) {
      const check = stringField(row.Check);
      const ruleId = checkToRuleId[check];
      if (!ruleId) continue;
      const rawSpan = Array.isArray(row.Span) ? row.Span : [];
      alerts.push({
        path,
        ruleId,
        severity: stringField(row.Severity),
        message: stringField(row.Message),
        match: stringField(row.Match),
        line: numberField(row.Line),
        span: [numberField(rawSpan[0]), numberField(rawSpan[1])],
      });
    }
  }

  return alerts.sort(
    (a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.span[0] - b.span[0],
  );
}

function materialize(project: ValeProject, root: string): void {
  for (const [relativePath, content] of Object.entries(project.files)) {
    const destination = join(root, relativePath);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, content, "utf8");
  }
}

function runVale(
  valeBin: string,
  projectRoot: string,
  documentPath: string,
  checkToRuleId: Readonly<Record<string, string>>,
): ValeAlert[] {
  const result = spawnSync(
    valeBin,
    [
      "--no-global",
      `--config=${join(projectRoot, ".vale.ini")}`,
      "--output=JSON",
      documentPath,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (result.error) throw result.error;
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(result.stderr.trim() || `Vale exited with ${result.status}`);
  }
  return parseValeAlerts(result.stdout, checkToRuleId);
}

export interface ValeCaseRun {
  alertsByCase: Map<string, ValeAlert[]>;
  elapsedMs: number;
}

export function runValeCases(
  valeBin: string,
  rules: readonly MarginRule[],
  cases: readonly FixtureCase[],
): ValeCaseRun {
  const root = mkdtempSync(join(tmpdir(), "margin-vale-cases-"));
  const start = performance.now();
  const alertsByCase = new Map<string, ValeAlert[]>();

  try {
    for (const testCase of cases) {
      const caseRoot = join(root, testCase.name.replace(/[^A-Za-z0-9]+/g, "-"));
      const project = compileValeProject(rules, testCase.writingType);
      materialize(project, caseRoot);
      const documentPath = join(caseRoot, basename(testCase.path));
      writeFileSync(documentPath, testCase.input, "utf8");
      alertsByCase.set(
        testCase.name,
        runVale(resolve(valeBin), caseRoot, documentPath, project.checkToRuleId),
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  return { alertsByCase, elapsedMs: performance.now() - start };
}

export function validateValeCompatibility(
  valeBin: string,
  rules: readonly MarginRule[],
): { writingTypes: string[]; executableRules: number; elapsedMs: number } {
  const writingTypes = [...new Set(rules.map((rule) => rule.writingType))].sort();
  const cases = writingTypes.map((writingType) => ({
    name: `compatibility-${writingType}`,
    writingType,
    path: `${writingType}.md`,
    input: "A neutral compatibility document.",
    expectedRuleIds: [],
  }));
  const run = runValeCases(valeBin, rules, cases);
  return {
    writingTypes,
    executableRules: compileValeProject(rules).executableRuleIds.length,
    elapsedMs: run.elapsedMs,
  };
}

export function valeVersion(valeBin: string): string {
  const result = spawnSync(resolve(valeBin), ["--version"], { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.trim() || "Unable to read Vale version");
  return result.stdout.trim();
}
