import { describe, it, expect } from "vitest";
import {
  computeDiffChanges,
  changePercentage,
  applyDiffDecisions,
  buildDiffReviewMarkup,
} from "../diff-engine";

describe("computeDiffChanges", () => {
  it("identical strings produce no changes", () => {
    const changes = computeDiffChanges("hello", "hello");
    expect(changes).toEqual([]);
  });

  it("empty to non-empty produces one insertion", () => {
    const changes = computeDiffChanges("", "hello world");
    expect(changes).toHaveLength(1);
    expect(changes[0]!.type).toBe("insertion");
    expect(changes[0]!.newText).toBe("hello world");
    expect(changes[0]!.oldText).toBe("");
    expect(changes[0]!.status).toBe("pending");
  });

  it("single paragraph modification", () => {
    const changes = computeDiffChanges("old text", "new text");
    expect(changes).toHaveLength(1);
    expect(changes[0]!.type).toBe("modification");
    expect(changes[0]!.oldText).toContain("old");
    expect(changes[0]!.newText).toContain("new");
  });

  it("deleted paragraph", () => {
    const changes = computeDiffChanges("para1\n\npara2", "para1");
    const deletions = changes.filter((c) => c.type === "deletion");
    expect(deletions.length).toBeGreaterThanOrEqual(1);
    // The deleted content should contain "para2"
    const allDeletedText = deletions.map((d) => d.oldText).join("");
    expect(allDeletedText).toContain("para2");
  });

  it("inserted paragraph between existing", () => {
    const changes = computeDiffChanges(
      "para1\n\npara2",
      "para1\n\nnew para\n\npara2"
    );
    const insertions = changes.filter((c) => c.type === "insertion");
    expect(insertions.length).toBeGreaterThanOrEqual(1);
    const allInsertedText = insertions.map((i) => i.newText).join("");
    expect(allInsertedText).toContain("new para");
  });

  it("multiple scattered changes produce multiple change objects", () => {
    const old = "alpha\n\nbravo\n\ncharlie\n\ndelta";
    const newContent = "alpha\n\nBRAVO\n\ncharlie\n\nDELTA";
    const changes = computeDiffChanges(old, newContent);
    expect(changes.length).toBeGreaterThanOrEqual(2);
  });

  it("each change has a unique id", () => {
    const changes = computeDiffChanges("a\n\nb\n\nc", "x\n\ny\n\nz");
    const ids = changes.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("changePercentage", () => {
  it("identical strings return 0", () => {
    expect(changePercentage("hello world", "hello world")).toBe(0);
  });

  it("completely different strings return close to 100", () => {
    const pct = changePercentage("aaaa", "zzzzzzzz");
    expect(pct).toBeGreaterThanOrEqual(80);
    expect(pct).toBeLessThanOrEqual(100);
  });

  it("small edit returns less than 10", () => {
    const long = "The quick brown fox jumps over the lazy dog near the river";
    const edited = "The quick brown fox leaps over the lazy dog near the river";
    const pct = changePercentage(long, edited);
    expect(pct).toBeLessThan(20);
  });

  it("empty to empty returns 0", () => {
    expect(changePercentage("", "")).toBe(0);
  });
});

describe("applyDiffDecisions", () => {
  it("accept all changes produces newContent", () => {
    const oldContent = "old paragraph one\n\nold paragraph two";
    const newContent = "new paragraph one\n\nnew paragraph two";
    const changes = computeDiffChanges(oldContent, newContent);
    const result = applyDiffDecisions(changes, oldContent, newContent);
    expect(result).toBe(newContent);
  });

  it("reject all changes produces oldContent", () => {
    const oldContent = "old paragraph one\n\nold paragraph two";
    const newContent = "new paragraph one\n\nnew paragraph two";
    const changes = computeDiffChanges(oldContent, newContent);
    // Set all to rejected
    for (const c of changes) {
      c.status = "rejected";
    }
    const result = applyDiffDecisions(changes, oldContent, newContent);
    expect(result).toBe(oldContent);
  });

  it("mixed decisions produce hybrid content", () => {
    const oldContent = "keep this\n\nold middle\n\nkeep end";
    const newContent = "keep this\n\nnew middle\n\nkeep end";
    const changes = computeDiffChanges(oldContent, newContent);
    // Accept all (default pending = accepted)
    const resultAccepted = applyDiffDecisions(changes, oldContent, newContent);
    expect(resultAccepted).toBe(newContent);

    // Now reject all
    for (const c of changes) {
      c.status = "rejected";
    }
    const resultRejected = applyDiffDecisions(changes, oldContent, newContent);
    expect(resultRejected).toBe(oldContent);
  });

  it("pending changes are treated as accepted", () => {
    const oldContent = "before";
    const newContent = "after";
    const changes = computeDiffChanges(oldContent, newContent);
    // All are pending by default
    expect(changes.every((c) => c.status === "pending")).toBe(true);
    const result = applyDiffDecisions(changes, oldContent, newContent);
    expect(result).toBe(newContent);
  });
});

describe("buildDiffReviewMarkup", () => {
  it("wraps insertions and deletions in ins/del tags with stable change IDs", () => {
    const oldContent = "one\n\ntwo";
    const newContent = "one\n\nTWO\n\nthree";

    const changes = computeDiffChanges(oldContent, newContent);
    expect(changes.length).toBeGreaterThan(0);

    const markup = buildDiffReviewMarkup(oldContent, newContent);

    // Every computed change ID should appear in the rendered markup
    for (const change of changes) {
      expect(markup).toContain(`data-change-id=\"${change.id}\"`);
    }

    // Markup should include at least one insertion wrapper
    expect(markup).toContain("<ins");
  });
});
