import { createHash } from "node:crypto";
import { assertTrainingExportEligible } from "./contract.ts";
import type { CaptureExample } from "./types.ts";

export interface SplitManifest {
  train: CaptureExample[];
  validation: CaptureExample[];
  test: CaptureExample[];
  testCutoff: string;
}

export interface SplitOptions {
  testCutoff: string;
  validationFraction: number;
  seed: string;
}

type SplitName = "train" | "validation" | "test";

function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function levenshteinDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (left.length === 0) return right.length;
  if (right.length === 0) return left.length;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) + cost,
      );
    }
    previous = current;
  }
  return previous[right.length] ?? 0;
}

export function nearDuplicateSimilarity(left: string, right: string): number {
  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);
  const longest = Math.max(normalizedLeft.length, normalizedRight.length);
  if (longest === 0) return 1;
  return 1 - levenshteinDistance(normalizedLeft, normalizedRight) / longest;
}

function partitionScore(seed: string, groupId: string): number {
  const digest = createHash("sha256").update(`${seed}\0${groupId}`).digest();
  return digest.readUInt32BE(0) / 0x1_0000_0000;
}

function recordOrder(left: CaptureExample, right: CaptureExample): number {
  return (
    Date.parse(left.created_at) - Date.parse(right.created_at) ||
    left.example_id.localeCompare(right.example_id)
  );
}

export function splitExamples(
  records: CaptureExample[],
  options: SplitOptions,
): SplitManifest {
  if (!Number.isFinite(Date.parse(options.testCutoff))) {
    throw new Error("testCutoff must be a valid timestamp");
  }
  if (options.validationFraction < 0 || options.validationFraction > 1) {
    throw new Error("validationFraction must be between 0 and 1");
  }

  const eligibleRecords = assertTrainingExportEligible(records);
  const cutoff = Date.parse(options.testCutoff);
  const groups = new Map<string, CaptureExample[]>();
  for (const record of eligibleRecords) {
    const group = groups.get(record.document_group_id) ?? [];
    group.push(record);
    groups.set(record.document_group_id, group);
  }

  const manifest: SplitManifest = {
    train: [],
    validation: [],
    test: [],
    testCutoff: options.testCutoff,
  };

  for (const [groupId, groupRecords] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const containsLaterRecord = groupRecords.some(
      (record) => Date.parse(record.created_at) >= cutoff,
    );
    const destination = containsLaterRecord
      ? manifest.test
      : partitionScore(options.seed, groupId) < options.validationFraction
        ? manifest.validation
        : manifest.train;
    destination.push(...groupRecords.sort(recordOrder));
  }

  const errors = validateSplitManifest(manifest);
  if (errors.length > 0) throw new Error(errors.join("\n"));
  return manifest;
}

export function validateSplitManifest(manifest: SplitManifest): string[] {
  const errors: string[] = [];
  const cutoff = Date.parse(manifest.testCutoff);
  if (!Number.isFinite(cutoff)) return ["testCutoff must be a valid timestamp"];

  const splits: Array<[SplitName, CaptureExample[]]> = [
    ["train", manifest.train],
    ["validation", manifest.validation],
    ["test", manifest.test],
  ];
  const documentSplits = new Map<string, SplitName>();
  for (const [splitName, records] of splits) {
    for (const record of records) {
      const previous = documentSplits.get(record.document_group_id);
      if (previous && previous !== splitName) {
        errors.push(
          `document group ${record.document_group_id} appears in ${previous} and ${splitName}`,
        );
      } else {
        documentSplits.set(record.document_group_id, splitName);
      }
      if (splitName !== "test" && Date.parse(record.created_at) >= cutoff) {
        errors.push(`${record.example_id} is after the test cutoff but appears in ${splitName}`);
      }
    }
  }

  const testGroups = new Map<string, CaptureExample[]>();
  for (const record of manifest.test) {
    const group = testGroups.get(record.document_group_id) ?? [];
    group.push(record);
    testGroups.set(record.document_group_id, group);
  }
  for (const [groupId, records] of testGroups) {
    if (!records.some((record) => Date.parse(record.created_at) >= cutoff)) {
      errors.push(`test document group ${groupId} has no record on or after the cutoff`);
    }
  }

  for (let leftIndex = 0; leftIndex < splits.length; leftIndex += 1) {
    const left = splits[leftIndex];
    if (!left) continue;
    for (let rightIndex = leftIndex + 1; rightIndex < splits.length; rightIndex += 1) {
      const right = splits[rightIndex];
      if (!right) continue;
      for (const leftRecord of left[1]) {
        for (const rightRecord of right[1]) {
          const normalizedLeft = normalizeText(leftRecord.final.text);
          const normalizedRight = normalizeText(rightRecord.final.text);
          if (normalizedLeft === normalizedRight) {
            errors.push(`exact duplicate finals cross ${left[0]} and ${right[0]}`);
          } else if (nearDuplicateSimilarity(normalizedLeft, normalizedRight) >= 0.9) {
            errors.push(`near-duplicate finals cross ${left[0]} and ${right[0]}`);
          }
        }
      }
    }
  }

  return [...new Set(errors)];
}
