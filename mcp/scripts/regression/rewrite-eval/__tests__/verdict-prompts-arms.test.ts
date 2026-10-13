import { describe, expect, it } from "vitest";
import { decide, THRESHOLDS } from "../verdict.ts";
import { parseFactJudgement, parseSpanVerdicts, ruleEditPrompt, genericEditPrompt } from "../prompts.ts";
import { runArm, type Runners } from "../arms.ts";
import type { BlindScore } from "../blind.ts";

const iv = (mean: number, lo: number, hi: number, n = 30) => ({ mean, lo, hi, n });
const blind = (share: number, lower: number, decided = 20): BlindScore => ({
  wins: {},
  ties: 0,
  decided,
  firstArmShare: share,
  lowerBound95: lower,
  pTwoSided: 0.01,
  unanswered: [],
});
const base = {
  nDrafts: 32,
  nDocs: 12,
  v1: iv(0.15, 0.05, 0.25),
  v3: blind(0.75, 0.55),
  factsAdvantage: iv(0.1, 0.02, 0.18),
  rulesVsGeneric: iv(0.12, 0.03, 0.2),
  a3HardFail: 0.05,
};

describe("decide", () => {
  it("win needs voice AND strictly safer facts", () => {
    expect(decide(base).outcome).toBe("win");
  });

  it("non-inferior facts is only partial", () => {
    expect(decide({ ...base, factsAdvantage: iv(0, -0.05, 0.05) }).outcome).toBe("partial-voice-only");
  });

  it("facts-only partial when voice is not met", () => {
    expect(decide({ ...base, v3: blind(0.55, 0.4) }).outcome).toBe("partial-facts-only");
  });

  it("loss when Sam prefers the humanizer in half or more of decided picks", () => {
    expect(decide({ ...base, v3: blind(0.45, 0.25) }).outcome).toBe("loss");
  });

  it("loss when the humanizer recovers at least as many flagged spans", () => {
    expect(decide({ ...base, v1: iv(-0.02, -0.1, 0.06) }).outcome).toBe("loss");
  });

  it("claim is dead when rules do not beat the generic editor, whatever A2 does", () => {
    expect(decide({ ...base, rulesVsGeneric: iv(0.03, -0.05, 0.1) }).outcome).toBe("dead-g2");
  });

  it("inconclusive when intervals span the thresholds", () => {
    expect(decide({ ...base, v1: iv(0.08, -0.02, 0.18), factsAdvantage: iv(0.02, -0.05, 0.09) }).outcome).toBe("inconclusive");
  });

  it("marks anything under the draft bar as a pilot", () => {
    const v = decide({ ...base, nDrafts: THRESHOLDS.minDrafts - 1 });
    expect(v.pilot).toBe(true);
    expect(v.reasons[0]).toMatch(/pilot/);
  });

  it("is still a pilot when many units come from too few documents", () => {
    const v = decide({ ...base, nDrafts: 40, nDocs: 6 });
    expect(v.pilot).toBe(true);
    expect(v.reasons[0]).toMatch(/6 documents/);
  });

  it("cannot call voice without blind picks", () => {
    const v = decide({ ...base, v3: null });
    expect(v.outcome).toBe("partial-facts-only");
    expect(v.reasons.join(" ")).toMatch(/no blind picks/);
  });
});

describe("judge parsing", () => {
  it("parses verdicts wrapped in prose and code fences", () => {
    const out = 'Sure:\n```json\n[{"id":"a","verdict":"fixed","evidence":"x"},{"id":"b","verdict":"unchanged"}]\n```';
    expect(parseSpanVerdicts(out, ["a", "b"])).toEqual({ a: "fixed", b: "unchanged" });
  });

  it("throws when a span is missing or has an invalid verdict, never guesses", () => {
    expect(() => parseSpanVerdicts('[{"id":"a","verdict":"fixed"}]', ["a", "b"])).toThrow(/omitted/);
    expect(() => parseSpanVerdicts('[{"id":"a","verdict":"great"}]', ["a"])).toThrow();
  });

  it("parses fact judgement and tolerates missing keys", () => {
    expect(parseFactJudgement('{"dropped":["x"],"invented":["y"]}')).toEqual({ dropped: ["x"], altered: [], invented: ["y"] });
    expect(() => parseFactJudgement("no json here")).toThrow();
    // trailing prose, including braces and a self-correction, must not break parsing
    const noisy = '{"dropped":["a"],"altered":[],"invented":[]}\n\nWait, I mis-stated {that}. Corrected: {"dropped":[],"altered":["b {x}"],"invented":[]}\nDone.';
    expect(parseFactJudgement(noisy)).toEqual({ dropped: [], altered: ["b {x}"], invented: [] });
    expect(parseFactJudgement('{"dropped":["a"]} then some prose [1]')).toEqual({ dropped: ["a"], altered: [], invented: [] });
  });
});

describe("arms", () => {
  const calls: string[] = [];
  const runners: Runners = {
    editor: (p) => (calls.push(`editor:${p.slice(0, 20)}`), "EDITED"),
    humanizer: (d) => (calls.push(`humanizer:${d}`), "HUMANIZED"),
  };

  it("a0 returns the draft unchanged and calls nothing", () => {
    calls.length = 0;
    expect(runArm("a0", "draft", { rules: "r" }, runners)).toBe("draft");
    expect(calls).toEqual([]);
  });

  it("a1 prompt has no rules; a3 prompt carries them", () => {
    expect(genericEditPrompt("DRAFT")).not.toMatch(/WRITING RULES/);
    expect(ruleEditPrompt("DRAFT", "RULE-X")).toMatch(/RULE-X/);
  });

  it("a4 feeds the humanizer output, reusing an existing a2 sample, to the rule editor", () => {
    calls.length = 0;
    let seen = "";
    const r: Runners = { editor: (p) => ((seen = p), "OUT"), humanizer: () => "SHOULD-NOT-RUN" };
    expect(runArm("a4", "orig", { rules: "R" }, r, "A2-SAMPLE")).toBe("OUT");
    expect(seen).toMatch(/A2-SAMPLE/);
    expect(seen).not.toMatch(/SHOULD-NOT-RUN/);
  });

  it("a4 runs the humanizer itself when no a2 sample is supplied", () => {
    calls.length = 0;
    runArm("a4", "orig", { rules: "R" }, runners);
    expect(calls[0]).toBe("humanizer:orig");
  });
});
