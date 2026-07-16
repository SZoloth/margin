import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

interface CountRow {
  corrections: number;
  writingRules: number;
  suggestedEditPopulated: number;
  rationalePopulated: number;
  acceptedAtPopulated: number;
  feedbackTypePopulated: number;
}

interface IdRow {
  id: string;
}

function fileHash(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sqliteJson<T>(databaseUri: string, sql: string): T[] {
  const result = spawnSync("sqlite3", ["-json", databaseUri, sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `sqlite3 exited with ${result.status}`);
  }
  const output = result.stdout.trim();
  return output.length === 0 ? [] : (JSON.parse(output) as T[]);
}

function idHash(rows: IdRow[]): string {
  const hash = createHash("sha256");
  for (const row of rows) hash.update(row.id).update("\0");
  return hash.digest("hex");
}

export function auditMarginDatabase(databasePath: string) {
  const absolutePath = resolve(databasePath);
  const walPath = `${absolutePath}-wal`;
  if (existsSync(walPath) && statSync(walPath).size > 0) {
    throw new Error("non-empty WAL prevents an immutable audit");
  }
  const before = fileHash(absolutePath);
  const databaseUrl = new URL(pathToFileURL(absolutePath));
  databaseUrl.searchParams.set("mode", "ro");
  databaseUrl.searchParams.set("immutable", "1");
  const databaseUri = databaseUrl.href;

  const countRows = sqliteJson<CountRow>(
    databaseUri,
    `
      PRAGMA query_only=ON;
      SELECT
        (SELECT count(*) FROM corrections) AS corrections,
        (SELECT count(*) FROM writing_rules) AS writingRules,
        (SELECT count(*) FROM corrections WHERE suggested_edit IS NOT NULL AND trim(suggested_edit) <> '') AS suggestedEditPopulated,
        (SELECT count(*) FROM corrections WHERE rationale IS NOT NULL AND trim(rationale) <> '') AS rationalePopulated,
        (SELECT count(*) FROM corrections WHERE accepted_at IS NOT NULL) AS acceptedAtPopulated,
        (SELECT count(*) FROM corrections WHERE feedback_type IS NOT NULL AND trim(feedback_type) <> '') AS feedbackTypePopulated;
    `,
  );
  const counts = countRows[0];
  if (!counts) throw new Error("database audit returned no counts");

  const correctionIds = sqliteJson<IdRow>(
    databaseUri,
    "PRAGMA query_only=ON; SELECT id FROM corrections ORDER BY id;",
  );
  const writingRuleIds = sqliteJson<IdRow>(
    databaseUri,
    "PRAGMA query_only=ON; SELECT id FROM writing_rules ORDER BY id;",
  );
  const after = fileHash(absolutePath);
  if (before !== after) throw new Error("database changed during read-only audit");

  return {
    schemaVersion: 1,
    database: {
      sha256Before: before,
      sha256After: after,
      unchanged: before === after,
      accessMode: "mode=ro&immutable=1",
    },
    counts,
    manifest: {
      correctionIdsHash: idHash(correctionIds),
      writingRuleIdsHash: idHash(writingRuleIds),
    },
  };
}
