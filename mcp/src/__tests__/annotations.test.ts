import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type Database from "better-sqlite3";
import { writeFileSync, unlinkSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createTestDb } from "../db.js";
import {
  getAnnotations,
  createHighlight,
  createMarginNote,
  deleteHighlight,
  findTextInDocument,
  highlightByText,
} from "../tools/annotations.js";

let db: Database.Database;

function insertDoc(id: string) {
  db.prepare(
    "INSERT INTO documents (id, source, title, last_opened_at, created_at) VALUES (?, 'file', 'Test', 1000, 1000)",
  ).run(id);
}

function insertHighlight(
  id: string,
  docId: string,
  fromPos: number,
  toPos: number,
  color: string = "yellow",
) {
  db.prepare(
    `INSERT INTO highlights (id, document_id, color, text_content, from_pos, to_pos, created_at, updated_at)
     VALUES (?, ?, ?, 'text', ?, ?, 1000, 1000)`,
  ).run(id, docId, color, fromPos, toPos);
}

function insertNote(id: string, highlightId: string, content: string) {
  db.prepare(
    `INSERT INTO margin_notes (id, highlight_id, content, created_at, updated_at)
     VALUES (?, ?, ?, 1000, 1000)`,
  ).run(id, highlightId, content);
}

beforeEach(() => {
  db = createTestDb();
});

afterEach(() => {
  db.close();
});

describe("getAnnotations", () => {
  it("returns highlights with nested notes, ordered by from_pos", () => {
    insertDoc("doc1");
    insertHighlight("h2", "doc1", 50, 55);
    insertHighlight("h1", "doc1", 10, 17);
    insertNote("n1", "h1", "note on earlier");
    insertNote("n2", "h2", "note on later");

    const annotations = getAnnotations(db, "doc1");
    expect(annotations).toHaveLength(2);
    expect(annotations[0].highlight.from_pos).toBe(10);
    expect(annotations[0].notes).toHaveLength(1);
    expect(annotations[0].notes[0].content).toBe("note on earlier");
    expect(annotations[1].highlight.from_pos).toBe(50);
  });

  it("returns empty array for doc with no highlights", () => {
    insertDoc("doc1");
    expect(getAnnotations(db, "doc1")).toHaveLength(0);
  });

  it("returns highlight with empty notes array when no notes exist", () => {
    insertDoc("doc1");
    insertHighlight("h1", "doc1", 0, 5);

    const annotations = getAnnotations(db, "doc1");
    expect(annotations).toHaveLength(1);
    expect(annotations[0].notes).toHaveLength(0);
  });

  it("groups multiple notes under the same highlight", () => {
    insertDoc("doc1");
    insertHighlight("h1", "doc1", 0, 5);
    insertNote("n1", "h1", "first note");
    insertNote("n2", "h1", "second note");

    const annotations = getAnnotations(db, "doc1");
    expect(annotations).toHaveLength(1);
    expect(annotations[0].notes).toHaveLength(2);
  });
});

describe("createHighlight", () => {
  it("inserts highlight and returns record with generated UUID", () => {
    insertDoc("doc1");
    const result = createHighlight(db, {
      document_id: "doc1",
      color: "yellow",
      text_content: "hello world",
      from_pos: 0,
      to_pos: 11,
    });
    expect(result).not.toHaveProperty("error");
    if (!("error" in result)) {
      expect(result.id).toBeTruthy();
      expect(result.document_id).toBe("doc1");
      expect(result.color).toBe("yellow");
      expect(result.text_content).toBe("hello world");
    }
  });

  it("updates last_opened_at on document (touch_document)", () => {
    insertDoc("doc1");
    const before = (
      db
        .prepare("SELECT last_opened_at FROM documents WHERE id = 'doc1'")
        .get() as { last_opened_at: number }
    ).last_opened_at;

    createHighlight(db, {
      document_id: "doc1",
      color: "green",
      text_content: "test",
      from_pos: 0,
      to_pos: 4,
    });

    const after = (
      db
        .prepare("SELECT last_opened_at FROM documents WHERE id = 'doc1'")
        .get() as { last_opened_at: number }
    ).last_opened_at;
    expect(after).toBeGreaterThanOrEqual(before);
  });

  it("validates color", () => {
    insertDoc("doc1");
    const result = createHighlight(db, {
      document_id: "doc1",
      color: "red",
      text_content: "test",
      from_pos: 0,
      to_pos: 4,
    });
    expect(result).toHaveProperty("error");
  });

  it("errors for nonexistent document", () => {
    const result = createHighlight(db, {
      document_id: "nonexistent",
      color: "yellow",
      text_content: "test",
      from_pos: 0,
      to_pos: 4,
    });
    expect(result).toHaveProperty("error");
  });

  it("errors when from_pos >= to_pos", () => {
    insertDoc("doc1");
    const result = createHighlight(db, {
      document_id: "doc1",
      color: "yellow",
      text_content: "test",
      from_pos: 10,
      to_pos: 10,
    });
    expect(result).toHaveProperty("error");
  });

  it("errors when from_pos is negative", () => {
    insertDoc("doc1");
    const result = createHighlight(db, {
      document_id: "doc1",
      color: "yellow",
      text_content: "test",
      from_pos: -1,
      to_pos: 4,
    });
    expect(result).toHaveProperty("error");
  });
});

