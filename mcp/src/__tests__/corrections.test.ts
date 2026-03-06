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
  setCorrectionPolarity,
  getVoiceSignals,
  getAllCorrectionsForProfile,
  autoSynthesizeRule,
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

describe("setCorrectionPolarity", () => {
  function setupCorrection() {
    db.prepare(
      "INSERT INTO documents (id, source, title, last_opened_at, created_at) VALUES ('doc1', 'file', 'Test', 1000, 1000)",
    ).run();
    db.prepare(
      "INSERT INTO highlights (id, document_id, color, text_content, from_pos, to_pos, created_at, updated_at) VALUES ('h1', 'doc1', 'yellow', 'text', 0, 4, 1000, 1000)",
    ).run();
    db.prepare(
      `INSERT INTO corrections (id, highlight_id, document_id, session_id, original_text, notes_json, document_source, highlight_color, created_at, updated_at) VALUES ('c1', 'h1', 'doc1', 'sess1', 'text', '["note"]', 'file', 'yellow', 1000, 1000)`,
    ).run();
  }

  it("sets polarity to positive", () => {
    setupCorrection();
    const result = setCorrectionPolarity(db, "h1", "positive");
    expect(result).toHaveProperty("success");

    const row = db.prepare("SELECT polarity FROM corrections WHERE highlight_id = 'h1'").get() as { polarity: string };
    expect(row.polarity).toBe("positive");
  });

  it("sets polarity to corrective", () => {
    setupCorrection();
    const result = setCorrectionPolarity(db, "h1", "corrective");
    expect(result).toHaveProperty("success");

    const row = db.prepare("SELECT polarity FROM corrections WHERE highlight_id = 'h1'").get() as { polarity: string };
    expect(row.polarity).toBe("corrective");
  });

  it("rejects invalid polarity", () => {
    setupCorrection();
    const result = setCorrectionPolarity(db, "h1", "invalid");
    expect(result).toHaveProperty("error");
  });

  it("errors for nonexistent correction", () => {
    const result = setCorrectionPolarity(db, "nonexistent", "positive");
    expect(result).toHaveProperty("error");
  });
});

describe("getVoiceSignals", () => {
  function insertCorrectionWithPolarity(
    highlightId: string,
    text: string,
    polarity: string | null,
    createdAt: number = 1000,
  ) {
    db.prepare(
      `INSERT INTO corrections
         (id, highlight_id, document_id, session_id, original_text, notes_json,
          document_title, document_source, highlight_color, created_at, updated_at, polarity)
       VALUES (?, ?, 'doc1', 'sess1', ?, '["note"]', 'Test', 'file', 'yellow', ?, ?, ?)`,
    ).run(`id-${highlightId}`, highlightId, text, createdAt, createdAt, polarity);
  }

  it("returns only corrections with polarity set", () => {
    insertCorrectionWithPolarity("h1", "good text", "positive");
    insertCorrectionWithPolarity("h2", "bad text", "corrective");
    insertCorrectionWithPolarity("h3", "untagged", null);

    const results = getVoiceSignals(db);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.polarity !== null)).toBe(true);
  });

  it("filters by polarity", () => {
    insertCorrectionWithPolarity("h1", "good text", "positive");
    insertCorrectionWithPolarity("h2", "bad text", "corrective");

    const positive = getVoiceSignals(db, "positive");
    expect(positive).toHaveLength(1);
    expect(positive[0].polarity).toBe("positive");

    const corrective = getVoiceSignals(db, "corrective");
    expect(corrective).toHaveLength(1);
    expect(corrective[0].polarity).toBe("corrective");
  });

  it("respects limit", () => {
    for (let i = 0; i < 5; i++) {
      insertCorrectionWithPolarity(`h${i}`, `text${i}`, "positive", i);
    }
    expect(getVoiceSignals(db, undefined, 2)).toHaveLength(2);
  });

  it("returns empty array when no polarity set", () => {
    insertCorrectionWithPolarity("h1", "untagged", null);
    expect(getVoiceSignals(db)).toHaveLength(0);
  });
});

describe("getCorrections polarity field", () => {
  it("includes polarity in returned records", () => {
    db.prepare(
      `INSERT INTO corrections
         (id, highlight_id, document_id, session_id, original_text, notes_json,
          document_title, document_source, highlight_color, created_at, updated_at, polarity)
       VALUES ('c1', 'h1', 'doc1', 'sess1', 'text', '["note"]', 'Test', 'file', 'yellow', 1000, 1000, 'positive')`,
    ).run();

    const results = getCorrections(db);
    expect(results).toHaveLength(1);
    expect(results[0].polarity).toBe("positive");
  });

  it("returns null polarity when not set", () => {
    insertCorrection("h1", "text", '["note"]');
    const results = getCorrections(db);
    expect(results[0].polarity).toBeNull();
  });
});

