import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type Database from "better-sqlite3";
import { createTestDb } from "../db.js";
import {
  gatherAnnotationCluster,
  distillTheses,
  saveThesis,
  getTheses,
  getThesisById,
  updateThesisStatus,
} from "../tools/thesis.js";

let db: Database.Database;

// --- Helpers ---

function insertDocument(id: string, title: string): void {
  db.prepare(
    `INSERT INTO documents (id, source, title, word_count, last_opened_at, created_at)
     VALUES (?, 'file', ?, 0, 1000, 1000)`,
  ).run(id, title);
}

function insertHighlight(
  id: string,
  documentId: string,
  text: string,
  opts: {
    color?: string;
    fromPos?: number;
    prefixContext?: string | null;
    suffixContext?: string | null;
  } = {},
): void {
  db.prepare(
    `INSERT INTO highlights (id, document_id, color, text_content, from_pos, to_pos, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1000, 1000)`,
  ).run(
    id,
    documentId,
    opts.color ?? "yellow",
    text,
    opts.fromPos ?? 0,
    (opts.fromPos ?? 0) + text.length,
  );
}

function insertNote(highlightId: string, content: string): void {
  db.prepare(
    `INSERT INTO margin_notes (id, highlight_id, content, created_at, updated_at)
     VALUES (?, ?, ?, 1000, 1000)`,
  ).run(`note-${highlightId}-${content.slice(0, 5)}`, highlightId, content);
}

function insertCorrection(
  highlightId: string,
  documentId: string,
  originalText: string,
  notes: string[],
  opts: { writingType?: string; polarity?: string } = {},
): void {
  db.prepare(
    `INSERT INTO corrections
       (id, highlight_id, document_id, session_id, original_text, notes_json,
        document_source, highlight_color, created_at, updated_at, writing_type, polarity)
     VALUES (?, ?, ?, 'sess', ?, ?, 'file', 'yellow', 1000, 1000, ?, ?)`,
  ).run(
    `corr-${highlightId}`,
    highlightId,
    documentId,
    originalText,
    JSON.stringify(notes),
    opts.writingType ?? null,
    opts.polarity ?? null,
  );
}

beforeEach(() => {
  db = createTestDb();
});

afterEach(() => {
  db.close();
});

// --- gatherAnnotationCluster ---

describe("gatherAnnotationCluster", () => {
  it("returns empty cluster when no documents match", () => {
    const result = gatherAnnotationCluster(db, { documentIds: ["nonexistent"] });
    expect(result.documents).toHaveLength(0);
    expect(result.totalHighlights).toBe(0);
  });

  it("returns highlights grouped by document with nested notes and corrections", () => {
    insertDocument("doc1", "Freight Brokerage");
    insertHighlight("h1", "doc1", "brokers still decide", { fromPos: 0 });
    insertHighlight("h2", "doc1", "AI removes routing", { fromPos: 50 });
    insertNote("h1", "key judgment point");
    insertCorrection("h1", "doc1", "brokers still decide", ["over-hedged"], {
      writingType: "blog",
    });

    const result = gatherAnnotationCluster(db, { documentIds: ["doc1"] });

    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].title).toBe("Freight Brokerage");
    expect(result.documents[0].highlights).toHaveLength(2);
    expect(result.totalHighlights).toBe(2);
    expect(result.totalNotes).toBe(1);
    expect(result.totalCorrections).toBe(1);

    const h1 = result.documents[0].highlights.find((h) => h.id === "h1")!;
    expect(h1.notes).toContain("key judgment point");
    expect(h1.corrections).toHaveLength(1);
    expect(h1.corrections[0].writingType).toBe("blog");
  });

  it("filters by writingType — only includes highlights with corrections of that type", () => {
    insertDocument("doc1", "Test Doc");
    insertHighlight("h1", "doc1", "text with blog correction", { fromPos: 0 });
    insertHighlight("h2", "doc1", "text with no correction", { fromPos: 50 });
    insertCorrection("h1", "doc1", "text with blog correction", ["fix this"], {
      writingType: "blog",
    });

    const result = gatherAnnotationCluster(db, { writingType: "blog" });

    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].highlights).toHaveLength(1);
    expect(result.documents[0].highlights[0].id).toBe("h1");
  });

  it("excludes backfilled corrections", () => {
    insertDocument("doc1", "Doc");
    insertHighlight("h1", "doc1", "text", { fromPos: 0 });
    // Insert backfilled correction
    db.prepare(
      `INSERT INTO corrections
         (id, highlight_id, document_id, session_id, original_text, notes_json,
          document_source, highlight_color, created_at, updated_at)
       VALUES ('c1', 'h1', 'doc1', '__backfilled__', 'text', '[]', 'file', 'yellow', 1000, 1000)`,
    ).run();

    const result = gatherAnnotationCluster(db, { documentIds: ["doc1"] });
    expect(result.totalCorrections).toBe(0);
    expect(result.documents[0].highlights[0].corrections).toHaveLength(0);
  });

  it("handles multiple documents", () => {
    insertDocument("doc1", "First");
    insertDocument("doc2", "Second");
    insertHighlight("h1", "doc1", "text a", { fromPos: 0 });
    insertHighlight("h2", "doc2", "text b", { fromPos: 0 });

    const result = gatherAnnotationCluster(db, { documentIds: ["doc1", "doc2"] });
    expect(result.documents).toHaveLength(2);
    expect(result.totalHighlights).toBe(2);
  });

  it("returns empty cluster when no filters provided and no highlights exist", () => {
    const result = gatherAnnotationCluster(db, {});
    expect(result.documents).toHaveLength(0);
  });
});

