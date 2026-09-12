import { describe, it, expect } from "vitest";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { createAnchor, resolveAnchor, buildDocTextMap, docPosToFlat, flatToDocPos } from "../text-anchoring";
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

const schema = getSchema([StarterKit]);

type JsonDoc = Parameters<typeof schema.nodeFromJSON>[0];
function docFrom(content: JsonDoc[]) {
  return schema.nodeFromJSON({ type: "doc", content });
}
const para = (text: string): JsonDoc => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});

describe("buildDocTextMap", () => {
  it("produces the same flat text as textBetween with a newline separator", () => {
    const doc = docFrom([para("first paragraph"), para("second paragraph"), para("third")]);
    const map = buildDocTextMap(doc);
    const expected = doc.textBetween(0, doc.content.size, "\n");
    expect(map.flat).toBe(expected);
    expect(map.flat).toBe("first paragraph\nsecond paragraph\nthird");
  });

  it("handles nested blockquotes and lists like textBetween", () => {
    const doc = docFrom([
      para("intro"),
      {
        type: "blockquote",
        content: [para("quoted a"), para("quoted b")],
      },
      { type: "bulletList", content: [{ type: "listItem", content: [para("item one")] }] },
    ]);
    const map = buildDocTextMap(doc);
    expect(map.flat).toBe(doc.textBetween(0, doc.content.size, "\n"));
    expect(map.flat).toBe("intro\nquoted a\nquoted b\nitem one");
  });
});

describe("flat ↔ doc position mapping", () => {
  it("round-trips every text-node boundary", () => {
    const doc = docFrom([para("abc"), para("def")]);
    const map = buildDocTextMap(doc);
    // p1 text at pos 1-4, p2 text at pos 6-9
    for (const seg of map.segments) {
      for (const p of [seg.pos, seg.pos + seg.length]) {
        const flat = docPosToFlat(map, p);
        expect(flatToDocPos(map, flat, "prev")).toBe(p);
      }
    }
  });

  it("maps a multi-paragraph search hit back to doc positions", () => {
    const doc = docFrom([para("abc"), para("def")]);
    const map = buildDocTextMap(doc);
    const idx = map.flat.indexOf("c\nd"); // crosses the paragraph separator
    const from = flatToDocPos(map, idx, "next");
    const to = flatToDocPos(map, idx + 3, "prev");
    expect(doc.textBetween(from, to, "\n")).toBe("c\nd");
  });

  it("docPosToFlat maps block-boundary positions to the next segment", () => {
    const doc = docFrom([para("abc"), para("def")]);
    const map = buildDocTextMap(doc);
    // pos 4 = end of p1's text, pos 5 = p1 close/p2 boundary, pos 6 = p2 text start
    expect(docPosToFlat(map, 4)).toBe(3);
    expect(docPosToFlat(map, 5)).toBe(4); // gap → next segment start ("d")
    expect(docPosToFlat(map, 6)).toBe(4);
  });
});

describe("multi-paragraph anchors (SAM-1142)", () => {
  it("anchor created in flat space survives re-resolution across paragraph breaks", () => {
    const doc = docFrom([para("alpha middle"), para("omega tail")]);
    const map = buildDocTextMap(doc);
    // Highlight spanning the paragraph boundary: "middle\nomega"
    const from = docPosToFlat(map, 7); // "middle" starts at pos 7
    const to = docPosToFlat(map, 20); // end of "omega" in p2's text (pos 15-25)
    const anchor = createAnchor(map.flat, from, to);
    expect(anchor.text).toBe("middle\nomega");
    expect(anchor.prefix.endsWith("alpha ")).toBe(true);
    expect(anchor.suffix.startsWith(" tail")).toBe(true);

    // Resolve the stored text on a doc where the first paragraph grew
    const edited = docFrom([para("alpha and more middle"), para("omega tail")]);
    const editedMap = buildDocTextMap(edited);
    const result = resolveAnchor(editedMap.flat, anchor);
    expect(result.confidence).not.toBe("orphaned");
    expect(editedMap.flat.slice(result.from, result.to)).toBe("middle\nomega");
    // …and maps back to real doc positions covering both paragraphs
    const docFrom2 = flatToDocPos(editedMap, result.from, "next");
    const docTo = flatToDocPos(editedMap, result.to, "prev");
    expect(edited.textBetween(docFrom2, docTo, "\n")).toBe("middle\nomega");
  });
});
