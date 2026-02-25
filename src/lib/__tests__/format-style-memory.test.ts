import { describe, it, expect } from "vitest";
import { formatStyleMemory } from "../export-annotations";
import type { CorrectionRecord } from "@/types/annotations";

function correction(overrides: Partial<CorrectionRecord> = {}): CorrectionRecord {
  return {
    originalText: "some text",
    notes: ["fix this"],
    highlightColor: "yellow",
    documentTitle: "Test Doc",
    documentId: "doc-1",
    createdAt: 1700000000000,
    writingType: null,
    ...overrides,
  };
}

describe("formatStyleMemory", () => {
  it("returns empty string for empty array", () => {
    expect(formatStyleMemory([])).toBe("");
  });

  it("produces valid markdown for a single correction", () => {
    const result = formatStyleMemory([correction()]);
    expect(result).toContain("# Writing preferences (from Margin)");
    expect(result).toContain("1 correction across 1 document");
    expect(result).toContain("some text");
    expect(result).toContain("fix this");
    expect(result).toContain("[yellow]");
    expect(result).toContain("Test Doc");
  });

  it("groups corrections by document", () => {
    const result = formatStyleMemory([
      correction({ documentId: "doc-1", documentTitle: "Article A", originalText: "word1" }),
      correction({ documentId: "doc-2", documentTitle: "Article B", originalText: "word2" }),
      correction({ documentId: "doc-1", documentTitle: "Article A", originalText: "word3" }),
    ]);
    // Should have two document headers
    const headers = result.match(/^## From /gm);
    expect(headers).toHaveLength(2);
    expect(result).toContain("3 corrections across 2 documents");
  });

  it("respects maxItems limit", () => {
    const corrections = Array.from({ length: 10 }, (_, i) =>
      correction({ originalText: `item-${i}`, createdAt: 1700000000000 + i }),
    );
    const result = formatStyleMemory(corrections, { maxItems: 3 });
    // Should only include the 3 most recent (highest createdAt)
    expect(result).toContain("item-9");
    expect(result).toContain("item-8");
    expect(result).toContain("item-7");
    expect(result).not.toContain("item-6");
  });

  it("respects maxPerDoc limit", () => {
    const corrections = Array.from({ length: 5 }, (_, i) =>
      correction({ originalText: `line-${i}` }),
    );
    const result = formatStyleMemory(corrections, { maxPerDoc: 2 });
    // Only 2 items should appear despite 5 corrections for same doc
    const bullets = result.match(/^- /gm);
    expect(bullets).toHaveLength(2);
  });

  it("sorts by createdAt descending", () => {
    const result = formatStyleMemory([
      correction({ originalText: "old", createdAt: 1000 }),
      correction({ originalText: "new", createdAt: 3000, documentId: "doc-2" }),
      correction({ originalText: "mid", createdAt: 2000, documentId: "doc-3" }),
    ]);
    // "new" doc should appear first (most recent)
    const newIdx = result.indexOf("new");
    const midIdx = result.indexOf("mid");
    const oldIdx = result.indexOf("old");
    expect(newIdx).toBeLessThan(midIdx);
    expect(midIdx).toBeLessThan(oldIdx);
  });

  it("handles null/missing fields gracefully", () => {
    const result = formatStyleMemory([
      correction({
        documentTitle: null,
        notes: [],
        highlightColor: "",
      }),
    ]);
    expect(result).toContain("Untitled");
    expect(result).toContain("flagged"); // empty notes fallback
  });

  it("includes writingType field in correction records", () => {
    const withType = correction({ writingType: "email" });
    expect(withType.writingType).toBe("email");

    const withoutType = correction({ writingType: null });
    expect(withoutType.writingType).toBeNull();

    // formatStyleMemory still works with writingType present
    const result = formatStyleMemory([withType, withoutType]);
    expect(result).toContain("# Writing preferences (from Margin)");
    expect(result).toContain("2 corrections");
  });
});