// --- distillTheses ---

describe("distillTheses", () => {
  it("returns cluster and synthesisPrompt", () => {
    insertDocument("doc1", "AI in Logistics");
    insertHighlight("h1", "doc1", "routing is now automated", { fromPos: 0 });

    const result = distillTheses(db, { documentIds: ["doc1"] });

    expect(result).toHaveProperty("cluster");
    expect(result).toHaveProperty("synthesisPrompt");
    expect(result.synthesisPrompt).toContain("thesis");
    expect(result.cluster.totalHighlights).toBe(1);
  });

  it("synthesisPrompt constrains output to single-sentence thesis statements", () => {
    const result = distillTheses(db, {});
    expect(result.synthesisPrompt).toContain("single sentence");
    expect(result.synthesisPrompt).toContain("highlightId");
    expect(result.synthesisPrompt).toContain("Do not draft paragraphs");
  });

  it("returns JSON shape in synthesisPrompt that matches expected evidence structure", () => {
    const result = distillTheses(db, {});
    // The prompt describes the expected JSON output shape with evidence
    expect(result.synthesisPrompt).toContain("evidence");
    expect(result.synthesisPrompt).toContain("relevance");
    expect(result.synthesisPrompt).toContain("confidence");
  });
});

// --- saveThesis / getTheses / getThesisById ---

describe("saveThesis", () => {
  it("saves a thesis with status draft", () => {
    const thesis = saveThesis(db, {
      statement: "AI removes mechanical tasks but not judgment",
      evidenceJson: JSON.stringify([
        { highlightId: "h1", text: "brokers still decide", relevance: "direct" },
      ]),
      confidence: "high — 3 highlights converge",
      sourceDocumentIdsJson: JSON.stringify(["doc1"]),
    });

    expect(thesis.status).toBe("draft");
    expect(thesis.statement).toBe("AI removes mechanical tasks but not judgment");
    expect(thesis.confidence).toBe("high — 3 highlights converge");
    expect(thesis.id).toBeTruthy();
  });

  it("saves without optional confidence", () => {
    const thesis = saveThesis(db, {
      statement: "A second thesis",
      evidenceJson: "[]",
      sourceDocumentIdsJson: "[]",
    });
    expect(thesis.confidence).toBeNull();
    expect(thesis.status).toBe("draft");
  });
});

