import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assertTrainingExportEligible,
  validateCaptureExample,
} from "../src/contract.ts";

function fixture(name: string): unknown {
  const url = new URL(`../fixtures/${name}`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), "utf8"));
}

describe("capture contract", () => {
  it("accepts a complete, provenance-safe final", () => {
    const result = validateCaptureExample(fixture("eligible-example.json"));

    expect(result.schemaValid).toBe(true);
    expect(result.trainingEligible).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("keeps a corrective span out of positive training exports", () => {
    const example = fixture("ineligible-corrective-span.json");
    const result = validateCaptureExample(example);

    expect(result.schemaValid).toBe(true);
    expect(result.trainingEligible).toBe(false);
    expect(result.eligibilityReasons).toContain(
      "corrective spans are rejected text, not positive finals",
    );
    expect(() => assertTrainingExportEligible([example])).toThrow(
      /corrective spans are rejected text/,
    );
  });

  it.each([
    ["prompt"],
    ["source_material"],
    ["draft.model_id"],
    ["final.author_provenance"],
  ])("marks a record missing %s as training-ineligible", (field) => {
    const example = structuredClone(
      fixture("eligible-example.json"),
    ) as Record<string, unknown>;

    if (field === "prompt") example.prompt = "";
    if (field === "source_material") example.source_material = [];
    if (field === "draft.model_id") {
      (example.draft as Record<string, unknown>).model_id = "";
    }
    if (field === "final.author_provenance") {
      (example.final as Record<string, unknown>).author_provenance = "";
    }

    const result = validateCaptureExample(example);
    expect(result.trainingEligible).toBe(false);
  });

  it("honors an explicit training-ineligible decision", () => {
    const example = structuredClone(
      fixture("eligible-example.json"),
    ) as Record<string, unknown>;
    example.training_eligible = false;

    const result = validateCaptureExample(example);
    expect(result.schemaValid).toBe(true);
    expect(result.trainingEligible).toBe(false);
    expect(result.eligibilityReasons).toContain(
      "record is explicitly marked training-ineligible",
    );
  });
});
