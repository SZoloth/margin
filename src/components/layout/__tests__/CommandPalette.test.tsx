import { describe, it, expect } from "vitest";
import { renderSnippet } from "../CommandPalette";

describe("renderSnippet", () => {
  it("keeps FTS <mark> tags as real elements", () => {
    expect(renderSnippet("the <mark>quick</mark> fox")).toBe(
      "the <mark>quick</mark> fox",
    );
  });

  it("escapes hostile markup from document text", () => {
    const hostile = '<img src=x onerror="alert(1)"> and <script>alert(2)</script>';
    const out = renderSnippet(hostile);
    expect(out).not.toContain("<img");
    expect(out).not.toContain("<script");
    expect(out).toContain("&lt;img");
    expect(out).toContain("&lt;script&gt;");
  });

  it("escapes quotes inside attributes of document text", () => {
    const out = renderSnippet('<b class="x">bold</b>');
    expect(out).not.toContain('class="x"');
    expect(out).toContain("&lt;b");
  });

  it("a literal <mark> in source text round-trips to a benign mark tag", () => {
    // Even if the document contains a literal <mark>, the worst case is a
    // highlight span — never script execution.
    const out = renderSnippet("see <mark>this</mark> tag");
    expect(out).toBe("see <mark>this</mark> tag");
  });

  it("handles mixed hostile text with FTS marks", () => {
    const out = renderSnippet('<svg onload=x>text <mark>match</mark> <iframe src=y>');
    expect(out).not.toContain("<svg");
    expect(out).not.toContain("<iframe");
    expect(out).toContain("<mark>match</mark>");
  });
});
