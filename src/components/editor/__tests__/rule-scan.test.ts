import { describe, it, expect } from "vitest";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { scanDocForRules } from "../extensions/rule-scan";
import type { WritingRule } from "@/lib/tauri-commands";

const schema = getSchema([StarterKit]);

type JsonDoc = Parameters<typeof schema.nodeFromJSON>[0];

function doc(content: JsonDoc[]) {
  return schema.nodeFromJSON({ type: "doc", content });
}

function p(text: string): JsonDoc {
  return { type: "paragraph", content: [{ type: "text", text }] };
}

function rule(overrides: Partial<WritingRule>): WritingRule {
  return {
    id: "r1",
    writingType: "general",
    category: "kill-words",
    ruleText: "leverage",
    whenToApply: null,
    why: null,
    severity: "must-fix",
    exampleBefore: null,
    exampleAfter: null,
    source: "synthesis",
    signalCount: 2,
    notes: null,
    reviewedAt: null,
    detectionPattern: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("scanDocForRules", () => {
  it("finds literal kill-words matches", () => {
    const d = doc([p("we should leverage this")]);
    const matches = scanDocForRules(d, [rule({})]);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.ruleText).toBe("leverage");
    // "leverage" starts at char offset 12 inside the paragraph → pos 13
    expect(d.textBetween(matches[0]!.from, matches[0]!.to)).toBe("leverage");
  });

  it("finds detection_pattern regex matches", () => {
    const d = doc([p("it was very quickly done")]);
    const matches = scanDocForRules(d, [
      rule({ detectionPattern: "\\bvery\\b", category: "tone" }),
    ]);
    expect(matches).toHaveLength(1);
    expect(d.textBetween(matches[0]!.from, matches[0]!.to)).toBe("very");
  });

  it("excludes unreviewed synthesis candidates", () => {
    const d = doc([p("we should leverage this")]);
    const matches = scanDocForRules(d, [rule({ source: "synthesis-candidate", reviewedAt: null })]);
    expect(matches).toHaveLength(0);
  });

  it("includes reviewed candidates", () => {
    const d = doc([p("we should leverage this")]);
    const matches = scanDocForRules(d, [rule({ source: "synthesis-candidate", reviewedAt: 123 })]);
    expect(matches).toHaveLength(1);
  });

  it("excludes non-general writing types", () => {
    const d = doc([p("we should leverage this")]);
    const matches = scanDocForRules(d, [rule({ writingType: "email" })]);
    expect(matches).toHaveLength(0);
  });

  it("skips matches inside code blocks", () => {
    const d = doc([
      { type: "codeBlock", content: [{ type: "text", text: "leverage()" }] },
      p("leverage this"),
    ]);
    const matches = scanDocForRules(d, [rule({})]);
    expect(matches).toHaveLength(1);
    expect(d.textBetween(matches[0]!.from, matches[0]!.to)).toBe("leverage");
  });

  it("matches auto-synthesized example_before literally", () => {
    const d = doc([p("in order to ship this")]);
    const matches = scanDocForRules(d, [
      rule({ category: "auto-synthesized", exampleBefore: "in order to", exampleAfter: "to" }),
    ]);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.suggestion).toBe("to");
  });

  it("tolerates invalid regexes", () => {
    const d = doc([p("hello")]);
    const matches = scanDocForRules(d, [rule({ detectionPattern: "([", category: "tone" })]);
    expect(matches).toHaveLength(0);
  });
});
