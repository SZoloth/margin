import { describe, it, expect } from "vitest";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { MultiColorHighlight } from "@/components/editor/extensions/highlight";
import { allowedMarkRanges, collectMarkExtents, planHighlightOverlap } from "../highlight-ranges";

const schema = getSchema([StarterKit, MultiColorHighlight]);
const highlightType = schema.marks.highlight!;

type JsonDoc = Parameters<typeof schema.nodeFromJSON>[0];

function doc(content: JsonDoc[]) {
  return schema.nodeFromJSON({ type: "doc", content });
}

function p(text: string, marks?: JsonDoc[]): JsonDoc {
  return { type: "paragraph", content: [{ type: "text", text, ...(marks ? { marks } : {}) }] };
}

const hl = (id: string, color = "yellow") => ({
  type: "highlight",
  attrs: { color, highlightId: id },
});

describe("allowedMarkRanges", () => {
  it("returns the full range for plain paragraphs", () => {
    const d = doc([p("hello world")]);
    expect(allowedMarkRanges(d, highlightType, 1, 6)).toEqual([{ from: 1, to: 6 }]);
  });

  it("merges across paragraph boundaries", () => {
    // p1 text at pos 1-4, p2 text at pos 6-9
    const d = doc([p("one"), p("two")]);
    expect(allowedMarkRanges(d, highlightType, 1, 9)).toEqual([{ from: 1, to: 9 }]);
  });

  it("returns [] when the whole selection is inside a code block", () => {
    const d = doc([
      p("before"),
      { type: "codeBlock", content: [{ type: "text", text: "const x = 1" }] },
    ]);
    // codeBlock text occupies positions 9..20
    const map = d.textBetween(0, d.content.size, "\n");
    const codeStart = 9;
    expect(map).toBe("before\nconst x = 1");
    expect(allowedMarkRanges(d, highlightType, codeStart, codeStart + 5)).toEqual([]);
  });

  it("splits a selection that spans a code block into the allowed sides", () => {
    const d = doc([
      p("aaa"),
      { type: "codeBlock", content: [{ type: "text", text: "CCC" }] },
      p("bbb"),
    ]);
    // Layout: p(aaa)=[0,5) text 1-4; codeBlock=[5,10) text 6-9; p(bbb)=[10,15) text 11-14
    const ranges = allowedMarkRanges(d, highlightType, 1, 15);
    expect(ranges).toEqual([
      { from: 1, to: 4 },
      { from: 11, to: 14 },
    ]);
  });

  it("splits out text carrying the inline code mark", () => {
    const d = doc([
      {
        type: "paragraph",
        content: [
          { type: "text", text: "a" },
          { type: "text", text: "X", marks: [{ type: "code" }] },
          { type: "text", text: "b" },
        ],
      },
    ]);
    // text at 1-2 ("a"), 2-3 ("X" code), 3-4 ("b")
    expect(allowedMarkRanges(d, highlightType, 1, 4)).toEqual([
      { from: 1, to: 2 },
      { from: 3, to: 4 },
    ]);
  });
});

describe("collectMarkExtents", () => {
  it("maps each highlight id to its document extent", () => {
    const d = doc([p("one two", [hl("h1")]), p("three", [hl("h2", "green")])]);
    const extents = collectMarkExtents(d, "highlight");
    expect(extents.get("h1")).toMatchObject({ from: 1, to: 8, color: "yellow" });
    expect(extents.get("h2")).toMatchObject({ color: "green" });
  });

  it("ignores marks without a highlightId", () => {
    const d = doc([
      {
        type: "paragraph",
        content: [
          { type: "text", text: "naked", marks: [{ type: "highlight", attrs: { color: "blue", highlightId: null } }] },
        ],
      },
    ]);
    expect(collectMarkExtents(d, "highlight").size).toBe(0);
  });
});

describe("planHighlightOverlap", () => {
  it("no marks → empty plan", () => {
    const d = doc([p("plain")]);
    const plan = planHighlightOverlap(d, "highlight", 1, 4);
    expect(plan.reuse).toBeNull();
    expect(plan.deleteIds).toEqual([]);
    expect(plan.shrink).toEqual([]);
    expect(plan.clone).toEqual([]);
  });

  it("exact-cover → reuse", () => {
    const d = doc([p("target", [hl("h1")])]); // mark covers 1-7
    const plan = planHighlightOverlap(d, "highlight", 1, 7);
    expect(plan.reuse?.id).toBe("h1");
    expect(plan.deleteIds).toEqual([]);
    expect(plan.shrink).toEqual([]);
  });

  it("selection larger than the mark → reuse (extend)", () => {
    const d = doc([
      {
        type: "paragraph",
        content: [
          { type: "text", text: "ab" },
          { type: "text", text: "cd", marks: [hl("h1")] },
          { type: "text", text: "ef" },
        ],
      },
    ]);
    // mark covers 3-5; select 1-7
    const plan = planHighlightOverlap(d, "highlight", 1, 7);
    expect(plan.reuse?.id).toBe("h1");
    expect(plan.shrink).toEqual([]);
    expect(plan.clone).toEqual([]);
  });

  it("selection inside a mark → shrink + clone split", () => {
    const d = doc([p("abcdef", [hl("h1")])]); // mark covers 1-7
    const plan = planHighlightOverlap(d, "highlight", 3, 5);
    expect(plan.reuse).toBeNull();
    expect(plan.shrink).toEqual([{ id: "h1", color: "yellow", from: 1, to: 3 }]);
    expect(plan.clone).toEqual([{ id: "h1", color: "yellow", from: 5, to: 7 }]);
  });

  it("selection overlapping the tail of a mark → shrink only", () => {
    const d = doc([
      { type: "paragraph", content: [
        { type: "text", text: "abcdef", marks: [hl("h1")] },
        { type: "text", text: "gh" },
      ]},
    ]);
    // mark covers 1-7; select 4-9 (extends into unmarked text)
    const plan = planHighlightOverlap(d, "highlight", 4, 9);
    expect(plan.reuse).toBeNull();
    expect(plan.shrink).toEqual([{ id: "h1", color: "yellow", from: 1, to: 4 }]);
    expect(plan.clone).toEqual([]);
  });

  it("two covered marks → reuse first, delete second", () => {
    const d = doc([
      { type: "paragraph", content: [
        { type: "text", text: "aa", marks: [hl("h1")] },
        { type: "text", text: "bb", marks: [hl("h2")] },
      ]},
    ]);
    // h1 covers 1-3, h2 covers 3-5; select 1-5
    const plan = planHighlightOverlap(d, "highlight", 1, 5);
    expect(plan.reuse?.id).toBe("h1");
    expect(plan.deleteIds).toEqual(["h2"]);
  });

  it("marks not in knownIds are treated as unbacked", () => {
    const d = doc([p("target", [hl("ghost")])]);
    const plan = planHighlightOverlap(d, "highlight", 1, 7, new Set(["other"]));
    expect(plan.reuse).toBeNull();
    expect(plan.deleteIds).toEqual([]);
  });

  it("adjacent marks are not overlapped", () => {
    const d = doc([
      { type: "paragraph", content: [
        { type: "text", text: "aa", marks: [hl("h1")] },
        { type: "text", text: "bb", marks: [hl("h2")] },
      ]},
    ]);
    // h2 covers 3-5; select inside h1 (1-3)
    const plan = planHighlightOverlap(d, "highlight", 1, 3);
    expect(plan.reuse?.id).toBe("h1");
    expect(plan.deleteIds).toEqual([]);
    expect(plan.shrink).toEqual([]);
  });
});
