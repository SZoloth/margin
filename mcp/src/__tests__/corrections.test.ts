import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type Database from "better-sqlite3";
import { writeFileSync, unlinkSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createTestDb } from "../db.js";
import {
  getCorrections,
  getCorrectionsSummary,
  createCorrection,
  deleteCorrection,
  updateCorrectionWritingType,
} from "../tools/corrections.js";

let db: Database.Database;

function insertCorrection(
  highlightId: string,
  text: string,
  notes: string,
  opts: {
    docId?: string;
    docTitle?: string;
    writingType?: string | null;
    createdAt?: number;
  } = {},
) {
  db.prepare(
    `INSERT INTO corrections
       (id, highlight_id, document_id, session_id, original_text, notes_json,
        document_title, document_source, highlight_color, created_at, updated_at, writing_type)
     VALUES (?, ?, ?, 'sess1', ?, ?, ?, 'file', 'yellow', ?, ?, ?)`,
  ).run(
    `id-${highlightId}`,
    highlightId,
    opts.docId ?? "doc1",
    text,
    notes,
    opts.docTitle ?? "Test Doc",
    opts.createdAt ?? 1000,
    opts.createdAt ?? 1000,
    opts.writingType ?? null,
  );
}

beforeEach(() => {
  db = createTestDb();
});

afterEach(() => {
  db.close();
});

describe("getCorrections", () => {
  it("returns corrections ordered by created_at DESC", () => {
    insertCorrection("h1", "old text", '["fix"]', { createdAt: 1000 });
    insertCorrection("h2", "new text", '["also fix"]', { createdAt: 2000 });

    const results = getCorrections(db);
    expect(results).toHaveLength(2);
    expect(results[0].originalText).toBe("new text");
    expect(results[1].originalText).toBe("old text");
  });

  it("respects limit", () => {
    for (let i = 0; i < 5; i++) {
      insertCorrection(`h${i}`, `text${i}`, '["note"]', { createdAt: i });
    }
    expect(getCorrections(db, undefined, 2)).toHaveLength(2);
  });

  it("clamps limit to 2000", () => {
    insertCorrection("h1", "text", '["note"]');
    // Should not error with limit > 2000
    expect(getCorrections(db, undefined, 5000)).toHaveLength(1);
  });

  it("filters by document_id", () => {
    insertCorrection("h1", "text1", '["note"]', { docId: "doc1" });
    insertCorrection("h2", "text2", '["note"]', { docId: "doc2" });

    const results = getCorrections(db, "doc1");
    expect(results).toHaveLength(1);
    expect(results[0].documentId).toBe("doc1");
  });

  it("deserializes notes from JSON", () => {
    insertCorrection("h1", "text", '["note1","note2"]');
    const results = getCorrections(db);
    expect(results[0].notes).toEqual(["note1", "note2"]);
  });

  it("returns empty array for empty table", () => {
    expect(getCorrections(db)).toHaveLength(0);
  });

  it("excludes backfilled rows", () => {
    insertCorrection("h1", "text", '["note"]');
    db.prepare(
      `INSERT INTO corrections
         (id, highlight_id, document_id, session_id, original_text, notes_json,
          document_source, highlight_color, created_at, updated_at)
       VALUES ('bf1', 'hbf', 'doc1', '__backfilled__', 'old', '["old"]', 'file', 'yellow', 500, 500)`,
    ).run();

    const results = getCorrections(db);
    expect(results).toHaveLength(1);
  });
});

describe("getCorrectionsSummary", () => {
  it("returns totals and breakdowns", () => {
    insertCorrection("h1", "text1", '["note"]', {
      docId: "doc1",
      writingType: "email",
    });
    insertCorrection("h2", "text2", '["note"]', {
      docId: "doc1",
      writingType: "email",
    });
    insertCorrection("h3", "text3", '["note"]', {
      docId: "doc2",
      writingType: "blog",
    });

    const summary = getCorrectionsSummary(db);
    expect(summary.total).toBe(3);
    expect(summary.byWritingType).toHaveLength(2);
    expect(summary.byDocument).toHaveLength(2);

    const emailType = summary.byWritingType.find(
      (t) => t.writingType === "email",
    );
    expect(emailType?.count).toBe(2);
  });

  it("returns zero counts for empty table", () => {
    const summary = getCorrectionsSummary(db);
    expect(summary.total).toBe(0);
    expect(summary.byWritingType).toHaveLength(0);
    expect(summary.byDocument).toHaveLength(0);
  });

  it("excludes backfilled rows", () => {
    insertCorrection("h1", "text", '["note"]');
    db.prepare(
      `INSERT INTO corrections
         (id, highlight_id, document_id, session_id, original_text, notes_json,
          document_source, highlight_color, created_at, updated_at)
       VALUES ('bf1', 'hbf', 'doc1', '__backfilled__', 'old', '["old"]', 'file', 'yellow', 500, 500)`,
    ).run();

    const summary = getCorrectionsSummary(db);
    expect(summary.total).toBe(1);
  });
});

