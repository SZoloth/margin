import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb } from "../db.js";
import { sanitizeFtsQuery, searchDocuments } from "../tools/documents.js";

let db: Database.Database;

function createFtsTable(database: Database.Database) {
  database.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
      title, content, document_id UNINDEXED,
      prefix='2,3',
      tokenize='unicode61 remove_diacritics 2'
    );
  `);
}

function indexDoc(database: Database.Database, id: string, title: string, content: string) {
  database
    .prepare(
      "INSERT INTO documents_fts (document_id, title, content) VALUES (?, ?, ?)",
    )
    .run(id, title, content);
}

beforeEach(() => {
  db = createTestDb();
});

afterEach(() => {
  db.close();
});

describe("sanitizeFtsQuery", () => {
  it("appends * for prefix matching", () => {
    expect(sanitizeFtsQuery("hello")).toBe('"hello"*');
  });

  it("handles multiple words", () => {
    expect(sanitizeFtsQuery("hello world")).toBe('"hello"* "world"*');
  });

  it("strips FTS5 boolean operators", () => {
    expect(sanitizeFtsQuery("hello OR")).toBe('"hello"*');
    expect(sanitizeFtsQuery("NOT test AND")).toBe('"test"*');
    expect(sanitizeFtsQuery("NEAR something")).toBe('"something"*');
  });

  it("returns empty for empty input", () => {
    expect(sanitizeFtsQuery("")).toBe("");
    expect(sanitizeFtsQuery("   ")).toBe("");
  });

  it("strips double quotes", () => {
    expect(sanitizeFtsQuery('say "hello"')).toBe('"say"* "hello"*');
  });

  it("strips special characters", () => {
    expect(sanitizeFtsQuery("c++")).toBe('"c"*');
    expect(sanitizeFtsQuery("hello:world")).toBe('"helloworld"*');
  });

  it("preserves unicode alphanumerics like Rust sanitize_fts_query", () => {
    expect(sanitizeFtsQuery("café")).toBe('"café"*');
    expect(sanitizeFtsQuery("你好")).toBe('"你好"*');
  });

  it("handles all-operator input", () => {
    expect(sanitizeFtsQuery("OR AND NOT")).toBe("");
    expect(sanitizeFtsQuery("+++")).toBe("");
  });
});

describe("searchDocuments", () => {
  it("returns results with snippets", () => {
    createFtsTable(db);
    // Need a doc row for the JOIN
    db.prepare(
      "INSERT INTO documents (id, source, title, last_opened_at, created_at) VALUES ('d1', 'file', 'Rust Guide', 1000, 1000)",
    ).run();
    indexDoc(db, "d1", "Rust Guide", "Learn systems programming with Rust");

    const results = searchDocuments(db, "Rust");
    expect(Array.isArray(results)).toBe(true);
    if (Array.isArray(results)) {
      expect(results).toHaveLength(1);
      expect(results[0].documentId).toBe("d1");
      expect(results[0].title).toBe("Rust Guide");
    }
  });

  it("returns empty array for empty query", () => {
    createFtsTable(db);
    const results = searchDocuments(db, "");
    expect(results).toEqual([]);
  });

  it("returns helpful error when FTS table does not exist", () => {
    // Don't create FTS table
    const results = searchDocuments(db, "test");
    expect(results).toHaveProperty("error");
    if ("error" in results) {
      expect(results.error).toContain("index not yet created");
    }
  });

  it("respects limit", () => {
    createFtsTable(db);
    for (let i = 0; i < 5; i++) {
      db.prepare(
        "INSERT INTO documents (id, source, title, last_opened_at, created_at) VALUES (?, 'file', ?, 1000, 1000)",
      ).run(`d${i}`, `Rust Doc ${i}`);
      indexDoc(db, `d${i}`, `Rust Doc ${i}`, "Rust content");
    }

    const results = searchDocuments(db, "Rust", 2);
    expect(Array.isArray(results)).toBe(true);
    if (Array.isArray(results)) {
      expect(results).toHaveLength(2);
    }
  });

  it("handles special characters without crashing", () => {
    createFtsTable(db);
    db.prepare(
      "INSERT INTO documents (id, source, title, last_opened_at, created_at) VALUES ('d1', 'file', 'Test', 1000, 1000)",
    ).run();
    indexDoc(db, "d1", "Test", "Some content");

    // These should not throw
    searchDocuments(db, "c++");
    searchDocuments(db, '""quoted""');
    searchDocuments(db, "OR AND NOT");
    searchDocuments(db, "+++");
  });
});
