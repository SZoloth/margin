import { describe, expect, it } from "vitest";
import { createRequire } from "module";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { buildCandidates, buildPassageCandidates, formatRules, loadRulesAsOf, parseNotes, toMs, type RawCorrection, type RawDocument } from "../corpus.ts";

const require = createRequire(import.meta.url);
const longText = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ") + " We leverage synergy daily.";

const doc = (id: string, file: string | null): RawDocument => ({ id, title: id, file_path: file });
const corr = (id: string, docId: string, text: string, notes: string[], at: number, type: string | null = "email"): RawCorrection => ({
  id,
  document_id: docId,
  original_text: text,
  notes_json: JSON.stringify(notes),
  writing_type: type,
  created_at: at,
});

describe("toMs / parseNotes", () => {
  it("normalises seconds to ms and leaves ms alone", () => {
    expect(toMs(1_700_000_000)).toBe(1_700_000_000_000);
    expect(toMs(1_700_000_000_000)).toBe(1_700_000_000_000);
  });
  it("parses only string notes", () => {
    expect(parseNotes('["a"," ",1,"b"]')).toEqual(["a", "b"]);
    expect(parseNotes("not json")).toEqual([]);
  });
});

describe("buildCandidates", () => {
  const files: Record<string, string> = { "/d1.md": longText, "/short.md": "too short" };
  const read = (p: string) => files[p] ?? null;

  it("keeps a draft whose flagged span is still in the file and picks the majority type", () => {
    const { candidates, skipped } = buildCandidates(
      [corr("c1", "d1", "We  leverage synergy daily.", ["too corporate"], 5000), corr("c2", "d1", "word3 word4", ["meh"], 7000, "blog"), corr("c3", "d1", "word9", ["x"], 8000)],
      new Map([["d1", doc("d1", "/d1.md")]]),
      read,
    );
    expect(skipped).toEqual([]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].type).toBe("email");
    expect(candidates[0].spans).toHaveLength(3);
    expect(candidates[0].firstCorrectionAt).toBe(5_000_000);
  });

  it("logs every drop with a reason instead of silently shrinking the corpus", () => {
    const { candidates, skipped } = buildCandidates(
      [
        corr("c1", "nofile", "x", ["n"], 1),
        corr("c2", "gone", "x", ["n"], 1),
        corr("c3", "short", "too short", ["n"], 1),
        corr("c4", "d1", "text that is no longer in the file", ["n"], 1),
      ],
      new Map([["nofile", doc("nofile", null)], ["gone", doc("gone", "/missing.md")], ["short", doc("short", "/short.md")], ["d1", doc("d1", "/d1.md")]]),
      read,
    );
    expect(candidates).toEqual([]);
    expect(skipped.map((s) => s.reason)).toEqual([
      expect.stringMatching(/no file_path/),
      expect.stringMatching(/missing on disk/),
      expect.stringMatching(/word count/),
      expect.stringMatching(/edited since/),
    ]);
  });
});

