import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { execFileSync } from "child_process";
import { createHash } from "crypto";
import { mkdtempSync, rmSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { createTestDb } from "../db.js";
import {
  getSimilarCorrections,
  hashText,
  cosineSimilarity,
  decodeVectorBlob,
  createSubprocessRunner,
  EMBEDDING_MODEL,
  type SimilarCorrectionsRunner,
} from "../tools/similar-corrections.js";

let db: Database.Database;
let tempDir: string;
let cachePath: string;

function insertCorrection(
  highlightId: string,
  text: string,
  notes: string,
  opts: {
    docId?: string;
    docTitle?: string;
    writingType?: string | null;
    polarity?: string | null;
    category?: string | null;
    sessionId?: string;
    createdAt?: number;
  } = {},
) {
  db.prepare(
    `INSERT INTO corrections
       (id, highlight_id, document_id, session_id, original_text, notes_json,
        document_title, document_source, highlight_color, created_at, updated_at,
        writing_type, polarity, category)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'file', 'yellow', ?, ?, ?, ?, ?)`,
  ).run(
    `id-${highlightId}`,
    highlightId,
    opts.docId ?? "doc1",
    opts.sessionId ?? "sess1",
    text,
    notes,
    opts.docTitle ?? "Test Doc",
    opts.createdAt ?? 1000,
    opts.createdAt ?? 1000,
    opts.writingType ?? null,
    opts.polarity ?? "corrective",
    opts.category ?? null,
  );
}

function seedVectorCache(path: string, entries: Array<{ text: string; vec: number[] }>) {
  const cacheDb = new Database(path);
  cacheDb.exec(`
    CREATE TABLE IF NOT EXISTS vectors (
      model TEXT,
      text_hash TEXT,
      dim INTEGER,
      vec BLOB,
      updated_at REAL,
      PRIMARY KEY (model, text_hash)
    )
  `);
  const stmt = cacheDb.prepare(
    "INSERT OR REPLACE INTO vectors (model, text_hash, dim, vec, updated_at) VALUES (?, ?, ?, ?, ?)",
  );
  for (const { text, vec } of entries) {
    const f32 = new Float32Array(vec);
    const buf = Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength);
    stmt.run(EMBEDDING_MODEL, hashText(text), vec.length, buf, Date.now() / 1000);
  }
  cacheDb.close();
}

beforeEach(() => {
  db = createTestDb();
  tempDir = mkdtempSync(join(tmpdir(), "margin-similar-test-"));
  cachePath = join(tempDir, "vectors.sqlite");
});