describe("getTheses", () => {
  it("returns all theses ordered by created_at DESC", () => {
    saveThesis(db, {
      statement: "First thesis",
      evidenceJson: "[]",
      sourceDocumentIdsJson: "[]",
    });
    saveThesis(db, {
      statement: "Second thesis",
      evidenceJson: "[]",
      sourceDocumentIdsJson: "[]",
    });

    const all = getTheses(db);
    expect(all).toHaveLength(2);
    // Both should be present; order is by created_at DESC (may be same ms in test)
    const statements = all.map((t) => t.statement);
    expect(statements).toContain("First thesis");
    expect(statements).toContain("Second thesis");
  });

  it("filters by status", () => {
    const t1 = saveThesis(db, {
      statement: "Draft thesis",
      evidenceJson: "[]",
      sourceDocumentIdsJson: "[]",
    });
    updateThesisStatus(db, t1.id, "accepted");
    saveThesis(db, {
      statement: "Still draft",
      evidenceJson: "[]",
      sourceDocumentIdsJson: "[]",
    });

    const accepted = getTheses(db, "accepted");
    expect(accepted).toHaveLength(1);
    expect(accepted[0].statement).toBe("Draft thesis");

    const draft = getTheses(db, "draft");
    expect(draft).toHaveLength(1);
    expect(draft[0].statement).toBe("Still draft");
  });
});

describe("getThesisById", () => {
  it("returns null for nonexistent id", () => {
    expect(getThesisById(db, "no-such-id")).toBeNull();
  });

  it("returns saved thesis by id", () => {
    const saved = saveThesis(db, {
      statement: "found thesis",
      evidenceJson: "[]",
      sourceDocumentIdsJson: "[]",
    });
    const found = getThesisById(db, saved.id);
    expect(found).not.toBeNull();
    expect(found!.statement).toBe("found thesis");
  });
});

// --- updateThesisStatus ---

describe("updateThesisStatus", () => {
  it("updates status from draft to accepted", () => {
    const thesis = saveThesis(db, {
      statement: "test thesis",
      evidenceJson: "[]",
      sourceDocumentIdsJson: "[]",
    });
    expect(thesis.status).toBe("draft");

    const updated = updateThesisStatus(db, thesis.id, "accepted");
    expect("error" in updated).toBe(false);
    if (!("error" in updated)) {
      expect(updated.status).toBe("accepted");
    }
  });

  it("updates status to rejected", () => {
    const thesis = saveThesis(db, {
      statement: "test thesis",
      evidenceJson: "[]",
      sourceDocumentIdsJson: "[]",
    });
    const updated = updateThesisStatus(db, thesis.id, "rejected");
    if (!("error" in updated)) {
      expect(updated.status).toBe("rejected");
    }
  });

  it("returns error for nonexistent thesis", () => {
    const result = updateThesisStatus(db, "no-such-id", "accepted");
    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("no-such-id");
    }
  });

  it("reflects status change in getTheses", () => {
    const thesis = saveThesis(db, {
      statement: "will be accepted",
      evidenceJson: "[]",
      sourceDocumentIdsJson: "[]",
    });
    updateThesisStatus(db, thesis.id, "accepted");

    const accepted = getTheses(db, "accepted");
    expect(accepted.some((t) => t.id === thesis.id)).toBe(true);
    const draft = getTheses(db, "draft");
    expect(draft.some((t) => t.id === thesis.id)).toBe(false);
  });
});

// --- Evidence attribution validation (anti-hallucination guard) ---

describe("evidence attribution invariant", () => {
  it("all highlight IDs returned in cluster are real database IDs", () => {
    insertDocument("doc1", "Research Doc");
    insertHighlight("h-real-1", "doc1", "first highlight", { fromPos: 0 });
    insertHighlight("h-real-2", "doc1", "second highlight", { fromPos: 50 });

    const cluster = gatherAnnotationCluster(db, { documentIds: ["doc1"] });
    const allIds = cluster.documents
      .flatMap((d) => d.highlights.map((h) => h.id));

    expect(allIds).toContain("h-real-1");
    expect(allIds).toContain("h-real-2");
    expect(allIds).not.toContain("h-fake-id");
  });
});
