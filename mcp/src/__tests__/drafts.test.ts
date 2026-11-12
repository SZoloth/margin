import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  compareDrafts,
  createDraftReview,
  getDraftReview,
  draftReviewStats,
  tokenize,
  type DraftDeps,
  type DraftManifest,
} from "../tools/drafts.js";

let baseDir: string;
let opened: string[];
let clock: number;
let deps: DraftDeps;

beforeEach(() => {
  baseDir = mkdtempSync(join(tmpdir(), "margin-drafts-"));
  opened = [];
  clock = new Date(2026, 10, 12, 9, 0).getTime();
  deps = {
    baseDir,
    now: () => clock,
    opener: async (p) => { opened.push(p); return true; },
  };
});

afterEach(() => {
  rmSync(baseDir, { recursive: true, force: true });
});

async function create(text: string, writing_type = "outreach", title = "Acme intro") {
  const res = await createDraftReview({ text, writing_type, title }, deps);
  if ("error" in res) throw new Error(res.error);
  return res;
}

function edit(path: string, text: string) {
  writeFileSync(path, text);
}

function review(id: string) {
  const res = getDraftReview(id, deps);
  if ("error" in res) throw new Error(res.error);
  return res;
}

const DRAFT = "Hi Dana. I loved your talk on search ranking. Would you have time for a short call next week?";

describe("tokenize", () => {
  it("keeps original text, compares without markdown or case, drops list markers", () => {
    const t = tokenize("- **Bold** word\n1. `Code`");
    expect(t.map((x) => x.text)).toEqual(["**Bold**", "word", "`Code`"]);
    expect(t.map((x) => x.key)).toEqual(["bold", "word", "code"]);
  });
});

describe("createDraftReview", () => {
  it("writes the draft, the untouched copy and a manifest, then opens the draft", async () => {
    const res = await create(DRAFT);
    expect(res.id).toMatch(/^2026-11-12-acme-intro-[0-9a-f]{4}$/);
    expect(res.path).toBe(join(baseDir, `${res.id}.md`));
    expect(res.opened).toBe(true);
    expect(opened).toEqual([res.path]);
    expect(readFileSync(res.path, "utf8")).toBe(DRAFT);
    expect(readFileSync(join(baseDir, ".claude", `${res.id}.md`), "utf8")).toBe(DRAFT);
    const manifest = JSON.parse(readFileSync(join(baseDir, ".claude", `${res.id}.json`), "utf8")) as DraftManifest;
    expect(manifest).toEqual({ id: res.id, title: "Acme intro", writing_type: "outreach", created_at: clock, review: null });
  });

  it("reports opened false when the opener fails", async () => {
    deps.opener = async () => false;
    const res = await create(DRAFT);
    expect(res.opened).toBe(false);
    expect(existsSync(res.path)).toBe(true);
  });

  it("rejects an invalid writing_type, empty text and oversized text", async () => {
    expect(await createDraftReview({ text: DRAFT, writing_type: "novel", title: "x" }, deps)).toHaveProperty("error");
    expect(await createDraftReview({ text: "  \n", writing_type: "outreach", title: "x" }, deps)).toHaveProperty("error");
    expect(await createDraftReview({ text: "a".repeat(200 * 1024 + 1), writing_type: "outreach", title: "x" }, deps))
      .toHaveProperty("error");
    expect(opened).toEqual([]);
  });
});