describe("createCorrection", () => {
  let tmpDir: string;
  let tmpFile: string;
  const content = "This sentence has a common mistake in it. Another sentence follows.";

  function insertDocWithFile(id: string, filePath: string) {
    db.prepare(
      "INSERT INTO documents (id, source, file_path, title, last_opened_at, created_at) VALUES (?, 'file', ?, 'Test Doc', 1000, 1000)",
    ).run(id, filePath);
  }

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "margin-test-"));
    tmpFile = join(tmpDir, "test.md");
    writeFileSync(tmpFile, content);
  });

  afterEach(() => {
    try { unlinkSync(tmpFile); } catch {}
  });

  it("creates correction with highlight and correction row", () => {
    insertDocWithFile("doc1", tmpFile);
    const result = createCorrection(db, {
      document_id: "doc1",
      original_text: "common mistake",
      notes: ["Should be 'frequent error'"],
    });
    expect(result).not.toHaveProperty("error");
    if (!("error" in result)) {
      expect(result.correction_id).toBeTruthy();
      expect(result.highlight_id).toBeTruthy();
      expect(result.session_id).toBeTruthy();

      // Verify highlight exists
      const h = db.prepare("SELECT id FROM highlights WHERE id = ?").get(result.highlight_id);
      expect(h).toBeTruthy();

      // Verify correction exists
      const c = db.prepare("SELECT id FROM corrections WHERE id = ?").get(result.correction_id);
      expect(c).toBeTruthy();
    }
  });

  it("stores writing_type in correction", () => {
    insertDocWithFile("doc1", tmpFile);
    const result = createCorrection(db, {
      document_id: "doc1",
      original_text: "common mistake",
      notes: ["fix it"],
      writing_type: "email",
    });
    expect(result).not.toHaveProperty("error");
    if (!("error" in result)) {
      const row = db.prepare("SELECT writing_type FROM corrections WHERE id = ?").get(result.correction_id) as { writing_type: string };
      expect(row.writing_type).toBe("email");
    }
  });

  it("errors when text not found", () => {
    insertDocWithFile("doc1", tmpFile);
    const result = createCorrection(db, {
      document_id: "doc1",
      original_text: "nonexistent text",
      notes: ["note"],
    });
    expect(result).toHaveProperty("error");
  });
});

describe("deleteCorrection", () => {
  it("deletes correction and associated highlight", () => {
    // Insert doc + highlight + correction manually
    db.prepare(
      "INSERT INTO documents (id, source, title, last_opened_at, created_at) VALUES ('doc1', 'file', 'Test', 1000, 1000)",
    ).run();
    db.prepare(
      "INSERT INTO highlights (id, document_id, color, text_content, from_pos, to_pos, created_at, updated_at) VALUES ('h1', 'doc1', 'yellow', 'text', 0, 4, 1000, 1000)",
    ).run();
    db.prepare(
      `INSERT INTO corrections (id, highlight_id, document_id, session_id, original_text, notes_json, document_source, highlight_color, created_at, updated_at) VALUES ('c1', 'h1', 'doc1', 'sess1', 'text', '["note"]', 'file', 'yellow', 1000, 1000)`,
    ).run();

    const result = deleteCorrection(db, "h1");
    expect(result).toHaveProperty("success");

    // Both should be gone
    expect(db.prepare("SELECT id FROM corrections WHERE highlight_id = 'h1'").get()).toBeUndefined();
    expect(db.prepare("SELECT id FROM highlights WHERE id = 'h1'").get()).toBeUndefined();
  });

  it("errors for nonexistent correction", () => {
    const result = deleteCorrection(db, "nonexistent");
    expect(result).toHaveProperty("error");
  });
});

describe("updateCorrectionWritingType", () => {
  it("updates writing_type", () => {
    db.prepare(
      "INSERT INTO documents (id, source, title, last_opened_at, created_at) VALUES ('doc1', 'file', 'Test', 1000, 1000)",
    ).run();
    db.prepare(
      "INSERT INTO highlights (id, document_id, color, text_content, from_pos, to_pos, created_at, updated_at) VALUES ('h1', 'doc1', 'yellow', 'text', 0, 4, 1000, 1000)",
    ).run();
    db.prepare(
      `INSERT INTO corrections (id, highlight_id, document_id, session_id, original_text, notes_json, document_source, highlight_color, created_at, updated_at) VALUES ('c1', 'h1', 'doc1', 'sess1', 'text', '["note"]', 'file', 'yellow', 1000, 1000)`,
    ).run();

    const result = updateCorrectionWritingType(db, "h1", "blog");
    expect(result).toHaveProperty("success");

    const row = db.prepare("SELECT writing_type FROM corrections WHERE highlight_id = 'h1'").get() as { writing_type: string };
    expect(row.writing_type).toBe("blog");
  });

  it("errors for nonexistent correction", () => {
    const result = updateCorrectionWritingType(db, "nonexistent", "email");
    expect(result).toHaveProperty("error");
  });
});
