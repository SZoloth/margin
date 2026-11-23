import type Database from "better-sqlite3";
import { execFile } from "child_process";
import { createHash } from "crypto";
import { existsSync } from "fs";
import { homedir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { openReadDb } from "../db.js";

export const EMBEDDING_MODEL = "google/embeddinggemma-2";

export interface SimilarCorrectionRecord {
  originalText: string;
  notes: string[];
  highlightColor: string;
  documentTitle: string | null;
  documentId: string;
  createdAt: number;
  writingType: string | null;
  polarity: string | null;
  rationale: string | null;
  similarity: number;
}

export interface SimilarCorrectionsResult {
  results: SimilarCorrectionRecord[];
  backend: "sqlite-cache" | "embeddinggemma2" | "unavailable" | "empty";
  available: boolean;
  cached: boolean;
  reason?: string;
}

export interface SimilarCorrectionsParams {
  query: string;
  limit?: number;
  writing_type?: string;
}

export interface SimilarCorrectionsRunnerRequest {
  query: string;
  dbPath: string;
  cachePath: string;
  scriptPath: string;
  limit: number;
  writingType?: string;
}

export type SimilarCorrectionsRunner = (
  req: SimilarCorrectionsRunnerRequest,
) => Promise<SimilarCorrectionsResult>;

export interface SimilarCorrectionsOptions {
  cachePath?: string;
  scriptPath?: string;
  dbPath?: string;
  runner?: SimilarCorrectionsRunner;
  timeoutMs?: number;
}

interface RawCorrectionRow {
  originalText: string;
  notesJson: string;
  highlightColor: string;
  documentTitle: string | null;
  documentId: string;
  createdAt: number;
  writingType: string | null;
  polarity: string | null;
  rationale: string | null;
}

interface CandidateCorrection {
  originalText: string;
  notes: string[];
  highlightColor: string;
  documentTitle: string | null;
  documentId: string;
  createdAt: number;
  writingType: string | null;
  polarity: string | null;
  rationale: string | null;
  textHash: string;
}

export function hashText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number | null {
  if (a.length !== b.length || a.length === 0) return null;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (!Number.isFinite(denom)) return null;
  if (denom === 0) return 0;
  const sim = dot / denom;
  return Number.isFinite(sim) ? sim : null;
}

function defaultCachePath(): string {
  return join(homedir(), ".cache", "embeddinggemma2", "vectors.sqlite");
}

function defaultScriptPath(): string {
  const envOverride = process.env.MARGIN_SIMILAR_CORRECTIONS_SCRIPT;
  if (envOverride && existsSync(envOverride)) {
    return envOverride;
  }

  const candidates: string[] = [];
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    // Works from mcp/src/tools/ (tsx/vitest) and mcp/dist/tools/ (built)
    candidates.push(resolve(here, "..", "..", "scripts", "similar-corrections.py"));
  } catch {
    // ignore in bundled virtual URLs
  }
  const execDir = dirname(process.execPath);
  candidates.push(
    resolve(execDir, "scripts", "similar-corrections.py"),
    resolve(execDir, "..", "Resources", "scripts", "similar-corrections.py"),
  );

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0] ?? "scripts/similar-corrections.py";
}

function resolveDbPath(db: Database.Database, explicitPath?: string): string | null {
  if (explicitPath) return explicitPath;
  const record = db as unknown as { name?: unknown; filename?: unknown };
  const candidate =
    typeof record.name === "string" && record.name.length > 0
      ? record.name
      : typeof record.filename === "string" && record.filename.length > 0
        ? record.filename
        : null;
  if (!candidate || candidate === ":memory:") {
    return null;
  }
  return candidate;
}

function parseNotesJson(notesJson: string): string[] {
  try {
    const parsed: unknown = JSON.parse(notesJson);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim())
        .filter((v) => v.length > 0);
    }
  } catch {
    // ignore malformed JSON
  }
  return [];
}

