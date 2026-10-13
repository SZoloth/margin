import { describe, expect, it } from "vitest";
import { compareFacts, extractFacts } from "../facts.ts";

describe("extractFacts", () => {
  it("extracts numbers ignoring commas, trailing zeros and units", () => {
    const f = extractFacts("We shipped 3 features, up 40% to $1,200.50 in 2.0 seconds.");
    expect(f.numbers).toEqual(expect.arrayContaining(["3", "40%", "$1200.50", "2"]));
  });

  it("extracts dates, quarters and ISO dates without counting their digits as numbers", () => {
    const f = extractFacts("Due March 5, 2026 (2026-03-05), reviewed in Q2.");
    expect(f.dates).toEqual(expect.arrayContaining(["march 5, 2026", "2026-03-05", "q2"]));
    expect(f.numbers).toEqual([]);
  });

  it("extracts quotes and urls", () => {
    const f = extractFacts('She said "ship it on Friday" and linked https://example.com/a?b=1.');
    expect(f.quotes).toEqual(["ship it on friday"]);
    expect(f.urls).toEqual(["https://example.com/a?b=1"]);
  });

  it("skips sentence-initial capitals and contractions, keeps mid-sentence names", () => {
    const f = extractFacts("Yesterday I'm told that Priya met Stripe in Denver. Then we left.");
    expect(f.names.sort()).toEqual(["Denver", "Priya", "Stripe"]);
  });

  it("treats list items and quoted openings as sentence starts", () => {
    const f = extractFacts("- Budget approved\n1. Hiring paused\n\"Looks fine,\" said Dana.");
    expect(f.names).toEqual(["Dana"]);
  });
});

describe("compareFacts", () => {
  const draft = "On March 5, Priya told Stripe we grew 40% to 3 teams. See https://x.co/a.";

  it("passes a rewrite that keeps everything", () => {
    const r = compareFacts(draft, "Priya told Stripe on March 5 that we grew 40%, now at 3 teams (https://x.co/a).");
    expect(r.hardFail).toBe(false);
    expect(r.recall).toBe(1);
  });

  it("flags a dropped number as a hard fail", () => {
    const r = compareFacts(draft, "On March 5, Priya told Stripe we grew to 3 teams. See https://x.co/a.");
    expect(r.hardFail).toBe(true);
    expect(r.dropped).toContain("number:40%");
  });

  it("flags an invented number and name", () => {
    const r = compareFacts(draft, "On March 5, Priya told Stripe and Google we grew 40% to 3 teams, 12 hires. See https://x.co/a.");
    expect(r.added).toEqual(expect.arrayContaining(["number:12", "name:Google"]));
  });

  it("does not penalise a name that moved to a sentence start", () => {
    const r = compareFacts("We hired Dana in May 2026.", "Dana joined us in May 2026.");
    expect(r.hardFail).toBe(false);
  });

  it("is case and unit insensitive for numbers (2.4 s vs 2.4 sec)", () => {
    expect(compareFacts("Load went from 2.4 s to 1.1 s.", "Load dropped from 2.4 sec to 1.1 sec.").hardFail).toBe(false);
  });

  it("flags a dropped quote", () => {
    const r = compareFacts('He wrote "never again" twice.', "He was clear about it twice.");
    expect(r.dropped).toContain("quote:never again");
  });

  it("reports recall 1 when the draft has no extractable facts", () => {
    const r = compareFacts("it was fine", "it was ok");
    expect(r.recall).toBe(1);
    expect(r.hardFail).toBe(false);
  });
});