afterEach(() => {
  db.close();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("similar-corrections helpers", () => {
  it("hashes text with sha256 matching shared cache convention", () => {
    const expected = createHash("sha256").update("hello world", "utf8").digest("hex");
    expect(hashText("hello world")).toBe(expected);
  });

  it("computes cosine similarity safely including zero vectors and invalid inputs", () => {
    expect(cosineSimilarity(new Float32Array([1, 0]), new Float32Array([1, 0]))).toBeCloseTo(1, 5);
    expect(cosineSimilarity(new Float32Array([1, 0]), new Float32Array([0, 1]))).toBeCloseTo(0, 5);
    expect(cosineSimilarity(new Float32Array([2, 0]), new Float32Array([3, 0]))).toBeCloseTo(1, 5);
    expect(cosineSimilarity(new Float32Array([0, 0]), new Float32Array([1, 0]))).toBe(0);
    expect(cosineSimilarity(new Float32Array([1, 0]), new Float32Array([1, 0, 0]))).toBeNull();
    expect(cosineSimilarity(new Float32Array([Number.NaN, 0]), new Float32Array([1, 0]))).toBeNull();
  });

  it("decodes little-endian float32 from plain Uint8Array and rejects NaN or length mismatch", () => {
    const raw = new Uint8Array(8);
    const dv = new DataView(raw.buffer);
    dv.setFloat32(0, 1.5, true);
    dv.setFloat32(4, -2.25, true);
    const decoded = decodeVectorBlob(raw, 2);
    expect(decoded).not.toBeNull();
    expect(decoded![0]).toBeCloseTo(1.5, 5);
    expect(decoded![1]).toBeCloseTo(-2.25, 5);

    // Reject NaN
    dv.setFloat32(0, Number.NaN, true);
    expect(decodeVectorBlob(raw, 2)).toBeNull();

    // Reject wrong byte length
    expect(decodeVectorBlob(raw, 3)).toBeNull();
  });
});

describe("getSimilarCorrections", () => {
  it("returns empty result for blank query without invoking runner", async () => {
    let called = false;
    const runner: SimilarCorrectionsRunner = async () => {
      called = true;
      return { results: [], backend: "embeddinggemma2", available: true, cached: false };
    };

    const res = await getSimilarCorrections(db, { query: "   " }, { cachePath, runner });
    expect(res.results).toEqual([]);
    expect(res.backend).toBe("empty");
    expect(res.available).toBe(true);
    expect(called).toBe(false);
  });

  it("ranks cached corrections by cosine similarity directly from SQLite cache", async () => {
    insertCorrection("h1", "It's not just about speed, it's about craft.", '["negative parallelism"]', {
      writingType: "blog",
      createdAt: 1000,
    });
    insertCorrection("h2", "I am thrilled to apply for the PM role.", '["generic cover letter opener"]', {
      writingType: "cover-letter",
      createdAt: 2000,
    });
    insertCorrection("h3", "This isn't a feature; it's a paradigm shift.", '["another negative parallelism"]', {
      writingType: "blog",
      createdAt: 3000,
    });

    const query = "It's not just a tool, it's a workflow.";
    seedVectorCache(cachePath, [
      { text: query, vec: [1, 0, 0] },
      { text: "It's not just about speed, it's about craft.", vec: [0.95, 0.31, 0] },
      { text: "This isn't a feature; it's a paradigm shift.", vec: [0.85, 0.52, 0] },
      { text: "I am thrilled to apply for the PM role.", vec: [0.1, 0.99, 0] },
    ]);

    let runnerCalled = false;
    const runner: SimilarCorrectionsRunner = async () => {
      runnerCalled = true;
      return { results: [], backend: "embeddinggemma2", available: true, cached: false };
    };

    const res = await getSimilarCorrections(db, { query, limit: 2 }, { cachePath, runner });
    expect(runnerCalled).toBe(false);
    expect(res.backend).toBe("sqlite-cache");
    expect(res.cached).toBe(true);
    expect(res.available).toBe(true);
    expect(res.results).toHaveLength(2);
    expect(res.results[0].originalText).toBe("It's not just about speed, it's about craft.");
    expect(res.results[1].originalText).toBe("This isn't a feature; it's a paradigm shift.");
    expect(res.results[0].similarity).toBeGreaterThan(res.results[1].similarity);
  });

  it("excludes backfilled, non-feedback, positive, NOT FEEDBACK, and empty-note rows, and deduplicates", async () => {
    insertCorrection("h-good", "Keep this one", '["real note"]', { createdAt: 2000 });
    insertCorrection("h-dup", "Keep this one", '["real note"]', { createdAt: 1000 });
    insertCorrection("h-bf", "Backfilled text", '["old"]', { sessionId: "__backfilled__" });
    insertCorrection("h-nf", "Non feedback text", '["triage"]', { category: "non-feedback" });
    insertCorrection("h-pos", "Positive text", '["great line"]', { polarity: "positive" });
    insertCorrection("h-notfb", "Not feedback note", '["NOT FEEDBACK - ignore"]');
    insertCorrection("h-empty", "Empty notes", "[]");

    const query = "test query";
    seedVectorCache(cachePath, [
      { text: query, vec: [1, 0] },
      { text: "Keep this one", vec: [0.9, 0.1] },
    ]);

    const res = await getSimilarCorrections(db, { query, limit: 10 }, { cachePath });
    expect(res.backend).toBe("sqlite-cache");
    expect(res.results).toHaveLength(1);
    expect(res.results[0].originalText).toBe("Keep this one");
    expect(res.results[0].createdAt).toBe(2000);
  });

  it("filters by writing_type when specified", async () => {
    insertCorrection("h1", "Blog passage", '["blog note"]', { writingType: "blog" });
    insertCorrection("h2", "Cover letter passage", '["cl note"]', { writingType: "cover-letter" });

    const query = "draft text";
    seedVectorCache(cachePath, [
      { text: query, vec: [1, 0] },
      { text: "Blog passage", vec: [0.5, 0.5] },
      { text: "Cover letter passage", vec: [0.99, 0.01] },
    ]);

    const res = await getSimilarCorrections(
      db,
      { query, writing_type: "blog", limit: 6 },
      { cachePath },
    );
    expect(res.results).toHaveLength(1);
    expect(res.results[0].writingType).toBe("blog");
  });

  it("falls back to runner on cache miss and returns runner results", async () => {
    insertCorrection("h1", "Uncached text", '["note"]', { writingType: "blog" });

    let receivedQuery = "";
    const runner: SimilarCorrectionsRunner = async (req) => {
      receivedQuery = req.query;
      return {
        results: [
          {
            originalText: "Uncached text",
            notes: ["note"],
            writingType: "blog",
            documentTitle: "Test Doc",
            documentId: "doc1",
            createdAt: 1000,
            highlightColor: "yellow",
            polarity: "corrective",
            rationale: null,
            similarity: 0.88,
          },
        ],
        backend: "embeddinggemma2",
        available: true,
        cached: false,
      };
    };

    const res = await getSimilarCorrections(db, { query: "fresh query", limit: 6 }, { cachePath, runner });
    expect(receivedQuery).toBe("fresh query");
    expect(res.backend).toBe("embeddinggemma2");
    expect(res.results).toHaveLength(1);
    expect(res.results[0].similarity).toBeCloseTo(0.88, 4);
  });

  it("gracefully returns empty unavailable result when uv/model runner fails", async () => {
    insertCorrection("h1", "Uncached text", '["note"]', { writingType: "blog" });

    const failingRunner: SimilarCorrectionsRunner = async () => {
      throw new Error("spawn uv ENOENT");
    };

    const res = await getSimilarCorrections(
      db,
      { query: "fresh query", limit: 6 },
      { cachePath, runner: failingRunner },
    );
    expect(res.results).toEqual([]);
    expect(res.available).toBe(false);
    expect(res.backend).toBe("unavailable");
    expect(res.reason).toContain("uv");
  });

  it("treats dimension mismatch in vector cache as a cache miss", async () => {
    insertCorrection("h1", "Mismatched dim text", '["note"]', { writingType: "blog" });
    seedVectorCache(cachePath, [
      { text: "query text", vec: [1, 0, 0] },
      { text: "Mismatched dim text", vec: [1, 0] },
    ]);

    let runnerCalled = false;
    const runner: SimilarCorrectionsRunner = async () => {
      runnerCalled = true;
      return { results: [], backend: "unavailable", available: false, cached: false, reason: "miss" };
    };

    const res = await getSimilarCorrections(db, { query: "query text", limit: 6 }, { cachePath, runner });
    expect(runnerCalled).toBe(true);
    expect(res.backend).toBe("unavailable");
  });

  it("does not crash with EPIPE when subprocess exits before reading large stdin", async () => {
    insertCorrection("h1", "Uncached text", '["note"]', { writingType: "blog" });
    const earlyExitRunner = createSubprocessRunner("python3", () => ["-c", "import sys; sys.exit(1)"]);
    const largeQuery = "x".repeat(256 * 1024);

    const res = await getSimilarCorrections(
      db,
      { query: largeQuery, limit: 6 },
      { cachePath, runner: earlyExitRunner },
    );
    expect(res.available).toBe(false);
    expect(res.backend).toBe("unavailable");
    expect(res.results).toEqual([]);
  });
});

describe("similar-corrections.py CLI", () => {
  const scriptPath = resolve(
    fileURLToPath(new URL("../../scripts/similar-corrections.py", import.meta.url)),
  );

  it("reads cached vectors from SQLite and returns ranked JSON with --no-encode", () => {
    const fileDbPath = join(tempDir, "margin?v=1#hash.db");
    const fileDb = new Database(fileDbPath);
    fileDb.exec(`
      CREATE TABLE corrections (
        id TEXT PRIMARY KEY,
        highlight_id TEXT NOT NULL,
        document_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        original_text TEXT NOT NULL,
        notes_json TEXT NOT NULL,
        document_title TEXT,
        document_source TEXT NOT NULL,
        highlight_color TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        writing_type TEXT,
        polarity TEXT,
        category TEXT,
        rationale TEXT
      );
    `);
    fileDb
      .prepare(
        `INSERT INTO corrections
           (id, highlight_id, document_id, session_id, original_text, notes_json,
            document_title, document_source, highlight_color, created_at, updated_at, writing_type, polarity)
         VALUES (?, ?, ?, 'sess1', ?, ?, 'Doc', 'file', 'yellow', ?, ?, ?, 'corrective')`,
      )
      .run("c1", "h1", "d1", "Close match text", '["tighten this"]', 1000, 1000, "blog");
    fileDb
      .prepare(
        `INSERT INTO corrections
           (id, highlight_id, document_id, session_id, original_text, notes_json,
            document_title, document_source, highlight_color, created_at, updated_at, writing_type, polarity)
         VALUES (?, ?, ?, 'sess1', ?, ?, 'Doc', 'file', 'yellow', ?, ?, ?, 'corrective')`,
      )
      .run("c2", "h2", "d1", "Far match text", '["unrelated"]', 2000, 2000, "blog");
    fileDb.close();

    seedVectorCache(cachePath, [
      { text: "query text", vec: [1, 0] },
      { text: "Close match text", vec: [0.98, 0.2] },
      { text: "Far match text", vec: [0.0, 1.0] },
    ]);

    const stdout = execFileSync(
      "python3",
      [scriptPath, "--query-stdin", "--db", fileDbPath, "--cache", cachePath, "--limit", "2", "--no-encode"],
      { input: "query text", encoding: "utf8" },
    );
    const parsed = JSON.parse(stdout);
    expect(parsed.backend).toBe("sqlite-cache");
    expect(parsed.cached).toBe(true);
    expect(parsed.available).toBe(true);
    expect(parsed.results).toHaveLength(2);
    expect(parsed.results[0].originalText).toBe("Close match text");
    expect(parsed.results[0].similarity).toBeGreaterThan(parsed.results[1].similarity);

    // Uncached query with --no-encode gracefully returns unavailable
    const missStdout = execFileSync(
      "python3",
      [scriptPath, "--query-stdin", "--db", fileDbPath, "--cache", cachePath, "--limit", "2", "--no-encode"],
      { input: "brand new uncached query", encoding: "utf8" },
    );
    const missParsed = JSON.parse(missStdout);
    expect(missParsed.available).toBe(false);
    expect(missParsed.backend).toBe("unavailable");
    expect(missParsed.results).toEqual([]);
  });
});