function loadCandidateCorrections(
  db: Database.Database,
  writingType?: string,
): CandidateCorrection[] {
  const conditions = [
    "notes_json IS NOT NULL",
    "notes_json != '[]'",
    "session_id != '__backfilled__'",
    "UPPER(notes_json) NOT LIKE '%NOT FEEDBACK%'",
    "(category IS NULL OR category != 'non-feedback')",
    "(polarity IS NULL OR polarity != 'positive')",
  ];
  const params: string[] = [];
  if (writingType) {
    conditions.push("writing_type = ?");
    params.push(writingType);
  }

  const rows = db
    .prepare(
      `SELECT original_text as originalText, notes_json as notesJson,
              highlight_color as highlightColor, document_title as documentTitle,
              document_id as documentId, created_at as createdAt,
              writing_type as writingType, polarity, rationale
       FROM corrections
       WHERE ${conditions.join(" AND ")}
       ORDER BY created_at DESC`,
    )
    .all(...params) as RawCorrectionRow[];

  const seen = new Set<string>();
  const candidates: CandidateCorrection[] = [];
  for (const row of rows) {
    const orig = (row.originalText ?? "").trim();
    const notesRaw = (row.notesJson ?? "").trim();
    if (!orig) continue;
    const dedupKey = `${orig}\0${notesRaw}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    const notes = parseNotesJson(notesRaw);
    if (notes.length === 0) continue;
    candidates.push({
      originalText: orig,
      notes,
      highlightColor: row.highlightColor,
      documentTitle: row.documentTitle,
      documentId: row.documentId,
      createdAt: row.createdAt,
      writingType: row.writingType,
      polarity: row.polarity,
      rationale: row.rationale ?? null,
      textHash: hashText(orig),
    });
  }
  return candidates;
}

export function decodeVectorBlob(blob: unknown, dim: number): Float32Array | null {
  if (!(blob instanceof Uint8Array) || !Number.isInteger(dim) || dim <= 0) {
    return null;
  }
  if (blob.byteLength !== dim * 4) {
    return null;
  }
  const view = new DataView(blob.buffer, blob.byteOffset, blob.byteLength);
  const vec = new Float32Array(dim);
  for (let i = 0; i < dim; i++) {
    const v = view.getFloat32(i * 4, true);
    if (!Number.isFinite(v)) {
      return null;
    }
    vec[i] = v;
  }
  return vec;
}

function loadCachedVectors(
  cachePath: string,
  hashes: string[],
): Map<string, Float32Array> {
  const result = new Map<string, Float32Array>();
  if (!existsSync(cachePath) || hashes.length === 0) {
    return result;
  }
  const uniqueHashes = Array.from(new Set(hashes));
  let cacheDb: Database.Database | undefined;
  try {
    cacheDb = openReadDb(cachePath);
    for (let start = 0; start < uniqueHashes.length; start += 500) {
      const chunk = uniqueHashes.slice(start, start + 500);
      const placeholders = chunk.map(() => "?").join(",");
      const rows = cacheDb
        .prepare(
          `SELECT text_hash as textHash, dim, vec
           FROM vectors
           WHERE model = ? AND text_hash IN (${placeholders})`,
        )
        .all(EMBEDDING_MODEL, ...chunk) as Array<{
        textHash: string;
        dim: number;
        vec: unknown;
      }>;
      for (const row of rows) {
        const vec = decodeVectorBlob(row.vec, row.dim);
        if (vec) {
          result.set(row.textHash, vec);
        }
      }
    }
  } catch {
    return new Map();
  } finally {
    cacheDb?.close();
  }
  return result;
}

export function createSubprocessRunner(
  command: string,
  buildArgs: (req: SimilarCorrectionsRunnerRequest) => string[],
  timeoutMs: number = 60_000,
): SimilarCorrectionsRunner {
  return (req) =>
    new Promise((resolvePromise, rejectPromise) => {
      if (!existsSync(req.scriptPath)) {
        rejectPromise(new Error(`Helper script not found: ${req.scriptPath}`));
        return;
      }
      const child = execFile(
        command,
        buildArgs(req),
        {
          env: { ...process.env, HF_HUB_OFFLINE: "1" },
          timeout: timeoutMs,
          maxBuffer: 4 * 1024 * 1024,
        },
        (err, stdout, stderr) => {
          if (err) {
            rejectPromise(new Error(stderr?.trim() || err.message));
            return;
          }
          try {
            const parsed = JSON.parse(stdout) as SimilarCorrectionsResult;
            if (!parsed || !Array.isArray(parsed.results)) {
              rejectPromise(new Error("Invalid JSON output from similar-corrections.py"));
              return;
            }
            resolvePromise(parsed);
          } catch (parseErr) {
            rejectPromise(
              new Error(
                `Failed to parse similar-corrections.py output: ${
                  parseErr instanceof Error ? parseErr.message : String(parseErr)
                }`,
              ),
            );
          }
        },
      );
      // Prevent uncaught EPIPE if the child exits before reading all of stdin.
      child.stdin?.on("error", () => {});
      child.stdin?.end(req.query, "utf8");
    });
}

function createDefaultRunner(timeoutMs: number): SimilarCorrectionsRunner {
  return createSubprocessRunner(
    "uv",
    (req) => {
      const args = [
        "run",
        "--offline",
        "--no-project",
        "--no-config",
        "--quiet",
        "--python",
        "3.12",
        "--with",
        "sentence-transformers[image]>=6.1",
        "python",
        req.scriptPath,
        "--query-stdin",
        "--db",
        req.dbPath,
        "--cache",
        req.cachePath,
        "--limit",
        String(req.limit),
      ];
      if (req.writingType) {
        args.push("--writing-type", req.writingType);
      }
      return args;
    },
    timeoutMs,
  );
}

export async function getSimilarCorrections(
  db: Database.Database,
  params: SimilarCorrectionsParams,
  opts: SimilarCorrectionsOptions = {},
): Promise<SimilarCorrectionsResult> {
  const query = (params.query ?? "").trim();
  const limit = Math.min(Math.max(Math.trunc(params.limit ?? 6), 1), 50);

  if (!query) {
    return { results: [], backend: "empty", available: true, cached: true };
  }

  const candidates = loadCandidateCorrections(db, params.writing_type);
  if (candidates.length === 0) {
    return { results: [], backend: "empty", available: true, cached: true };
  }

  const cachePath = opts.cachePath ?? defaultCachePath();
  const queryHash = hashText(query);
  const allHashes = [queryHash, ...candidates.map((c) => c.textHash)];
  const cachedVectors = loadCachedVectors(cachePath, allHashes);

  const queryVec = cachedVectors.get(queryHash);
  const allCandidatesCached =
    queryVec !== undefined &&
    candidates.every((c) => {
      const vec = cachedVectors.get(c.textHash);
      return vec !== undefined && vec.length === queryVec.length;
    });

  if (allCandidatesCached && queryVec) {
    const scored: Array<{ candidate: CandidateCorrection; similarity: number }> = [];
    for (const candidate of candidates) {
      const sim = cosineSimilarity(queryVec, cachedVectors.get(candidate.textHash)!);
      if (sim !== null) {
        scored.push({ candidate, similarity: sim });
      }
    }
    scored.sort((a, b) => {
      if (b.similarity !== a.similarity) return b.similarity - a.similarity;
      return b.candidate.createdAt - a.candidate.createdAt;
    });
    return {
      results: scored.slice(0, limit).map(({ candidate, similarity }) => ({
        originalText: candidate.originalText,
        notes: candidate.notes,
        highlightColor: candidate.highlightColor,
        documentTitle: candidate.documentTitle,
        documentId: candidate.documentId,
        createdAt: candidate.createdAt,
        writingType: candidate.writingType,
        polarity: candidate.polarity,
        rationale: candidate.rationale,
        similarity: Math.round(similarity * 1_000_000) / 1_000_000,
      })),
      backend: "sqlite-cache",
      available: true,
      cached: true,
    };
  }

  const dbPath = resolveDbPath(db, opts.dbPath);
  const runner = opts.runner ?? createDefaultRunner(opts.timeoutMs ?? 60_000);
  if (!opts.runner && !dbPath) {
    return {
      results: [],
      backend: "unavailable",
      available: false,
      cached: false,
      reason: "In-memory database cannot be queried by external embedding helper when vectors are uncached",
    };
  }

  try {
    return await runner({
      query,
      dbPath: dbPath ?? ":memory:",
      cachePath,
      scriptPath: opts.scriptPath ?? defaultScriptPath(),
      limit,
      writingType: params.writing_type,
    });
  } catch (err) {
    return {
      results: [],
      backend: "unavailable",
      available: false,
      cached: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
