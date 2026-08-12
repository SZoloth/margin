import { describe, expect, it } from "vitest";
import {
  assertPrivateOutputPath,
  buildPrivateReview,
  selectRealDocuments,
  summarizeRealValidation,
} from "../src/real-corpus.ts";

const rows = [
  {
    id: "corrected",
    filePath: "/docs/corrected.md",
    wordCount: 300,
    createdAt: 10,
    correctionCount: 2,
    writingType: "blog",
  },
  {
    id: "newer",
    filePath: "/docs/newer.md",
    wordCount: 200,
    createdAt: 20,
    correctionCount: 0,
    writingType: "general",
  },
  {
    id: "duplicate",
    filePath: "/docs/duplicate.md",
    wordCount: 200,
    createdAt: 15,
    correctionCount: 0,
    writingType: "general",
  },
  {
    id: "missing",
    filePath: "/docs/missing.md",
    wordCount: 200,
    createdAt: 40,
    correctionCount: 4,
    writingType: "general",
  },
];

describe("selectRealDocuments", () => {
  it("prioritizes corrected documents, deduplicates content, and records skips", () => {
    const files = new Map([
      ["/docs/corrected.md", "Human corrected copy."],
      ["/docs/newer.md", "Unlabeled current copy."],
      ["/docs/duplicate.md", "Unlabeled current copy."],
    ]);

    const result = selectRealDocuments(rows, {
      limit: 30,
      read: (path) => files.get(path),
    });

    expect(result.documents.map((document) => document.id)).toEqual(["corrected", "newer"]);
    expect(result.documents[0]).toMatchObject({
      correctionCount: 2,
      labelStatus: "correction-history-only",
    });
    expect(result.documents[0]?.contentSha256).toHaveLength(64);
    expect(result.skips).toEqual([
      { id: "missing", reason: "missing-file" },
      { id: "duplicate", reason: "duplicate-content" },
    ]);
  });
});

describe("private output boundary", () => {
  it("only accepts output under Margin's private experiment directory", () => {
    expect(
      assertPrivateOutputPath(
        "/Users/sam/.margin/experiments/vale-adapter/run",
        "/Users/sam",
      ),
    ).toBe("/Users/sam/.margin/experiments/vale-adapter/run");
    expect(() => assertPrivateOutputPath("/repo/results", "/Users/sam")).toThrow(
      "private output must stay under",
    );
  });
});

describe("real validation reporting", () => {
  const result = {
    documentId: "corrected",
    path: "/private/corrected.md",
    content: "Use `could potentially` in sample code. It could potentially work in prose.",
    raw: [{ ruleId: "hedge", start: 5, end: 22, match: "could potentially" }],
    vale: [
      {
        path: "/tmp/corrected.md",
        ruleId: "hedge",
        severity: "warning",
        message: "Avoid stacked hedges.",
        match: "could potentially",
        line: 1,
        span: [45, 61] as [number, number],
      },
    ],
    correctionCount: 2,
    labelStatus: "correction-history-only" as const,
  };

  it("keeps paths and text out of the aggregate report", () => {
    const report = summarizeRealValidation([result]);
    const serialized = JSON.stringify(report);

    expect(report).toMatchObject({
      documents: 1,
      documentsWithCorrectionHistory: 1,
      rawAlerts: 1,
      valeAlerts: 1,
      sharedAlerts: 1,
      adjudicationRequired: 1,
    });
    expect(serialized).not.toContain("/private");
    expect(serialized).not.toContain("could potentially");
  });

  it("asks for a human label even when both engines agree", () => {
    const review = buildPrivateReview([result]);

    expect(review).toEqual([
      expect.objectContaining({
        documentId: "corrected",
        documentPath: "/private/corrected.md",
        ruleId: "hedge",
        rawDetected: true,
        valeDetected: true,
        humanLabel: null,
      }),
    ]);
  });
});
