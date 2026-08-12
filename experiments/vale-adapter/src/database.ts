import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { CatalogDocument } from "./real-corpus.ts";
import type { MarginRule } from "./types.ts";

interface RuleRow {
  id: string;
  writingType: string;
  category: string;
  ruleText: string;
  severity: string;
  detectionPattern: string | null;
  exampleBefore: string | null;
  exampleAfter: string | null;
  notes: string | null;
  source: string;
  reviewedAt: number | null;
}

function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export interface LiveRuleLoad {
  rules: MarginRule[];
  database: {
    accessMode: "mode=ro&immutable=1";
    sha256Before: string;
    sha256After: string;
    unchanged: boolean;
  };
}

interface DatabaseReceipt {
  accessMode: "mode=ro&immutable=1";
  sha256Before: string;
  sha256After: string;
  unchanged: boolean;
}

interface CatalogRow {
  id: string;
  filePath: string | null;
  wordCount: number;
  createdAt: number;
  correctionCount: number;
  writingType: string;
}

export interface CatalogLoad {
  documents: CatalogDocument[];
  database: DatabaseReceipt;
}

function immutableDatabase(databasePath: string): {
  absolutePath: string;
  url: URL;
  before: string;
} {
  const absolutePath = resolve(databasePath);
  const walPath = `${absolutePath}-wal`;
  if (existsSync(walPath) && statSync(walPath).size > 0) {
    throw new Error("non-empty WAL prevents an immutable rule read");
  }
  const before = hashFile(absolutePath);
  const url = new URL(pathToFileURL(absolutePath));
  url.searchParams.set("mode", "ro");
  url.searchParams.set("immutable", "1");
  return { absolutePath, url, before };
}

function receipt(absolutePath: string, before: string): DatabaseReceipt {
  const after = hashFile(absolutePath);
  if (before !== after) throw new Error("database changed during immutable rule read");
  return {
    accessMode: "mode=ro&immutable=1",
    sha256Before: before,
    sha256After: after,
    unchanged: true,
  };
}

export function loadExecutableRules(databasePath: string): LiveRuleLoad {
  const database = immutableDatabase(databasePath);
  const sql = `
    PRAGMA query_only=ON;
    SELECT
      id,
      writing_type AS writingType,
      category,
      rule_text AS ruleText,
      severity,
      detection_pattern AS detectionPattern,
      example_before AS exampleBefore,
      example_after AS exampleAfter,
      notes,
      source,
      reviewed_at AS reviewedAt
    FROM writing_rules
    WHERE NULLIF(TRIM(detection_pattern), '') IS NOT NULL
      AND NOT (source = 'synthesis-candidate' AND reviewed_at IS NULL)
    ORDER BY id;
  `;
  const result = spawnSync("sqlite3", ["-json", database.url.href, sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `sqlite3 exited with ${result.status}`);
  }
  const rows = result.stdout.trim() ? (JSON.parse(result.stdout) as RuleRow[]) : [];

  return {
    rules: rows,
    database: receipt(database.absolutePath, database.before),
  };
}

export function loadCatalogDocuments(databasePath: string): CatalogLoad {
  const database = immutableDatabase(databasePath);
  const sql = `
    PRAGMA query_only=ON;
    SELECT
      d.id,
      d.file_path AS filePath,
      d.word_count AS wordCount,
      d.created_at AS createdAt,
      COUNT(c.id) AS correctionCount,
      COALESCE(MAX(NULLIF(c.writing_type, '')), 'general') AS writingType
    FROM documents d
    LEFT JOIN corrections c ON c.document_id = d.id
    GROUP BY d.id
    ORDER BY correctionCount DESC, d.created_at DESC, d.id;
  `;
  const result = spawnSync("sqlite3", ["-json", database.url.href, sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `sqlite3 exited with ${result.status}`);
  }
  const rows = result.stdout.trim() ? (JSON.parse(result.stdout) as CatalogRow[]) : [];
  return {
    documents: rows,
    database: receipt(database.absolutePath, database.before),
  };
}