describe("createMarginNote", () => {
  it("inserts note and returns record", () => {
    insertDoc("doc1");
    insertHighlight("h1", "doc1", 0, 5);

    const result = createMarginNote(db, "h1", "my note");
    expect(result).not.toHaveProperty("error");
    if (!("error" in result)) {
      expect(result.id).toBeTruthy();
      expect(result.highlight_id).toBe("h1");
      expect(result.content).toBe("my note");
    }
  });

  it("updates last_opened_at on document (touch_document)", () => {
    insertDoc("doc1");
    insertHighlight("h1", "doc1", 0, 5);

    createMarginNote(db, "h1", "note");

    const after = (
      db
        .prepare("SELECT last_opened_at FROM documents WHERE id = 'doc1'")
        .get() as { last_opened_at: number }
    ).last_opened_at;
    expect(after).toBeGreaterThanOrEqual(1000);
  });

  it("errors for invalid highlight_id", () => {
    const result = createMarginNote(db, "nonexistent", "note");
    expect(result).toHaveProperty("error");
    if ("error" in result) {
      expect(result.error).toContain("not found");
    }
  });
});

describe("deleteHighlight", () => {
  it("removes highlight", () => {
    insertDoc("doc1");
    insertHighlight("h1", "doc1", 0, 5);

    const result = deleteHighlight(db, "h1");
    expect(result).toHaveProperty("success");

    const count = (
      db.prepare("SELECT COUNT(*) as c FROM highlights").get() as { c: number }
    ).c;
    expect(count).toBe(0);
  });

  it("cascading deletes notes", () => {
    insertDoc("doc1");
    insertHighlight("h1", "doc1", 0, 5);
    insertNote("n1", "h1", "my note");

    deleteHighlight(db, "h1");

    const count = (
      db.prepare("SELECT COUNT(*) as c FROM margin_notes").get() as {
        c: number;
      }
    ).c;
    expect(count).toBe(0);
  });

  it("errors for nonexistent highlight", () => {
    const result = deleteHighlight(db, "nonexistent");
    expect(result).toHaveProperty("error");
  });
});

describe("findTextInDocument", () => {
  let tmpDir: string;
  let tmpFile: string;
  const content = "The quick brown fox jumps over the lazy dog. Testing text search.";

  function insertDocWithFile(id: string, filePath: string) {
    db.prepare(
      "INSERT INTO documents (id, source, file_path, title, last_opened_at, created_at) VALUES (?, 'file', ?, 'Test', 1000, 1000)",
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

  it("finds text and returns correct positions", () => {
    insertDocWithFile("doc1", tmpFile);
    const result = findTextInDocument(db, "doc1", "brown fox");
    expect(result).not.toHaveProperty("error");
    if (!("error" in result)) {
      expect(result.from_pos).toBe(10);
      expect(result.to_pos).toBe(19);
      expect(result.text_content).toBe("brown fox");
    }
  });

  it("returns prefix and suffix context", () => {
    insertDocWithFile("doc1", tmpFile);
    const result = findTextInDocument(db, "doc1", "brown fox");
    expect(result).not.toHaveProperty("error");
    if (!("error" in result)) {
      expect(result.prefix_context).toBe("The quick ");
      expect(result.suffix_context.length).toBeGreaterThan(0);
    }
  });

  it("errors when text not found", () => {
    insertDocWithFile("doc1", tmpFile);
    const result = findTextInDocument(db, "doc1", "nonexistent phrase");
    expect(result).toHaveProperty("error");
  });

  it("errors for nonexistent document", () => {
    const result = findTextInDocument(db, "nonexistent", "text");
    expect(result).toHaveProperty("error");
  });
});

describe("highlightByText", () => {
  let tmpDir: string;
  let tmpFile: string;
  const content = "Hello world, this is a test document for highlighting.";

  function insertDocWithFile(id: string, filePath: string) {
    db.prepare(
      "INSERT INTO documents (id, source, file_path, title, last_opened_at, created_at) VALUES (?, 'file', ?, 'Test', 1000, 1000)",
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

  it("creates highlight by text match", () => {
    insertDocWithFile("doc1", tmpFile);
    const result = highlightByText(db, {
      document_id: "doc1",
      text_to_highlight: "test document",
      color: "yellow",
    });
    expect(result).not.toHaveProperty("error");
    if (!("error" in result)) {
      expect(result.highlight.text_content).toBe("test document");
      expect(result.highlight.color).toBe("yellow");
      expect(result.note).toBeUndefined();
    }
  });

  it("creates highlight with attached note", () => {
    insertDocWithFile("doc1", tmpFile);
    const result = highlightByText(db, {
      document_id: "doc1",
      text_to_highlight: "Hello world",
      color: "green",
      note: "Opening line",
    });
    expect(result).not.toHaveProperty("error");
    if (!("error" in result)) {
      expect(result.highlight.text_content).toBe("Hello world");
      expect(result.note).toBeDefined();
      expect(result.note!.content).toBe("Opening line");
    }
  });
});
