import { describe, expect, it } from "vitest";
import { buildEvaluationManifest } from "../src/manifest.ts";

describe("evaluation manifest", () => {
  it("hashes the full frozen experiment configuration deterministically", () => {
    const input = {
      schemaVersion: 1 as const,
      experimentId: "cover-letter-pilot",
      createdAt: "2026-07-16T00:00:00.000Z",
      datasetHash: "dataset-hash",
      splitHash: "split-hash",
      promptSetHash: "prompt-hash",
      rulesSnapshotHash: "rules-hash",
      modelRevision: "Qwen/Qwen3-4B-Instruct-2507@fixture",
      tokenizerRevision: "Qwen/Qwen3-4B-Instruct-2507@fixture",
      conditions: ["A", "B"],
      seeds: [17, 29],
      generation: {
        temperature: 0.7,
        topP: 0.8,
        topK: 20,
        maxNewTokens: 800,
      },
    };

    expect(buildEvaluationManifest(input)).toEqual(buildEvaluationManifest(input));
    expect(buildEvaluationManifest(input).manifestHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
