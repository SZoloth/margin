import { createHash } from "node:crypto";

export interface EvaluationManifestInput {
  schemaVersion: 1;
  experimentId: string;
  createdAt: string;
  datasetHash: string;
  splitHash: string;
  promptSetHash: string;
  rulesSnapshotHash: string;
  modelRevision: string;
  tokenizerRevision: string;
  conditions: string[];
  seeds: number[];
  generation: {
    temperature: number;
    topP: number;
    topK: number;
    maxNewTokens: number;
  };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function stableHash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function buildEvaluationManifest(input: EvaluationManifestInput) {
  const requiredStrings = [
    input.experimentId,
    input.createdAt,
    input.datasetHash,
    input.splitHash,
    input.promptSetHash,
    input.rulesSnapshotHash,
    input.modelRevision,
    input.tokenizerRevision,
  ];
  if (requiredStrings.some((value) => value.trim().length === 0)) {
    throw new Error("evaluation manifest contains an empty required value");
  }
  if (input.conditions.length === 0 || input.seeds.length === 0) {
    throw new Error("evaluation manifest requires conditions and seeds");
  }

  return {
    ...input,
    manifestHash: stableHash(input),
  };
}
