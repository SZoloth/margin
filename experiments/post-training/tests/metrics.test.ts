import { describe, expect, it } from "vitest";
import { corpusMetrics, ngramL2Distance } from "../src/metrics.ts";

describe("deterministic evaluation metrics", () => {
  it("returns identical metrics for identical inputs", () => {
    const texts = [
      "Sam built Margin. Sam tested the writing system.",
      "Margin records editorial corrections and named rules.",
    ];
    const first = corpusMetrics(texts, ["Sam", "Margin", "258"]);
    const second = corpusMetrics(texts, ["Sam", "Margin", "258"]);

    expect(second).toEqual(first);
    expect(first.factualConstraints.missing).toEqual(["258"]);
    expect(first.factualConstraints.recall).toBeCloseTo(2 / 3);
  });

  it("reports zero n-gram distance for the same corpus", () => {
    const texts = ["One short sentence.", "Another short sentence."];
    expect(ngramL2Distance(texts, texts, 1)).toBe(0);
    expect(ngramL2Distance(texts, texts, 3)).toBe(0);
  });
});
