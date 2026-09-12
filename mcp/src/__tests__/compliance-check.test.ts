import { describe, it, expect } from "vitest";
import { parseKillWords, scanKillWords } from "../../scripts/compliance-check";

describe("kill word parsing and scanning", () => {
  it("loads kill words from the reference file", () => {
    const words = parseKillWords();
    expect(words.size).toBeGreaterThan(50);
  });

  it("strips parentheticals so 'delve (into)' matches 'delve'", () => {
    const words = new Map([["delve", "high"]]);
    const hits = scanKillWords("This delves into the data", words);
    expect(hits).toHaveLength(1);
  });

  it("matches inflections for single words", () => {
    const words = new Map([["leverage", "high"], ["synergy", "high"]]);
    expect(scanKillWords("we leverage synergies", words).length).toBe(2);
  });

  it("does not inflect multi-word phrases", () => {
    const words = new Map([["state-of-the-art", "high"]]);
    expect(scanKillWords("our state-of-the-art system", words)).toHaveLength(1);
    expect(scanKillWords("our state-of-the-arts system", words)).toHaveLength(0);
  });
});
