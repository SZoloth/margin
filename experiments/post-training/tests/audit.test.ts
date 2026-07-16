import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { auditMarginDatabase } from "../src/audit.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("read-only Margin database auditor", () => {
  it("emits counts and hashes without changing or exposing corpus text", () => {
    const directory = mkdtempSync(join(tmpdir(), "margin-post-training-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "fixture.db");
    execFileSync("sqlite3", [
      databasePath,
      `
        CREATE TABLE corrections (
          id TEXT PRIMARY KEY,
          original_text TEXT,
          suggested_edit TEXT,
          rationale TEXT,
          accepted_at TEXT,
          feedback_type TEXT
        );
        CREATE TABLE writing_rules (id TEXT PRIMARY KEY, rule_text TEXT);
        INSERT INTO corrections VALUES
          ('correction-1', 'PRIVATE FIXTURE SENTENCE', NULL, NULL, NULL, NULL),
          ('correction-2', 'ANOTHER PRIVATE SENTENCE', '', '', NULL, '');
        INSERT INTO writing_rules VALUES ('rule-1', 'PRIVATE FIXTURE RULE');
      `,
    ]);
    const before = readFileSync(databasePath);

    const result = auditMarginDatabase(databasePath);
    const after = readFileSync(databasePath);

    expect(after).toEqual(before);
    expect(result.database.unchanged).toBe(true);
    expect(result.counts).toMatchObject({
      corrections: 2,
      writingRules: 1,
      suggestedEditPopulated: 0,
      rationalePopulated: 0,
      acceptedAtPopulated: 0,
      feedbackTypePopulated: 0,
    });
    expect(JSON.stringify(result)).not.toContain("PRIVATE FIXTURE");
    expect(result.manifest.correctionIdsHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.manifest.writingRuleIdsHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("fails closed when a WAL could contain newer writes", () => {
    const directory = mkdtempSync(join(tmpdir(), "margin-post-training-wal-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "fixture.db");
    execFileSync("sqlite3", [
      databasePath,
      "CREATE TABLE corrections (id TEXT); CREATE TABLE writing_rules (id TEXT);",
    ]);
    writeFileSync(`${databasePath}-wal`, "pending-write-fixture");

    expect(() => auditMarginDatabase(databasePath)).toThrow(
      /non-empty WAL prevents an immutable audit/,
    );
  });
});
