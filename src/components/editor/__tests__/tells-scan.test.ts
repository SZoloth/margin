import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import type { WritingRule } from "@/lib/tauri-commands";
import { RuleScan, setRuleScanMatches } from "../extensions/rule-scan";
import {
  scanDocForMatches,
  scanDocForTells,
  tellAsWritingRule,
} from "../extensions/tells-scan";

const SAMPLE = "I wanted to reach out to delve into the rich tapestry of logistics.";

function personalRule(overrides: Partial<WritingRule> = {}): WritingRule {
  return {
    id: "mine",
    writingType: "general",
    category: "kill-words",
    ruleText: "delve",
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

function editorWith(html: string) {
  return new Editor({ extensions: [StarterKit, RuleScan], content: html });
}

function render(editor: Editor, rules: WritingRule[], aiTells: boolean) {
  const matches = scanDocForMatches(editor.state.doc, rules, { aiTells });
  editor.view.dispatch(setRuleScanMatches(editor.state.tr, matches));
  return [...editor.view.dom.querySelectorAll<HTMLElement>(".rule-violation")];
}

describe("AI tells lens", () => {
  it("marks tells as rule decorations", () => {
    const editor = editorWith(`<p>${SAMPLE}</p>`);
    const spans = render(editor, [], true);
    expect(spans.map((s) => s.textContent)).toEqual([
      "I wanted to reach out",
      "delve",
      "rich tapestry",
    ]);
    expect(spans.every((s) => s.dataset.ruleId?.startsWith("tells:"))).toBe(true);
    editor.destroy();
  });

  it("shows the personal rule where it overlaps a tell", () => {
    const editor = editorWith(`<p>${SAMPLE}</p>`);
    const spans = render(editor, [personalRule()], true);
    const delve = spans.filter((s) => s.textContent === "delve");
    expect(delve).toHaveLength(1);
    expect(delve[0]!.dataset.ruleId).toBe("mine");
    expect(spans.filter((s) => s.dataset.ruleId?.startsWith("tells:"))).toHaveLength(2);
    editor.destroy();
  });

  it("removes tells when the lens is off and keeps personal rules", () => {
    const editor = editorWith(`<p>${SAMPLE}</p>`);
    expect(render(editor, [personalRule()], true)).toHaveLength(3);
    const off = render(editor, [personalRule()], false);
    expect(off.map((s) => s.dataset.ruleId)).toEqual(["mine"]);
    editor.destroy();
  });

  it("leaves hint-tier rules out by default", () => {
    const editor = editorWith("<p>It doesn't just work, it sings.</p>");
    expect(scanDocForTells(editor.state.doc, ["hint"]).map((m) => m.ruleId)).toContain(
      "tells:negation-first-003",
    );
    expect(render(editor, [], true)).toHaveLength(0);
    editor.destroy();
  });

  it("skips code and blockquotes", () => {
    const editor = editorWith(
      "<blockquote><p>delve</p></blockquote><pre><code>delve</code></pre><p><code>delve</code> here</p>",
    );
    expect(render(editor, [], true)).toHaveLength(0);
    editor.destroy();
  });

  it("turns a tell into a rule card with its note and fix", () => {
    const rule = tellAsWritingRule("tells:stock-phrase-007");
    expect(rule).toMatchObject({
      source: "tells",
      ruleText: "stock phrase: 'I wanted to reach out'",
      exampleAfter: "[just reach out]",
    });
    expect(tellAsWritingRule("mine")).toBeNull();
  });
});