describe("getAllCorrectionsForProfile", () => {
  it("returns all non-backfilled corrections without limit", () => {
    for (let i = 0; i < 10; i++) {
      insertCorrection(`h${i}`, `text${i}`, '["note"]', { createdAt: i });
    }

    const results = getAllCorrectionsForProfile(db);
    expect(results).toHaveLength(10);
  });

  it("excludes backfilled rows", () => {
    insertCorrection("h1", "real correction", '["note"]');
    db.prepare(
      `INSERT INTO corrections
         (id, highlight_id, document_id, session_id, original_text, notes_json,
          document_source, highlight_color, created_at, updated_at)
       VALUES ('bf1', 'hbf', 'doc1', '__backfilled__', 'old', '["old"]', 'file', 'yellow', 500, 500)`,
    ).run();

    const results = getAllCorrectionsForProfile(db);
    expect(results).toHaveLength(1);
    expect(results[0].originalText).toBe("real correction");
  });

  it("returns empty array for empty table", () => {
    const results = getAllCorrectionsForProfile(db);
    expect(results).toHaveLength(0);
  });
});

describe("autoSynthesizeRule", () => {
  it("creates a should-fix rule in auto-synthesized category", () => {
    insertCorrection("h1", "bad phrase", '["use X instead"]');

    autoSynthesizeRule(db, {
      highlight_id: "h1",
      original_text: "bad phrase",
      notes: ["use X instead"],
      writing_type: "email",
    });

    const rule = db.prepare(
      "SELECT rule_text, writing_type, category, severity, example_before, source FROM writing_rules WHERE category = 'auto-synthesized'"
    ).get() as { rule_text: string; writing_type: string; category: string; severity: string; example_before: string; source: string };
    expect(rule).toBeTruthy();
    expect(rule.rule_text).toBe("use X instead");
    expect(rule.writing_type).toBe("email");
    expect(rule.severity).toBe("must-fix");
    expect(rule.example_before).toBe("bad phrase");
    expect(rule.source).toBe("auto-synthesis");
  });

  it("does NOT create a rule when notes are empty", () => {
    insertCorrection("h1", "text", '[]');

    autoSynthesizeRule(db, {
      highlight_id: "h1",
      original_text: "text",
      notes: [],
    });

    const count = (db.prepare("SELECT COUNT(*) as count FROM writing_rules").get() as { count: number }).count;
    expect(count).toBe(0);
  });

  it("coalesces duplicate notes via signal_count increment", () => {
    insertCorrection("h1", "bad phrase 1", '["fix this"]');
    insertCorrection("h2", "bad phrase 2", '["fix this"]');

    autoSynthesizeRule(db, {
      highlight_id: "h1",
      original_text: "bad phrase 1",
      notes: ["fix this"],
    });
    autoSynthesizeRule(db, {
      highlight_id: "h2",
      original_text: "bad phrase 2",
      notes: ["fix this"],
    });

    const count = (db.prepare("SELECT COUNT(*) as count FROM writing_rules WHERE category = 'auto-synthesized'").get() as { count: number }).count;
    expect(count).toBe(1);

    const rule = db.prepare("SELECT signal_count FROM writing_rules WHERE category = 'auto-synthesized'").get() as { signal_count: number };
    expect(rule.signal_count).toBe(2);
  });

  it("sets synthesized_at on the correction", () => {
    insertCorrection("h1", "text", '["note"]');

    const before = db.prepare("SELECT synthesized_at FROM corrections WHERE highlight_id = 'h1'").get() as { synthesized_at: number | null };
    expect(before.synthesized_at).toBeNull();

    autoSynthesizeRule(db, {
      highlight_id: "h1",
      original_text: "text",
      notes: ["note"],
    });

    const after = db.prepare("SELECT synthesized_at FROM corrections WHERE highlight_id = 'h1'").get() as { synthesized_at: number | null };
    expect(after.synthesized_at).not.toBeNull();
  });

  it("defaults writing_type to general when not provided", () => {
    insertCorrection("h1", "text", '["note"]');

    autoSynthesizeRule(db, {
      highlight_id: "h1",
      original_text: "text",
      notes: ["note"],
    });

    const rule = db.prepare("SELECT writing_type FROM writing_rules WHERE category = 'auto-synthesized'").get() as { writing_type: string };
    expect(rule.writing_type).toBe("general");
  });

  it("truncates long original_text for example_before", () => {
    const longText = "x".repeat(300);
    insertCorrection("h1", longText, '["note"]');

    autoSynthesizeRule(db, {
      highlight_id: "h1",
      original_text: longText,
      notes: ["note"],
    });

    const rule = db.prepare("SELECT example_before FROM writing_rules WHERE category = 'auto-synthesized'").get() as { example_before: string };
    expect(rule.example_before.length).toBe(200);
  });
});