describe("buildPassageCandidates", () => {
  const words = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`).join(" ");
  const long = `${words("a", 30)} We leverage synergy daily. ${words("b", 30)} Utilize the pipeline. ${words("c", 5)}`;
  const withCtx = (id: string, doc: string, text: string, ctx: string | null, at = 1_700_000_000_000): RawCorrection => ({
    ...corr(id, doc, text, ["too corporate"], at),
    extended_context: ctx,
  });

  it("makes one unit from a long context and attaches every flagged row inside it", () => {
    const { candidates, unplacedRows } = buildPassageCandidates([
      withCtx("c1", "d1", "We leverage synergy daily.", long),
      withCtx("c2", "d1", "Utilize the pipeline.", long),
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].id).toBe("d1#1");
    expect(candidates[0].documentId).toBe("d1");
    expect(candidates[0].spans.map((x) => x.id).sort()).toEqual(["c1", "c2"]);
    expect(unplacedRows).toBe(0);
  });

  it("folds a passage that sits inside a longer one into the longer one", () => {
    const inner = `${words("b", 30)} Utilize the pipeline. ${words("c", 5)}`;
    const { candidates } = buildPassageCandidates([
      withCtx("c1", "d1", "We leverage synergy daily.", long),
      withCtx("c2", "d1", "Utilize the pipeline.", inner),
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].spans).toHaveLength(2);
  });

  it("counts rows whose text is in no kept passage instead of dropping them silently", () => {
    const { candidates, unplacedRows, skipped } = buildPassageCandidates([
      withCtx("c1", "d1", "We leverage synergy daily.", long),
      withCtx("c2", "d1", "text from somewhere else", "too short"),
      withCtx("c3", "d2", "anything", null),
    ]);
    expect(candidates).toHaveLength(1);
    expect(unplacedRows).toBe(2);
    expect(skipped.map((x) => x.id)).toEqual(["d2"]);
  });

  it("keeps different documents apart and uses the majority writing type", () => {
    const rows = [
      { ...withCtx("c1", "d1", "We leverage synergy daily.", long), writing_type: "email" },
      { ...withCtx("c2", "d1", "Utilize the pipeline.", long), writing_type: "email" },
      { ...withCtx("c3", "d1", "a0 a1", long), writing_type: "blog" },
      { ...withCtx("c4", "d2", "We leverage synergy daily.", long), writing_type: "blog" },
    ];
    const { candidates } = buildPassageCandidates(rows);
    expect(candidates.map((c) => [c.documentId, c.type])).toEqual([["d1", "email"], ["d2", "blog"]]);
  });
});

describe("rules as of a cutoff", () => {
  it("excludes rules updated at or after the cutoff, archived rules, unreviewed candidates and auto-synthesized", () => {
    const Database = require("better-sqlite3");
    const dir = mkdtempSync(join(tmpdir(), "rewrite-eval-"));
    const path = join(dir, "t.db");
    const db = new Database(path);
    db.exec(`CREATE TABLE writing_rules (id TEXT, writing_type TEXT, category TEXT, rule_text TEXT, severity TEXT,
      example_before TEXT, example_after TEXT, source TEXT, signal_count INTEGER, created_at INTEGER, updated_at INTEGER,
      reviewed_at INTEGER, register TEXT, archived_at INTEGER);`);
    const ins = db.prepare(`INSERT INTO writing_rules VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    ins.run("1", "general", "kill-words", "old rule", "must-fix", "a", "b", "manual", 3, 100, 1700000001000, 1, null, null);
    ins.run("2", "general", "kill-words", "merged after cutoff", "must-fix", null, null, "manual", 3, 100, 1700000006000, 1, null, null);
    ins.run("3", "email", "tone", "archived", "must-fix", null, null, "manual", 1, 100, 1700000001000, 1, null, 50);
    ins.run("4", "email", "tone", "unreviewed candidate", "must-fix", null, null, "synthesis-candidate", 1, 100, 1700000001000, null, null, null);
    ins.run("5", "general", "auto-synthesized", "inverted", "must-fix", null, null, "manual", 1, 100, 1700000001000, 1, null, null);
    ins.run("6", "email", "tone", "second-based timestamp", "should-fix", null, null, "manual", 1, 1, 1700000002, 1, null, null);
    db.close();
    writeFileSync(join(dir, "marker"), "");
    const out = loadRulesAsOf(path, 1700000005000, "email", "professional");
    expect(out).toMatch(/old rule/);
    expect(out).toMatch(/before: a/);
    expect(out).toMatch(/second-based timestamp/);
    expect(out).not.toMatch(/merged after cutoff|archived|unreviewed candidate|inverted/);
  });

  it("says so when nothing is visible, rather than returning an empty prompt block", () => {
    expect(formatRules([], "email", "professional")).toMatch(/no rules visible/);
  });
});
