import { describe, it, expect } from "vitest";
import { isChecked, isSuggested, severityFor, sourceNoteIds, strictnessOf } from "../rules-model";
import { scanDraft, toRegExp } from "../rules-bench";
import type { WritingRule } from "@/lib/tauri-commands";

const rule = (over: Partial<WritingRule>): WritingRule => ({
  id: "x", ruleText: "", severity: "should-fix", category: "grammar", signalCount: 1, source: "manual",
  writingType: "general", whenToApply: null, why: null, exampleBefore: null, exampleAfter: null,
  notes: null, reviewedAt: null, detectionPattern: null, createdAt: 1, updatedAt: 1, ...over,
});

describe("strictness", () => {
  it("collapses should-fix and nice-to-fix into one level", () => {
    expect(strictnessOf("must-fix")).toBe("hard");
    expect(strictnessOf("should-fix")).toBe("preference");
    expect(strictnessOf("nice-to-fix")).toBe("preference");
  });
  it("keeps a preference's own severity when it stays a preference", () => {
    expect(severityFor("preference", "nice-to-fix")).toBe("nice-to-fix");
    expect(severityFor("preference", "must-fix")).toBe("should-fix");
    expect(severityFor("hard", "nice-to-fix")).toBe("must-fix");
  });
});

describe("isSuggested", () => {
  it("matches the CLI export gate", () => {
    expect(isSuggested({ source: "synthesis-candidate", reviewedAt: null })).toBe(true);
    expect(isSuggested({ source: "synthesis-candidate", reviewedAt: 5 })).toBe(false);
    expect(isSuggested({ source: "seed", reviewedAt: null })).toBe(false);
  });
});

describe("isChecked", () => {
  const r = { detectionPattern: null, severity: "must-fix" as const, category: "grammar", exampleBefore: null };
  it("matches what the writing guard scans for", () => {
    expect(isChecked(r)).toBe(false);
    expect(isChecked({ ...r, detectionPattern: "x" })).toBe(true);
    expect(isChecked({ ...r, category: "kill-words" })).toBe(true);
    expect(isChecked({ ...r, category: "kill-words", severity: "should-fix" })).toBe(false);
    expect(isChecked({ ...r, category: "heading-patterns", exampleBefore: "^Intro" })).toBe(true);
  });
});

describe("sourceNoteIds", () => {
  it("parses the same format as the backend", () => {
    expect(sourceNoteIds("synthesized-from:h1, h2; agent note")).toEqual(["h1", "h2"]);
    expect(sourceNoteIds("synthesized-from:h1\nmore")).toEqual(["h1"]);
    expect(sourceNoteIds("prohibition-id:X")).toEqual([]);
    expect(sourceNoteIds(null)).toEqual([]);
  });
});

describe("scanDraft", () => {
  it("treats must-fix kill words as hard and blocks", () => {
    const res = scanDraft("Teams Leverage it.", [rule({ id: "k", ruleText: "leverage", severity: "must-fix", category: "kill-words" })]);
    expect(res.hits).toEqual([{ ruleId: "k", start: 6, end: 14, kind: "hard" }]);
    expect(res.wouldBlock).toBe(true);
  });
  it("ignores should-fix kill words, like the guard", () => {
    expect(scanDraft("leverage", [rule({ ruleText: "leverage", category: "kill-words" })]).hits).toEqual([]);
  });
  it("blocks on soft patterns only when two families show up", () => {
    const a = rule({ id: "a", detectionPattern: "\\bjust\\b", category: "hedges" });
    const b = rule({ id: "b", detectionPattern: "(?i)delve", category: "ai-slop" });
    expect(scanDraft("I just think", [a, b]).wouldBlock).toBe(false);
    expect(scanDraft("I just Delve", [a, b]).wouldBlock).toBe(true);
  });
  it("skips suggestions and invalid patterns", () => {
    const res = scanDraft("leverage (", [
      rule({ ruleText: "leverage", severity: "must-fix", category: "kill-words", source: "synthesis-candidate" }),
      rule({ id: "bad", detectionPattern: "(" }),
    ]);
    expect(res.hits).toEqual([]);
  });
  it("translates Python inline flags", () => {
    expect(toRegExp("(?i)abc")?.flags).toContain("i");
    expect(toRegExp("(")).toBeNull();
  });
});
