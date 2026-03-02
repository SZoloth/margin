import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb } from "../db.js";
import {
  listDocuments,
  getDocument,
  readDocument,
} from "../tools/documents.js";
import { writeFileSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

let db: Database.Database;

function insertDoc(
  id: string,
  source: string = "file",
  opts: {
    filePath?: string | null;
    keepLocalId?: string | null;
    title?: string;
    lastOpenedAt?: number;
  } = {},
) {
  db.prepare(
    `INSERT INTO documents (id, source, file_path, keep_local_id, title, word_count, last_opened_at, created_at)
     VALUES (?, ?, ?, ?, ?, 100, ?, 1000)`,
  ).run(
    id,
    source,
    opts.filePath ?? null,
    opts.keepLocalId ?? null,
    opts.title ?? "Test Doc",
    opts.lastOpenedAt ?? 1000,
  );
}

beforeEach(() => {
  db = createTestDb();
});

afterEach(() => {
  db.close();
});

describe("listDocuments", () => {
  it("returns documents ordered by last_opened_at DESC", () => {
    insertDoc("d1", "file", { lastOpenedAt: 1000 });
    insertDoc("d2", "file", { lastOpenedAt: 3000 });
    insertDoc("d3", "file", { lastOpenedAt: 2000 });

    const docs = listDocuments(db);
    expect(docs).toHaveLength(3);
    expect(docs[0].id).toBe("d2");
    expect(docs[1].id).toBe("d3");
    expect(docs[2].id).toBe("d1");
  });

  it("respects limit", () => {
    for (let i = 0; i < 5; i++) {
      insertDoc(`d${i}`, "file", { lastOpenedAt: i });
    }
    expect(listDocuments(db, 2)).toHaveLength(2);
  });

  it("clamps limit to 100", () => {
    for (let i = 0; i < 5; i++) {
      insertDoc(`d${i}`, "file", { lastOpenedAt: i });
    }
    // 200 should be clamped to 100, but we only have 5
    expect(listDocuments(db, 200)).toHaveLength(5);
  });

  it("returns empty array for empty table", () => {
    expect(listDocuments(db)).toHaveLength(0);
  });
});

describe("getDocument", () => {
  it("returns full document record by ID", () => {
    insertDoc("d1", "file", { title: "My Article", filePath: "/test.md" });
    const doc = getDocument(db, "d1");
    expect(doc).not.toBeNull();
    expect(doc!.id).toBe("d1");
    expect(doc!.title).toBe("My Article");
    expect(doc!.file_path).toBe("/test.md");
  });

  it("returns null for unknown ID", () => {
    expect(getDocument(db, "nonexistent")).toBeNull();
  });
});

describe("readDocument", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "margin-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reads file content from disk", () => {
    const filePath = join(tmpDir, "test.md");
    writeFileSync(filePath, "# Hello World\n\nSome content.");
    insertDoc("d1", "file", { filePath });

    const result = readDocument(db, "d1");
    expect(result).toHaveProperty("content");
    if ("content" in result) {
      expect(result.content).toContain("Hello World");
    }
  });

  it("errors for keep-local doc without file path", () => {
    insertDoc("d1", "keep-local", { keepLocalId: "kl-123" });
    const result = readDocument(db, "d1");
    expect(result).toHaveProperty("error");
    if ("error" in result) {
      expect(result.error).toContain("keep-local");
    }
  });

  it("errors for missing file", () => {
    insertDoc("d1", "file", { filePath: "/nonexistent/path.md" });
    const result = readDocument(db, "d1");
    expect(result).toHaveProperty("error");
  });

  it("errors for unknown document ID", () => {
    const result = readDocument(db, "nonexistent");
    expect(result).toHaveProperty("error");
    if ("error" in result) {
      expect(result.error).toContain("not found");
    }
  });
});
