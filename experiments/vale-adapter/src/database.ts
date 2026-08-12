import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
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

export function loadExecutableRules(databasePath: string): LiveRuleLoad {
  const absolutePath = resolve(databasePath);
  const walPath = `${absolutePath}-wal`;
  if (existsSync(walPath) && statSync(walPath).size > 0) {
    throw new Error("non-empty WAL prevents an immutable rule read");
  }

  const before = hashFile(absolutePath);
  const databaseUrl = new URL(pathToFileURL(absolutePath));
  databaseUrl.searchParams.set("mode", "ro");
  databaseUrl.searchParams.set("immutable", "1");
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
  const result = spawnSync("sqlite3", ["-json", databaseUrl.href, sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `sqlite3 exited with ${result.status}`);
  }
  const rows = result.stdout.trim() ? (JSON.parse(result.stdout) as RuleRow[]) : [];
  const after = hashFile(absolutePath);
  if (before !== after) throw new Error("database changed during immutable rule read");

  return {
    rules: rows,
    database: {
      accessMode: "mode=ro&immutable=1",
      sha256Before: before,
      sha256After: after,
      unchanged: before === after,
    },
  };
}
