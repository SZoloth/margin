import { describe, expect, it } from "vitest";
import { sanitizeSearchSnippet } from "@/lib/sanitize-snippet";

describe("sanitizeSearchSnippet", () => {
  it("preserves FTS mark tags while escaping document HTML", () => {
    expect(
      sanitizeSearchSnippet('<img src=x onerror="window.__pwned=true"><mark>match</mark>'),
    ).toBe(
      '&lt;img src=x onerror=&quot;window.__pwned=true&quot;&gt;<mark>match</mark>',
    );
  });

  it("does not restore mark-shaped attributes or malformed tags", () => {
    expect(
      sanitizeSearchSnippet('<mark onclick="window.__pwned=true">bad</mark><mark>good</marking>'),
    ).toBe(
      '&lt;mark onclick=&quot;window.__pwned=true&quot;&gt;bad</mark><mark>good&lt;/marking&gt;',
    );
  });
});
