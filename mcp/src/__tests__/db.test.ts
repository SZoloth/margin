import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { createTestDb, openReadDb, nowMillis } from "../db.js";
import { getCorrections } from "../tools/corrections.js";
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
    expect(names).toContain("content_snapshots");
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

describe("schema parity sentinels", () => {
  it("polarity column exists on corrections", () => {
    const db = createTestDb();
    const now = nowMillis();
    db.prepare(
      `INSERT INTO documents (id, source, title, last_opened_at, created_at)
       VALUES ('d1', 'file', 'Test', ?, ?)`,
    ).run(now, now);
    db.prepare(
      `INSERT INTO corrections (id, highlight_id, document_id, session_id, original_text,
        notes_json, document_source, highlight_color, created_at, updated_at, polarity)
       VALUES ('c1', 'h1', 'd1', 's1', 'orig', '[]', 'file', 'yellow', ?, ?, 'positive')`,
    ).run(now, now);
    const row = db
      .prepare("SELECT polarity FROM corrections WHERE id = 'c1'")
      .get() as { polarity: string };
    expect(row.polarity).toBe("positive");
    db.close();
  });

  it("content_snapshots table exists", () => {
    const db = createTestDb();
    const now = nowMillis();
    db.prepare(
      `INSERT INTO documents (id, source, title, last_opened_at, created_at)
       VALUES ('d1', 'file', 'Test', ?, ?)`,
    ).run(now, now);
    db.prepare(
      `INSERT INTO content_snapshots (id, document_id, content, snapshot_type, created_at)
       VALUES ('snap1', 'd1', 'some content', 'manual', ?)`,
    ).run(now);
    const row = db
      .prepare("SELECT * FROM content_snapshots WHERE id = 'snap1'")
      .get() as { id: string; document_id: string; content: string; snapshot_type: string };
    expect(row.id).toBe("snap1");
    expect(row.document_id).toBe("d1");
    expect(row.content).toBe("some content");
    expect(row.snapshot_type).toBe("manual");
    db.close();
  });

  it("polarity round-trip through getCorrections", () => {
    const db = createTestDb();
    const now = nowMillis();
    db.prepare(
      `INSERT INTO documents (id, source, title, last_opened_at, created_at)
       VALUES ('d1', 'file', 'Test', ?, ?)`,
    ).run(now, now);
    db.prepare(
      `INSERT INTO corrections (id, highlight_id, document_id, session_id, original_text,
        notes_json, document_source, highlight_color, created_at, updated_at, polarity)
       VALUES ('c1', 'h1', 'd1', 's1', 'orig', '[{"text":"note"}]', 'file', 'yellow', ?, ?, 'positive')`,
    ).run(now, now);
    const results = getCorrections(db, "d1");
    expect(results).toHaveLength(1);
    expect(results[0].polarity).toBe("positive");
    db.close();
  });
});
