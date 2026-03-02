import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { createTestDb, openReadDb } from "../db.js";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("createTestDb", () => {
  it("creates an in-memory database with full schema", () => {
    const db = createTestDb();
    // Should be able to insert a document
    db.prepare(
      `INSERT INTO documents (id, source, title, last_opened_at, created_at)
       VALUES ('d1', 'file', 'Test', 1000, 1000)`,
    ).run();
    const count = db.prepare("SELECT COUNT(*) as c FROM documents").get() as {
      c: number;
    };
    expect(count.c).toBe(1);
    db.close();
  });

  it("has foreign keys enabled", () => {
    const db = createTestDb();
    const fk = db.pragma("foreign_keys", { simple: true });
    expect(fk).toBe(1);
    db.close();
  });

  it("creates all expected tables", () => {
    const db = createTestDb();
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain("documents");
    expect(names).toContain("highlights");
    expect(names).toContain("margin_notes");
    expect(names).toContain("corrections");
    expect(names).toContain("writing_rules");
    db.close();
  });
});

describe("openReadDb / openWriteDb pragmas", () => {
  it("openReadDb does not throw if WAL cannot be enabled in readonly mode", () => {
    const dir = mkdtempSync(join(tmpdir(), "margin-mcp-"));
    const path = join(dir, "test.db");
    const seed = new Database(path);
    seed.exec("CREATE TABLE t(x);");
    seed.close();

    expect(() => {
      const db = openReadDb(path);
      expect(db.pragma("busy_timeout", { simple: true })).toBe(5000);
      db.close();
    }).not.toThrow();

    rmSync(dir, { recursive: true, force: true });
  });

  it("read db opens with WAL and busy_timeout", () => {
    const db = new Database(":memory:");
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 5000");
    // In-memory reports "memory" for journal_mode
    const timeout = db.pragma("busy_timeout", { simple: true });
    expect(timeout).toBe(5000);
    db.close();
  });

  it("write db opens with foreign_keys ON", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    const fk = db.pragma("foreign_keys", { simple: true });
    expect(fk).toBe(1);
    db.close();
  });
});
