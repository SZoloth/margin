import { describe, expect, it } from "vitest";
import fixture from "../fixtures/cases.json";
import { scanWithRawRegex, scoreCases } from "../src/compare.ts";

describe("raw-regex baseline", () => {
  it("matches executable rules with inline Python flags", () => {
    const body = fixture.cases[0];
    if (!body) throw new Error("missing fixture");

    expect(scanWithRawRegex(fixture.rules, body.input, body.writingType)).toEqual([
      expect.objectContaining({ ruleId: "hedging-pileup", start: 3 }),
    ]);
  });

  it("reproduces the guard's markup false positive", () => {
    const fenced = fixture.cases[1];
    if (!fenced) throw new Error("missing fixture");

    expect(scanWithRawRegex(fixture.rules, fenced.input, fenced.writingType)).toEqual([
      expect.objectContaining({ ruleId: "hedging-pileup" }),
    ]);
  });
});

describe("scoreCases", () => {
  it("scores rule ids per document", () => {
    const result = scoreCases(
      [{ name: "a", expectedRuleIds: ["r1"] }],
      new Map([["a", ["r1", "r2"]]]),
    );

    expect(result).toEqual({ truePositives: 1, falsePositives: 1, falseNegatives: 0 });
  });
});
