import { describe, expect, it } from "vitest";
import { buildCorrectionExportInputs } from "@/lib/export-annotations";
import type { Highlight, MarginNote } from "@/types/annotations";

const highlight = (id: string, text: string, fromPos: number): Highlight => ({
  id,
  document_id: "doc1",
  color: "yellow",
  text_content: text,
  from_pos: fromPos,
  to_pos: fromPos + text.length,
  prefix_context: null,
  suffix_context: null,
  created_at: 1000,
  updated_at: 1000,
  exported_at: null,
});

const note = (
  id: string,
  highlightId: string,
  content: string,
  intent: "correction" | "note" | "prompt",
): MarginNote => ({
  id,
  highlight_id: highlightId,
  content,
  intent,
  created_at: 1000,
  updated_at: 1000,
});

describe("buildCorrectionExportInputs", () => {
  it("splits margin notes by intent before persistence", () => {
    const result = buildCorrectionExportInputs({
      highlights: [
        highlight("h1", "bad phrase", 0),
        highlight("h2", "interesting thought", 20),
        highlight("h3", "ask the model", 50),
      ],
      marginNotes: [
        note("n1", "h1", "AI filler", "correction"),
        note("n2", "h2", "Save this thought", "note"),
        note("n3", "h3", "Turn this into a prompt", "prompt"),
      ],
      writingType: "general",
      polarityMap: new Map([["h1", "corrective"]]),
      rationaleMap: new Map(),
      getExtendedContext: () => "extended context",
    });

    expect(result.inputs).toHaveLength(2);
    expect(result.inputs.map((input) => input.highlight_id)).toEqual(["h1", "h3"]);
    expect(result.inputs.map((input) => input.intent)).toEqual(["correction", "prompt"]);
    expect(result.correctionCount).toBe(1);
    expect(result.promptCount).toBe(1);
    expect(result.noteOnlyCount).toBe(1);
  });
});
