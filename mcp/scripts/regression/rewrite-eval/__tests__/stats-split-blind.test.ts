import { describe, expect, it } from "vitest";
import { binomLowerBound95, binomTailGE, binomTwoSidedP, pairedBootstrap } from "../stats.ts";
import { timeSplit } from "../split.ts";
import { makeBlindSheet, scoreBlindSheet } from "../blind.ts";

describe("stats", () => {
  it("binomial tail matches known values", () => {
    expect(binomTailGE(0, 10, 0.5)).toBe(1);
    expect(binomTailGE(10, 10, 0.5)).toBeCloseTo(1 / 1024, 8);
    expect(binomTailGE(7, 10, 0.5)).toBeCloseTo(176 / 1024, 6);
  });

  it("two-sided p is symmetric and exact", () => {
    expect(binomTwoSidedP(9, 10)).toBeCloseTo(22 / 1024, 6);
    expect(binomTwoSidedP(1, 10)).toBeCloseTo(22 / 1024, 6);
    expect(binomTwoSidedP(5, 10)).toBe(1);
  });

  it("one-sided 95% lower bound for 18/20 is near 0.71", () => {
    expect(binomLowerBound95(18, 20)).toBeGreaterThan(0.7);
    expect(binomLowerBound95(18, 20)).toBeLessThan(0.73);
    expect(binomLowerBound95(0, 20)).toBe(0);
  });

  it("paired bootstrap is deterministic and brackets the mean", () => {
    const d = [0.2, 0.1, 0.3, 0.0, 0.25, 0.15, 0.2, 0.1];
    const a = pairedBootstrap(d, 2000, 3);
    expect(pairedBootstrap(d, 2000, 3)).toEqual(a);
    expect(a.lo).toBeLessThanOrEqual(a.mean);
    expect(a.hi).toBeGreaterThanOrEqual(a.mean);
    expect(a.lo).toBeGreaterThan(0);
  });

  it("paired bootstrap on empty input is NaN, not a throw", () => {
    expect(pairedBootstrap([]).n).toBe(0);
  });
});

describe("timeSplit", () => {
  const docs = Array.from({ length: 10 }, (_, i) => ({ id: `d${i}`, type: "general", firstCorrectionAt: 1000 + i * 10 }));

  it("holds out the newest ~30% and sets the cutoff at the earliest held-out correction", () => {
    const s = timeSplit(docs, 0.3);
    expect(s.heldout).toEqual(["d7", "d8", "d9"]);
    expect(s.cutoff).toBe(1070);
    expect(s.train).toHaveLength(7);
  });

  it("keeps ties on the held-out side so the cutoff is strict", () => {
    const tied = [
      { id: "a", type: "g", firstCorrectionAt: 1 },
      { id: "b", type: "g", firstCorrectionAt: 2 },
      { id: "c", type: "g", firstCorrectionAt: 2 },
      { id: "d", type: "g", firstCorrectionAt: 3 },
    ];
    const s = timeSplit(tied, 0.5);
    expect(s.train).toEqual(["a"]);
    expect(s.heldout).toEqual(["b", "c", "d"]);
  });

  it("refuses when everything shares one timestamp", () => {
    expect(() => timeSplit([{ id: "a", type: "g", firstCorrectionAt: 1 }, { id: "b", type: "g", firstCorrectionAt: 1 }])).toThrow();
  });
});

describe("blind sheet", () => {
  const items = ["d1", "d2", "d3", "d4"].map((id) => ({
    draftId: id,
    draft: `draft ${id}`,
    outputs: { a3: `margin ${id}`, a2: `human ${id}` },
  }));

  it("hides arm names in the sheet and records them in the key", () => {
    const { sheet, key } = makeBlindSheet(items, "a3", "a2", 5);
    expect(sheet).not.toMatch(/\ba[23]\b/);
    for (const id of Object.keys(key)) expect(new Set([key[id].A, key[id].B])).toEqual(new Set(["a3", "a2"]));
  });

  it("scores filled picks through the key", () => {
    const { sheet, key } = makeBlindSheet(items, "a3", "a2", 5);
    // always pick whichever label is a3, except one tie
    let filled = sheet;
    let n = 0;
    for (const id of Object.keys(key)) {
      const pick = n++ === 0 ? "tie" : key[id].A === "a3" ? "A" : "B";
      filled = filled.replace(new RegExp(`(## Draft ${id}[\\s\\S]*?)Pick: \\?`), `$1Pick: ${pick}`);
    }
    const s = scoreBlindSheet(filled, key, "a3");
    expect(s.wins).toEqual({ a3: 3 });
    expect(s.ties).toBe(1);
    expect(s.decided).toBe(3);
    expect(s.firstArmShare).toBe(1);
    expect(s.unanswered).toEqual([]);
  });

  it("lists unanswered drafts instead of guessing", () => {
    const { sheet, key } = makeBlindSheet(items, "a3", "a2", 5);
    const s = scoreBlindSheet(sheet, key, "a3");
    expect(s.unanswered.sort()).toEqual(["d1", "d2", "d3", "d4"]);
    expect(s.decided).toBe(0);
  });

  it("refuses to build a sheet when no draft has both outputs", () => {
    expect(() => makeBlindSheet([{ draftId: "x", draft: "d", outputs: { a3: "m" } }], "a3", "a2")).toThrow();
  });
});
