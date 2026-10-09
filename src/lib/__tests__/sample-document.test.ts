import { describe, it, expect } from "vitest";
import { isShowingSample, SAMPLE_DOCUMENT_CONTENT } from "../sample-document";

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
