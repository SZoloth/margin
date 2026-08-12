import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadCatalogDocuments, loadExecutableRules } from "../src/database.ts";

const tempPaths: string[] = [];

function fixtureDatabase(): string {
  const root = mkdtempSync(join(tmpdir(), "margin-vale-db-"));
  tempPaths.push(root);
  const databasePath = join(root, "margin.db");
  const sql = `
    CREATE TABLE writing_rules (
      id TEXT PRIMARY KEY,
      writing_type TEXT NOT NULL,
      category TEXT NOT NULL,
      rule_text TEXT NOT NULL,
      severity TEXT NOT NULL,
      detection_pattern TEXT,
      example_before TEXT,
      example_after TEXT,
      notes TEXT,
      source TEXT NOT NULL,
      reviewed_at INTEGER
    );
    INSERT INTO writing_rules VALUES
      ('ready', 'general', 'ai-slop', 'Ready', 'should-fix', 'ready', NULL, NULL, NULL, 'manual', 1),
      ('pending', 'general', 'ai-slop', 'Pending', 'must-fix', 'pending', NULL, NULL, NULL, 'synthesis-candidate', NULL),
      ('judgment', 'general', 'voice', 'Judgment', 'should-fix', NULL, NULL, NULL, NULL, 'manual', 1);
    CREATE TABLE documents (
      id TEXT PRIMARY KEY,
      file_path TEXT,
      word_count INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE corrections (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      writing_type TEXT
    );
    INSERT INTO documents VALUES ('doc', '/private/doc.md', 250, 10);
    INSERT INTO corrections VALUES ('correction', 'doc', 'blog');
  `;
  const result = spawnSync("sqlite3", [databasePath, sql], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return databasePath;
}

afterEach(() => {
  for (const path of tempPaths.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("loadExecutableRules", () => {
  it("loads reviewed detection rules without changing the database", () => {
    const result = loadExecutableRules(fixtureDatabase());

    expect(result.rules.map((rule) => rule.id)).toEqual(["ready"]);
    expect(result.database.unchanged).toBe(true);
    expect(result.database.sha256After).toBe(result.database.sha256Before);
  });

  it("loads document metadata and correction counts without document text", () => {
    const result = loadCatalogDocuments(fixtureDatabase());

    expect(result.documents).toEqual([
      {
        id: "doc",
        filePath: "/private/doc.md",
        wordCount: 250,
        createdAt: 10,
        correctionCount: 1,
        writingType: "blog",
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("original_text");
    expect(result.database.unchanged).toBe(true);
  });

  it("rejects an immutable read while a non-empty WAL is present", () => {
    const databasePath = fixtureDatabase();
    writeFileSync(`${databasePath}-wal`, "pending write", "utf8");

    expect(() => loadExecutableRules(databasePath)).toThrow(
      "non-empty WAL prevents an immutable rule read",
    );
  });
});
