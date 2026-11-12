import { describe, it, expect } from "vitest";
import { shouldClearAnnotationsAfterExport } from "@/lib/export-clear-policy";

describe("shouldClearAnnotationsAfterExport", () => {
  it("does not clear when there are no highlights", () => {
    expect(
      shouldClearAnnotationsAfterExport({
        highlightCount: 0,
        attemptedCorrectionPersist: false,
        correctionsSaved: false,
      }),
    ).toBe(false);
  });

  it("clears when no correction persistence was attempted", () => {
    expect(
      shouldClearAnnotationsAfterExport({
        highlightCount: 3,
        attemptedCorrectionPersist: false,
        correctionsSaved: false,
      }),
    ).toBe(true);
  });

  it("does not clear when correction persistence was attempted but failed", () => {
    expect(
      shouldClearAnnotationsAfterExport({
        highlightCount: 2,
        attemptedCorrectionPersist: true,
        correctionsSaved: false,
      }),
    ).toBe(false);
  });

  it("clears when correction persistence succeeded", () => {
    expect(
      shouldClearAnnotationsAfterExport({
        highlightCount: 2,
        attemptedCorrectionPersist: true,
        correctionsSaved: true,
      }),
    ).toBe(true);
  });
});

