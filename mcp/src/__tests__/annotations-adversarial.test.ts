import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type Database from "better-sqlite3";
import { writeFileSync, unlinkSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createTestDb } from "../db.js";
import {
  findTextInDocument,
  highlightByText,
  getAnnotations,
} from "../tools/annotations.js";
import { createCorrection } from "../tools/corrections.js";

let db: Database.Database;
let tmpDir: string;
let tmpFile: string;

function insertDocWithFile(id: string, filePath: string) {
  db.prepare(
    "INSERT INTO documents (id, source, file_path, title, last_opened_at, created_at) VALUES (?, 'file', ?, 'Test', 1000, 1000)",
  ).run(id, filePath);
}

function createTmpFile(content: string): string {
  tmpDir = mkdtempSync(join(tmpdir(), "margin-adversarial-"));
  tmpFile = join(tmpDir, "test.md");
  writeFileSync(tmpFile, content);
  return tmpFile;
}

beforeEach(() => {
  db = createTestDb();
});

afterEach(() => {
  db.close();
  try {
    unlinkSync(tmpFile);
  } catch {}
});

describe("adversarial edge cases", () => {
  describe("duplicate text bias", () => {
    it("always takes first occurrence", () => {
      const content = "The method fails. The method fails.";
      const filePath = createTmpFile(content);
      insertDocWithFile("doc1", filePath);

      const result = findTextInDocument(db, "doc1", "The method fails");
      expect(result).not.toHaveProperty("error");
      if (!("error" in result)) {
        expect(result.from_pos).toBe(0);
        expect(result.to_pos).toBe(16);
        expect(result.text_content).toBe("The method fails");
      }
    });
  });

  describe("multi-line text search", () => {
    it("finds text spanning newlines", () => {
      const content = "# Header\n\nFirst paragraph";
      const filePath = createTmpFile(content);
      insertDocWithFile("doc1", filePath);

      const result = findTextInDocument(db, "doc1", "Header\n\nFirst");
      expect(result).not.toHaveProperty("error");
      if (!("error" in result)) {
        const expectedFrom = content.indexOf("Header\n\nFirst");
        expect(result.from_pos).toBe(expectedFrom);
        expect(result.to_pos).toBe(expectedFrom + "Header\n\nFirst".length);
        expect(result.text_content).toBe("Header\n\nFirst");
      }
    });
  });

  describe("round-trip write-then-read", () => {
    it("highlightByText result matches getAnnotations read-back", () => {
      const content =
        "Hello world, this is a test document for highlighting.";
      const filePath = createTmpFile(content);
      insertDocWithFile("doc1", filePath);

      const writeResult = highlightByText(db, {
        document_id: "doc1",
        text_to_highlight: "test document",
        color: "yellow",
      });
      expect(writeResult).not.toHaveProperty("error");

      const annotations = getAnnotations(db, "doc1");
      expect(annotations).toHaveLength(1);
      expect(annotations[0].highlight.text_content).toBe("test document");

      const expectedFrom = content.indexOf("test document");
      expect(annotations[0].highlight.from_pos).toBe(expectedFrom);
      expect(annotations[0].highlight.to_pos).toBe(
        expectedFrom + "test document".length,
      );
    });
  });

  describe("empty notes on createCorrection", () => {
    it("accepts empty notes array without error", () => {
      const content = "This sentence has a common mistake in it.";
      const filePath = createTmpFile(content);
      insertDocWithFile("doc1", filePath);

      const result = createCorrection(db, {
        document_id: "doc1",
        original_text: "common mistake",
        notes: [],
      });
      expect(result).not.toHaveProperty("error");
      if (!("error" in result)) {
        const row = db
          .prepare(
            "SELECT notes_json FROM corrections WHERE id = ?",
          )
          .get(result.correction_id) as { notes_json: string };
        expect(row.notes_json).toBe("[]");
      }
    });
  });

  describe("highlightByText round-trip with note", () => {
    it("creates highlight with attached note readable via getAnnotations", () => {
      const content = "Some important text here.";
      const filePath = createTmpFile(content);
      insertDocWithFile("doc1", filePath);

      const writeResult = highlightByText(db, {
        document_id: "doc1",
        text_to_highlight: "important text",
        color: "green",
        note: "key passage",
      });
      expect(writeResult).not.toHaveProperty("error");
      if (!("error" in writeResult)) {
        expect(writeResult.highlight.text_content).toBe("important text");
        expect(writeResult.note).toBeDefined();
        expect(writeResult.note!.content).toBe("key passage");
      }

      const annotations = getAnnotations(db, "doc1");
      expect(annotations).toHaveLength(1);
      expect(annotations[0].highlight.text_content).toBe("important text");
      expect(annotations[0].highlight.color).toBe("green");
      expect(annotations[0].notes).toHaveLength(1);
      expect(annotations[0].notes[0].content).toBe("key passage");
    });
  });
});
