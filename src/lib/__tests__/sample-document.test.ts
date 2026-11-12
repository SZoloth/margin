import { describe, it, expect } from "vitest";
import {
  canNeverWrite,
  isSampleFilePath,
  isShowingSample,
  SAMPLE_DOCUMENT_CONTENT,
  SAMPLE_PLANTED_TELLS,
} from "../sample-document";

describe("isShowingSample", () => {
  it("stays true after onboarding finishes while the sample is still on screen", () => {
    // Regression: tying this to the onboarding step made the empty state draw
    // over the sample as soon as the first highlight completed onboarding.
    expect(isShowingSample(null, SAMPLE_DOCUMENT_CONTENT)).toBe(true);
  });

  it("is false once a real document is open", () => {
    expect(isShowingSample({ id: "doc-1" }, "# Notes")).toBe(false);
  });

  it("is false when nothing is loaded", () => {
    expect(isShowingSample(null, "")).toBe(false);
  });
});

describe("first-run sample", () => {
  it("plants every tell in both drafts, so a ban in one is caught in the other", () => {
    const [first, second] = SAMPLE_DOCUMENT_CONTENT.toLowerCase().split("## another ai draft");
    expect(second).toBeDefined();
    for (const tell of SAMPLE_PLANTED_TELLS) {
      expect(first, tell).toContain(tell.toLowerCase());
      expect(second, tell).toContain(tell.toLowerCase());
    }
  });

  it("says plainly that an AI wrote it", () => {
    expect(SAMPLE_DOCUMENT_CONTENT).toMatch(/An AI wrote/);
  });

  it("recognises the sample file on macOS and Windows paths", () => {
    expect(isSampleFilePath("/Users/a/.margin/samples/first-draft.md")).toBe(true);
    expect(isSampleFilePath("C:\\Users\\a\\.margin\\samples\\first-draft.md")).toBe(true);
    expect(isSampleFilePath("/Users/a/notes/first-draft.md")).toBe(false);
    expect(isSampleFilePath(null)).toBe(false);
  });

  it("only offers Never write this for a word or short phrase", () => {
    for (const tell of SAMPLE_PLANTED_TELLS) expect(canNeverWrite(tell)).toBe(true);
    expect(canNeverWrite("   ")).toBe(false);
    expect(canNeverWrite("word ".repeat(20))).toBe(false);
  });
});
