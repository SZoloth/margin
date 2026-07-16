import { describe, expect, it } from "vitest";
import {
  splitExamples,
  validateSplitManifest,
  type SplitManifest,
} from "../src/split.ts";
import type { CaptureExample } from "../src/types.ts";

function example(
  id: string,
  group: string,
  createdAt: string,
  text: string,
): CaptureExample {
  return {
    schema_version: 1,
    example_id: id,
    document_group_id: group,
    created_at: createdAt,
    writing_type: "cover-letter",
    register: "professional",
    prompt: `Prompt for ${id}`,
    source_material: [`Source for ${id}`],
    factual_constraints: [],
    lineage: {
      source_kind: "complete_document",
      source_polarity: "positive",
    },
    draft: {
      candidate_id: `candidate-${id}`,
      text: `Draft for ${id}`,
      model_id: "provider/model@revision",
      generation_config: {},
      rules_snapshot_hash: "rules-hash",
    },
    final: {
      text,
      author_provenance: "sam_edited_model_draft",
      finalized_at: createdAt,
    },
    training_eligible: true,
    content_hash: `hash-${id}`,
  };
}

describe("dataset splits", () => {
  it("rejects a document group crossing splits", () => {
    const manifest: SplitManifest = {
      train: [example("one", "shared", "2026-06-01T00:00:00Z", "First final")],
      validation: [
        example("two", "shared", "2026-06-02T00:00:00Z", "Second final"),
      ],
      test: [],
      testCutoff: "2026-07-01T00:00:00Z",
    };

    expect(validateSplitManifest(manifest)).toContain(
      "document group shared appears in train and validation",
    );
  });

  it("rejects exact and near-duplicate finals across splits", () => {
    const original = "Sam built a focused writing system from editorial corrections.";
    const nearDuplicate =
      "Sam built a focused writing system using editorial corrections.";
    const manifest: SplitManifest = {
      train: [example("one", "alpha", "2026-06-01T00:00:00Z", original)],
      validation: [],
      test: [example("two", "beta", "2026-07-02T00:00:00Z", nearDuplicate)],
      testCutoff: "2026-07-01T00:00:00Z",
    };

    expect(validateSplitManifest(manifest).join("\n")).toMatch(
      /near-duplicate finals cross train and test/,
    );
  });

  it("uses whole document groups and a chronological test cutoff", () => {
    const records = [
      example("one", "alpha", "2026-05-01T00:00:00Z", "Alpha text one"),
      example("two", "alpha", "2026-05-02T00:00:00Z", "Alpha text two"),
      example("three", "beta", "2026-06-01T00:00:00Z", "Beta text"),
      example("four", "future", "2026-07-02T00:00:00Z", "Future text"),
    ];

    const first = splitExamples(records, {
      testCutoff: "2026-07-01T00:00:00Z",
      validationFraction: 0.5,
      seed: "fixture-seed",
    });
    const second = splitExamples(records, {
      testCutoff: "2026-07-01T00:00:00Z",
      validationFraction: 0.5,
      seed: "fixture-seed",
    });

    expect(second).toEqual(first);
    expect(first.test.map((record) => record.document_group_id)).toEqual([
      "future",
    ]);
    expect(validateSplitManifest(first)).toEqual([]);
  });

  it("refuses to split a record that is not training-eligible", () => {
    const record = example(
      "corrective",
      "corrective-group",
      "2026-06-01T00:00:00Z",
      "Rejected text",
    );
    record.lineage = {
      source_kind: "correction_span",
      source_polarity: "corrective",
    };
    record.final.author_provenance = "imported_correction_span";
    record.training_eligible = false;

    expect(() =>
      splitExamples([record], {
        testCutoff: "2026-07-01T00:00:00Z",
        validationFraction: 0.2,
        seed: "fixture-seed",
      }),
    ).toThrow(/corrective spans are rejected text/);
  });
});