describe("getDraftReview", () => {
  it("an untouched draft is all Claude with no changes", async () => {
    const { id } = await create(DRAFT);
    const r = review(id);
    expect(r.still_claude).toBe(1);
    expect(r.kept_of_draft).toBe(1);
    expect(r.changes).toEqual([]);
    expect(r.unchanged).toBe(true);
    expect(r.final_text).toBe(DRAFT);
  });

  it("a word swap gives one change with the right before and after", async () => {
    const { id, path } = await create(DRAFT);
    edit(path, DRAFT.replace("short call", "quick call"));
    const r = review(id);
    expect(r.changes).toEqual([{ before: "short", after: "quick" }]);
    expect(r.unchanged).toBe(false);
    expect(r.still_claude).toBe(0.95); // 18 of 19 words
  });

  it("a deleted sentence lowers kept_of_draft but not still_claude", async () => {
    const { id, path } = await create(DRAFT);
    edit(path, "Hi Dana. Would you have time for a short call next week?");
    const r = review(id);
    expect(r.still_claude).toBe(1);
    expect(r.kept_of_draft).toBeLessThan(1);
    expect(r.changes).toEqual([{ before: "I loved your talk on search ranking.", after: "" }]);
  });

  it("markdown-only reformatting counts as unchanged", async () => {
    const { id, path } = await create("First point here.\nSecond point here.");
    edit(path, "- **First** point here.\n- Second point _here._\n");
    const r = review(id);
    expect(r.unchanged).toBe(true);
    expect(r.still_claude).toBe(1);
    expect(r.kept_of_draft).toBe(1);
  });

  it("curly quotes from the editor's Typography and markdown escapes are not edits", () => {
    const result = compareDrafts(`I'd say "yes" to snake_case`, "I\u2019d say \u201Cyes\u201D to snake\\_case");
    expect(result).toMatchObject({ still_claude: 1, changes: [] });
  });

  it("merges changes separated by two or fewer unchanged words", () => {
    const res = compareDrafts("one two three four five six seven", "one 2 three four 5 six seven");
    expect("error" in res ? [] : res.changes).toEqual([{ before: "two three four five", after: "2 three four 5" }]);
    const apart = compareDrafts("a b c d e f g", "a X c d e Y g");
    expect("error" in apart ? [] : apart.changes).toHaveLength(2);
  });

  it("rejects ids that could escape the drafts folder", () => {
    for (const bad of ["../secret", "a/b", "..", "A-B", ""]) {
      expect(getDraftReview(bad, deps)).toHaveProperty("error");
    }
  });

  it("returns an error for an unknown id", () => {
    expect(getDraftReview("2026-11-12-nope-0000", deps)).toHaveProperty("error");
  });

  it("is idempotent and stores the review in the manifest", async () => {
    const { id, path } = await create(DRAFT);
    edit(path, DRAFT.replace("Hi Dana.", "Dana,"));
    const first = review(id);
    const second = review(id);
    expect(second).toEqual(first);
    const manifest = JSON.parse(readFileSync(join(baseDir, ".claude", `${id}.json`), "utf8")) as DraftManifest;
    const { id: _i, title: _t, writing_type: _w, final_text: _f, unchanged: _u, ...stored } = first;
    expect(manifest.review).toEqual(stored);
  });
});

describe("draftReviewStats", () => {
  it("reports medians and the earlier/later split", async () => {
    // Four outreach drafts with still_claude 0.5, 0.6, 0.9, 1.0 in created order.
    const draft = "w1 w2 w3 w4 w5 w6 w7 w8 w9 w10";
    const edits = [
      "w1 w2 w3 w4 w5 x1 x2 x3 x4 x5", // 0.5
      "w1 w2 w3 w4 w5 w6 x1 x2 x3 x4", // 0.6
      "w1 w2 w3 w4 w5 w6 w7 w8 w9 x1", // 0.9
      draft, // 1.0
    ];
    const ids: string[] = [];
    for (const [n, text] of edits.entries()) {
      clock += 1000;
      const { id, path } = await create(draft, "outreach", `d${n}`);
      edit(path, text);
      review(id);
      ids.push(id);
    }
    clock += 1000;
    const pending = await create(draft, "cover-letter", "pending");

    const stats = draftReviewStats(deps);
    if ("error" in stats) throw new Error(stats.error);
    const outreach = stats.by_type.find((s) => s.writing_type === "outreach");
    expect(outreach).toEqual({
      writing_type: "outreach",
      drafts: 4,
      reviewed: 4,
      median_still_claude: 0.75,
      median_kept_of_draft: 0.75,
      trend: { earlier_median_still_claude: 0.55, later_median_still_claude: 0.95 },
    });
    const cover = stats.by_type.find((s) => s.writing_type === "cover-letter");
    expect(cover).toMatchObject({ drafts: 1, reviewed: 0, median_still_claude: null, trend: null });
    expect(stats.unreviewed).toEqual([pending.id]);

    const only = draftReviewStats(deps, "cover-letter");
    expect("error" in only ? null : only.by_type.map((s) => s.writing_type)).toEqual(["cover-letter"]);
  });

  it("skips unreadable manifests and rejects an invalid writing_type", async () => {
    await create(DRAFT);
    writeFileSync(join(baseDir, ".claude", "broken.json"), "{not json");
    const stats = draftReviewStats(deps);
    expect("error" in stats ? null : stats.by_type[0].drafts).toBe(1);
    expect(draftReviewStats(deps, "novel")).toHaveProperty("error");
  });

  it("returns empty stats when no drafts exist", () => {
    expect(draftReviewStats(deps)).toEqual({ by_type: [], unreviewed: [] });
  });
});
