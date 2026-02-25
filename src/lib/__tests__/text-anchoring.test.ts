import { describe, it, expect } from "vitest";
import { createAnchor, resolveAnchor } from "../text-anchoring";
import type { TextAnchor } from "../text-anchoring";

describe("createAnchor", () => {
  const text = "The quick brown fox jumps over the lazy dog.";

  it("extracts selected text with prefix and suffix context", () => {
    const anchor = createAnchor(text, 10, 19); // "brown fox"
    expect(anchor.text).toBe("brown fox");
    expect(anchor.from).toBe(10);
    expect(anchor.to).toBe(19);
    expect(anchor.prefix).toBe("The quick ");
    expect(anchor.suffix).toBe(" jumps over the lazy dog.");
  });

  it("handles selection at the start of the document", () => {
    const anchor = createAnchor(text, 0, 3); // "The"
    expect(anchor.text).toBe("The");
    expect(anchor.prefix).toBe("");
    expect(anchor.suffix.length).toBeLessThanOrEqual(30);
  });

  it("handles selection at the end of the document", () => {
    const anchor = createAnchor(text, 40, 44); // "dog."
    expect(anchor.text).toBe("dog.");
    expect(anchor.suffix).toBe("");
    expect(anchor.prefix.length).toBeLessThanOrEqual(30);
  });

  it("caps prefix/suffix at 30 characters", () => {
    const longText = "A".repeat(100) + "TARGET" + "B".repeat(100);
    const anchor = createAnchor(longText, 100, 106);
    expect(anchor.text).toBe("TARGET");
    expect(anchor.prefix.length).toBe(30);
    expect(anchor.suffix.length).toBe(30);
  });

  it("handles very short text", () => {
    const anchor = createAnchor("Hi", 0, 2);
    expect(anchor.text).toBe("Hi");
    expect(anchor.prefix).toBe("");
    expect(anchor.suffix).toBe("");
  });
});

describe("resolveAnchor", () => {
  const originalText = "The quick brown fox jumps over the lazy dog.";

  function makeAnchor(text: string, from: number, to: number): TextAnchor {
    return createAnchor(text, from, to);
  }

  describe("tier 1: exact position match", () => {
    it("resolves when text is at the same position", () => {
      const anchor = makeAnchor(originalText, 10, 19); // "brown fox"
      const result = resolveAnchor(originalText, anchor);
      expect(result.confidence).toBe("exact");
      expect(result.from).toBe(10);
      expect(result.to).toBe(19);
    });
  });

  describe("tier 2: text + context match", () => {
    it("resolves when text moved but context is intact", () => {
      const anchor = makeAnchor(originalText, 10, 19); // "brown fox"
      // Prefix "The quick " + "brown fox" + suffix "jumps over..." still present
      const modified = "NEW " + originalText; // shifted 4 positions right
      const result = resolveAnchor(modified, anchor);
      expect(result.confidence).toBe("exact");
      expect(result.from).toBe(14);
      expect(result.to).toBe(23);
    });
  });

  describe("tier 3: text + scoring fallback", () => {
    it("resolves with fuzzy confidence when context changed", () => {
      const anchor = makeAnchor(originalText, 10, 19); // "brown fox"
      // Same text appears but context is totally different
      const modified = "Totally different preamble brown fox and different ending";
      const result = resolveAnchor(modified, anchor);
      expect(result.confidence).toBe("fuzzy");
      expect(modified.slice(result.from, result.to)).toBe("brown fox");
    });

    it("picks the match with best context score when text appears multiple times", () => {
      // Construct an anchor manually to control exact positions and context
      const anchor: TextAnchor = {
        text: "hello world",
        prefix: "AAA ",
        suffix: " BBB",
        from: 100, // position that won't match in modified text (tier 1 miss)
        to: 111,
      };
      // Modified text has two occurrences. Neither has full prefix+text+suffix (tier 2 miss).
      // Second occurrence has better partial context match.
      const modified = "XYZ hello world QQQ ... AAX hello world BXB end";
      const result = resolveAnchor(modified, anchor);
      expect(result.confidence).toBe("fuzzy");
      expect(modified.slice(result.from, result.to)).toBe("hello world");
      // Second occurrence at position 28: prefix "AAX " partially matches "AAA "
      expect(result.from).toBe(28);
      expect(result.to).toBe(39);
    });
  });

  describe("tier 4: orphaned", () => {
    it("returns orphaned when text is not found at all", () => {
      const anchor = makeAnchor(originalText, 10, 19); // "brown fox"
      const modified = "Completely different text with no matching substring.";
      const result = resolveAnchor(modified, anchor);
      expect(result.confidence).toBe("orphaned");
      // Orphaned returns original positions
      expect(result.from).toBe(10);
      expect(result.to).toBe(19);
    });
  });
});
