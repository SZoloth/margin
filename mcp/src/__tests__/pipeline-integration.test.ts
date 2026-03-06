import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type Database from "better-sqlite3";
import { writeFileSync, unlinkSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { createTestDb } from "../db.js";
import {
  createCorrection,
  deleteCorrection,
  setCorrectionPolarity,
  getAllCorrectionsForProfile,
  getCorrections,
} from "../tools/corrections.js";
import { nowMillis } from "../db.js";
import {
  createWritingRule,
  getWritingRules,
  getWritingProfileMarkdown,
  getWritingGuardPy,
} from "../tools/writing-rules.js";

let db: Database.Database;
let tmpDir: string;
let tmpFile: string;

const docId = "pipeline-doc-1";
const fileContent =
  "The project leverages synergies to deliver holistic solutions. Another sentence follows here.";

function insertDocWithFile(id: string, filePath: string) {
  db.prepare(
    "INSERT INTO documents (id, source, file_path, title, last_opened_at, created_at) VALUES (?, 'file', ?, 'Test Doc', 1000, 1000)",
  ).run(id, filePath);
}

beforeEach(() => {
  db = createTestDb();
  tmpDir = mkdtempSync(join(tmpdir(), "margin-pipeline-"));
  tmpFile = join(tmpDir, "test.md");
  writeFileSync(tmpFile, fileContent);
});

afterEach(() => {
  db.close();
  try {
    unlinkSync(tmpFile);
  } catch {}
});

describe("full pipeline: feedback → synthesis → rules → export", () => {
  it("creates correction, rule, and exports them in profile and guard", () => {
    insertDocWithFile(docId, tmpFile);

    // Create a correction on text found in the document
    const corrResult = createCorrection(db, {
      document_id: docId,
      original_text: "leverages synergies",
      notes: ["Corporate jargon — say what you mean"],
    });
    expect(corrResult).not.toHaveProperty("error");
    if ("error" in corrResult) throw new Error(corrResult.error);

    // Tag the correction as corrective
    const polarityResult = setCorrectionPolarity(
      db,
      corrResult.highlight_id,
      "corrective",
    );
    expect(polarityResult).toEqual({ success: true });

    // Create a kill-words writing rule derived from this correction
    const ruleResult = createWritingRule(db, {
      rule_text: "leverages",
      writing_type: "general",
      category: "kill-words",
      severity: "must-fix",
      why: "Corporate jargon",
    });
    expect(ruleResult).not.toHaveProperty("error");
    if ("error" in ruleResult) throw new Error(ruleResult.error);

    // Verify the correction appears in the profile export
    const allCorrections = getAllCorrectionsForProfile(db);
    expect(allCorrections).toHaveLength(1);
    expect(allCorrections[0].originalText).toBe("leverages synergies");
    expect(allCorrections[0].polarity).toBe("corrective");

    // Verify the rule is retrievable
    const rules = getWritingRules(db);
    expect(rules).toHaveLength(1);
    expect(rules[0].ruleText).toBe("leverages");
    expect(rules[0].category).toBe("kill-words");
    expect(rules[0].severity).toBe("must-fix");

    // Generate the writing profile markdown
    const profileMd = getWritingProfileMarkdown(rules, allCorrections);
    expect(profileMd).toContain("## Corrections");
    expect(profileMd).toContain("leverages synergies");
    expect(profileMd).toContain("# Writing Rules");
    expect(profileMd).toContain("leverages");

    // Generate the writing guard Python hook
    const guardPy = getWritingGuardPy(rules);
    expect(guardPy).toContain("KILL_WORDS");
    expect(guardPy).toContain("leverages");
  });

  it("is retry-safe: duplicate synthesized rule creation merges into one logical rule", () => {
    insertDocWithFile(docId, tmpFile);

    const corrResult = createCorrection(db, {
      document_id: docId,
      original_text: "leverages synergies",
      notes: ["Avoid jargon"],
    });
    expect(corrResult).not.toHaveProperty("error");
    if ("error" in corrResult) throw new Error(corrResult.error);

    const first = createWritingRule(db, {
      rule_text: "leverages",
      writing_type: "general",
      category: "kill-words",
      severity: "should-fix",
      signal_count: 1,
    });
    expect(first).not.toHaveProperty("error");
    if ("error" in first) throw new Error(first.error);

    const second = createWritingRule(db, {
      rule_text: "leverages",
      writing_type: "general",
      category: "kill-words",
      severity: "must-fix",
      signal_count: 2,
      when_to_apply: "When drafting prose",
    });
    expect(second).not.toHaveProperty("error");
    if ("error" in second) throw new Error(second.error);

    const rules = getWritingRules(db, "general");
    expect(rules).toHaveLength(1);
    expect(rules[0].id).toBe(first.id);
    expect(rules[0].signalCount).toBe(3);
    expect(rules[0].severity).toBe("must-fix");
    expect(rules[0].whenToApply).toBe("When drafting prose");

    const guardPy = getWritingGuardPy(rules);
    expect(guardPy).toContain("leverages");
  });

  it("excludes backfilled corrections from profile export while preserving physical rows", () => {
    insertDocWithFile(docId, tmpFile);

    const corrResult = createCorrection(db, {
      document_id: docId,
      original_text: "leverages synergies",
      notes: ["Avoid jargon"],
    });
    expect(corrResult).not.toHaveProperty("error");
    if ("error" in corrResult) throw new Error(corrResult.error);

    db.prepare(
      `INSERT INTO corrections
         (id, highlight_id, document_id, session_id, original_text, notes_json,
          document_source, highlight_color, created_at, updated_at)
       VALUES ('bf1', 'hbf', ?, '__backfilled__', 'legacy backfill phrase', '["legacy"]', 'file', 'yellow', 500, 500)`,
    ).run(docId);

    const allCorrections = getAllCorrectionsForProfile(db);
    expect(allCorrections).toHaveLength(1);
    expect(allCorrections[0].originalText).toBe("leverages synergies");

    const totalRows = db
      .prepare("SELECT COUNT(*) as count FROM corrections")
      .get() as { count: number };
    expect(totalRows.count).toBe(2);

    const profileMd = getWritingProfileMarkdown([], allCorrections);
    expect(profileMd).toContain("leverages synergies");
    expect(profileMd).not.toContain("legacy backfill phrase");
  });
});

describe("transactional synthesis: mark_corrections_synthesized", () => {
  it("corrections remain unsynthesized until explicitly marked", () => {
    insertDocWithFile(docId, tmpFile);

    const corrResult = createCorrection(db, {
      document_id: docId,
      original_text: "leverages synergies",
      notes: ["Corporate jargon"],
    });
    expect(corrResult).not.toHaveProperty("error");
    if ("error" in corrResult) throw new Error(corrResult.error);

    // Corrections are unsynthesized by default
    const unsynthCount = (db.prepare(
      "SELECT COUNT(*) as count FROM corrections WHERE synthesized_at IS NULL AND session_id != '__backfilled__'"
    ).get() as { count: number }).count;
    expect(unsynthCount).toBe(1);

    // Create a rule (simulates synthesis) but DON'T mark corrections as synthesized
    const ruleResult = createWritingRule(db, {
      rule_text: "leverages",
      writing_type: "general",
      category: "kill-words",
      severity: "must-fix",
    });
    expect(ruleResult).not.toHaveProperty("error");

    // Correction is STILL unsynthesized — rule creation alone doesn't mark it
    const stillUnsynth = (db.prepare(
      "SELECT COUNT(*) as count FROM corrections WHERE synthesized_at IS NULL AND session_id != '__backfilled__'"
    ).get() as { count: number }).count;
    expect(stillUnsynth).toBe(1);
  });

  it("marks corrections as synthesized after explicit call", () => {
    insertDocWithFile(docId, tmpFile);

    const corrResult = createCorrection(db, {
      document_id: docId,
      original_text: "leverages synergies",
      notes: ["Corporate jargon"],
    });
    expect(corrResult).not.toHaveProperty("error");
    if ("error" in corrResult) throw new Error(corrResult.error);

    // Create rule then explicitly mark synthesized
    createWritingRule(db, {
      rule_text: "leverages",
      writing_type: "general",
      category: "kill-words",
      severity: "must-fix",
    });

    const now = nowMillis();
    const stmt = db.prepare("UPDATE corrections SET synthesized_at = ? WHERE highlight_id = ?");
    stmt.run(now, corrResult.highlight_id);

    // Now it's synthesized
    const synthCount = (db.prepare(
      "SELECT COUNT(*) as count FROM corrections WHERE synthesized_at IS NOT NULL AND session_id != '__backfilled__'"
    ).get() as { count: number }).count;
    expect(synthCount).toBe(1);
  });

  it("failed synthesis leaves corrections re-exportable", () => {
    insertDocWithFile(docId, tmpFile);

    const corr1 = createCorrection(db, {
      document_id: docId,
      original_text: "leverages synergies",
      notes: ["Jargon"],
    });
    expect(corr1).not.toHaveProperty("error");
    if ("error" in corr1) throw new Error(corr1.error);

    // Simulate: export happens (corrections are read) but synthesis fails
    // — no rules created, no mark_synthesized called
    const corrections = getCorrections(db);
    expect(corrections).toHaveLength(1);

    // Second "export" still returns the same corrections (not lost)
    const correctionsRetry = getCorrections(db);
    expect(correctionsRetry).toHaveLength(1);
    expect(correctionsRetry[0].originalText).toBe("leverages synergies");
  });
});

describe("delete cascade: correction + highlight removal", () => {
  it("removes both correction and highlight, clears profile export", () => {
    insertDocWithFile(docId, tmpFile);

    // Create a correction (which also creates a highlight)
    const corrResult = createCorrection(db, {
      document_id: docId,
      original_text: "holistic solutions",
      notes: ["Vague — be specific about what the solution does"],
    });
    expect(corrResult).not.toHaveProperty("error");
    if ("error" in corrResult) throw new Error(corrResult.error);

    // Verify both rows exist
    const highlight = db
      .prepare("SELECT id FROM highlights WHERE id = ?")
      .get(corrResult.highlight_id);
    expect(highlight).toBeTruthy();

    const correction = db
      .prepare("SELECT id FROM corrections WHERE highlight_id = ?")
      .get(corrResult.highlight_id);
    expect(correction).toBeTruthy();

    // Delete the correction by highlight_id
    const deleteResult = deleteCorrection(db, corrResult.highlight_id);
    expect(deleteResult).toEqual({ success: true });

    // Both rows should be gone
    const highlightAfter = db
      .prepare("SELECT id FROM highlights WHERE id = ?")
      .get(corrResult.highlight_id);
    expect(highlightAfter).toBeUndefined();

    const correctionAfter = db
      .prepare("SELECT id FROM corrections WHERE highlight_id = ?")
      .get(corrResult.highlight_id);
    expect(correctionAfter).toBeUndefined();

    // Profile export should be empty
    const allCorrections = getAllCorrectionsForProfile(db);
    expect(allCorrections).toHaveLength(0);

    // Profile markdown should not contain a Corrections section
    const rules = getWritingRules(db);
    const profileMd = getWritingProfileMarkdown(rules, allCorrections);
    expect(profileMd).not.toContain("## Corrections");
  });
});
