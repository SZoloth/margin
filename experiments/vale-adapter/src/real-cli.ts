#!/usr/bin/env -S node --experimental-strip-types

import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { scanWithRawRegex } from "./compare.ts";
import { loadCatalogDocuments, loadExecutableRules } from "./database.ts";
import {
  assertPrivateOutputPath,
  buildPrivateReview,
  selectRealDocuments,
  summarizeRealValidation,
  type DocumentValidation,
  type PrivateReviewItem,
} from "./real-corpus.ts";
import type { FixtureCase, MarginRule } from "./types.ts";
import { runValeCases, valeVersion } from "./vale.ts";

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function requiredOption(args: string[], name: string): string {
  const value = option(args, name);
  if (!value) throw new Error(`missing required option ${name}`);
  return value;
}

function readLocal(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

function markdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

function renderReview(
  items: readonly PrivateReviewItem[],
  rules: ReadonlyMap<string, MarginRule>,
): string {
  const lines = [
    "# Vale validation review",
    "",
    "Label each row `violation`, `acceptable`, or `uncertain` in `review.json`. A correction on the document only means Margin has prior feedback for the file; it does not label this alert.",
    "",
    "| # | Engines | Prior corrections | File | Rule | Match | Context |",
    "|---:|---|---|---|---|---|---|",
  ];
  items.forEach((item, index) => {
    const engines = item.rawDetected && item.valeDetected ? "both" : item.rawDetected ? "raw" : "Vale";
    const rule = rules.get(item.ruleId)?.ruleText ?? item.ruleId;
    lines.push(
      `| ${index + 1} | ${engines} | ${item.correctionHistoryAvailable ? "yes" : "no"} | ${markdownCell(item.documentPath)} | ${markdownCell(rule)} | ${markdownCell(item.matchedText)} | ${markdownCell(item.excerpt)} |`,
    );
  });
  return `${lines.join("\n")}\n`;
}

function main(): void {
  const args = process.argv.slice(2);
  const databasePath = requiredOption(args, "--db");
  const valeBin = requiredOption(args, "--vale-bin");
  const valeRevision = requiredOption(args, "--vale-revision");
  const outputDirectory = assertPrivateOutputPath(requiredOption(args, "--out"), homedir());
  const limit = Number(option(args, "--limit") ?? "30");
  if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit must be a positive integer");

  const live = loadExecutableRules(databasePath);
  const catalog = loadCatalogDocuments(databasePath);
  if (live.database.sha256Before !== catalog.database.sha256Before) {
    throw new Error("database changed between rule and catalog reads");
  }
  const selection = selectRealDocuments(catalog.documents, { limit, read: readLocal });
  if (selection.documents.length !== limit) {
    throw new Error(`requested ${limit} documents but selected ${selection.documents.length}`);
  }

  const cases: FixtureCase[] = selection.documents.map((document) => ({
    name: document.id,
    writingType: document.writingType,
    path: basename(document.filePath),
    input: document.content,
    expectedRuleIds: [],
  }));
  const valeRun = runValeCases(valeBin, live.rules, cases);
  const results: DocumentValidation[] = selection.documents.map((document) => ({
    documentId: document.id,
    path: document.filePath,
    content: document.content,
    raw: scanWithRawRegex(live.rules, document.content, document.writingType),
    vale: valeRun.alertsByCase.get(document.id) ?? [],
    correctionCount: document.correctionCount,
    labelStatus: document.labelStatus,
  }));
  const aggregate = summarizeRealValidation(results);
  const review = buildPrivateReview(results);
  const rules = new Map(live.rules.map((rule) => [rule.id, rule]));
  const generatedAt = new Date().toISOString();

  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(
    join(outputDirectory, "manifest.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt,
        database: live.database,
        vale: { version: valeVersion(valeBin), sourceRevision: valeRevision },
        selection: {
          requested: limit,
          selected: selection.documents.map((document) => ({
            documentId: document.id,
            path: document.filePath,
            contentSha256: document.contentSha256,
            wordCount: document.wordCount,
            writingType: document.writingType,
            correctionCount: document.correctionCount,
            labelStatus: document.labelStatus,
          })),
          skips: selection.skips,
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  writeFileSync(join(outputDirectory, "review.json"), `${JSON.stringify(review, null, 2)}\n`, "utf8");
  writeFileSync(join(outputDirectory, "review.md"), renderReview(review, rules), "utf8");

  const publicReport = {
    schemaVersion: 1,
    generatedAt,
    database: live.database,
    corpus: aggregate,
    vale: {
      version: valeVersion(valeBin),
      sourceRevision: valeRevision,
      elapsedMs: Math.round(valeRun.elapsedMs * 100) / 100,
    },
    decision: {
      promotionGate: review.length === 0 ? "no-alerts-to-label" : "pending-human-labels",
      requiredLabels: review.length,
      interpretation:
        "Correction history enriches the sample but does not label current alerts. Unreviewed alerts cannot support precision, recall, or promotion claims.",
    },
  };
  writeFileSync(join(outputDirectory, "aggregate.json"), `${JSON.stringify(publicReport, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(publicReport, null, 2)}\n`);
}

try {
  main();
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
