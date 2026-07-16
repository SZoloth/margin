import type {
  AuthorProvenance,
  CaptureExample,
  SourcePolarity,
  WritingSourceKind,
} from "./types.ts";

export interface CaptureValidationResult {
  schemaValid: boolean;
  trainingEligible: boolean;
  errors: string[];
  eligibilityReasons: string[];
}

const SOURCE_KINDS = new Set<WritingSourceKind>([
  "complete_document",
  "candidate_choice",
  "correction_span",
]);
const SOURCE_POLARITIES = new Set<SourcePolarity>([
  "positive",
  "corrective",
  "unset",
]);
const AUTHOR_PROVENANCE = new Set<AuthorProvenance>([
  "sam_authored",
  "sam_edited_model_draft",
  "sam_selected_candidate",
  "imported_correction_span",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validTimestamp(value: unknown): value is string {
  return nonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function stringArray(value: unknown, requireValue = false): value is string[] {
  return (
    Array.isArray(value) &&
    (!requireValue || value.length > 0) &&
    value.every(nonEmptyString)
  );
}

export function validateCaptureExample(value: unknown): CaptureValidationResult {
  const errors: string[] = [];
  const eligibilityReasons: string[] = [];

  if (!isRecord(value)) {
    return {
      schemaValid: false,
      trainingEligible: false,
      errors: ["record must be an object"],
      eligibilityReasons: ["record failed schema validation"],
    };
  }

  if (value.schema_version !== 1) errors.push("schema_version must equal 1");
  for (const key of [
    "example_id",
    "document_group_id",
    "writing_type",
    "register",
    "prompt",
    "content_hash",
  ]) {
    if (!nonEmptyString(value[key])) errors.push(`${key} must be a non-empty string`);
  }
  if (!validTimestamp(value.created_at)) errors.push("created_at must be an ISO timestamp");
  if (!stringArray(value.source_material, true)) {
    errors.push("source_material must contain at least one non-empty item");
  }
  if (!stringArray(value.factual_constraints)) {
    errors.push("factual_constraints must be an array of non-empty strings");
  }

  const lineage = value.lineage;
  if (!isRecord(lineage)) {
    errors.push("lineage must be an object");
  } else {
    if (!SOURCE_KINDS.has(lineage.source_kind as WritingSourceKind)) {
      errors.push("lineage.source_kind is invalid");
    }
    if (!SOURCE_POLARITIES.has(lineage.source_polarity as SourcePolarity)) {
      errors.push("lineage.source_polarity is invalid");
    }
  }

  const draft = value.draft;
  if (!isRecord(draft)) {
    errors.push("draft must be an object");
  } else {
    for (const key of ["candidate_id", "text", "model_id", "rules_snapshot_hash"]) {
      if (!nonEmptyString(draft[key])) errors.push(`draft.${key} must be a non-empty string`);
    }
    if (!isRecord(draft.generation_config)) {
      errors.push("draft.generation_config must be an object");
    }
  }

  const final = value.final;
  if (!isRecord(final)) {
    errors.push("final must be an object");
  } else {
    if (!nonEmptyString(final.text)) errors.push("final.text must be a non-empty string");
    if (!AUTHOR_PROVENANCE.has(final.author_provenance as AuthorProvenance)) {
      errors.push("final.author_provenance is invalid");
    }
    if (!validTimestamp(final.finalized_at)) {
      errors.push("final.finalized_at must be an ISO timestamp");
    }
  }

  if (typeof value.training_eligible !== "boolean") {
    errors.push("training_eligible must be a boolean");
  } else if (value.training_eligible === false) {
    eligibilityReasons.push("record is explicitly marked training-ineligible");
  }

  if (errors.length > 0) eligibilityReasons.push("record failed schema validation");
  if (
    isRecord(lineage) &&
    lineage.source_kind === "correction_span" &&
    lineage.source_polarity === "corrective"
  ) {
    eligibilityReasons.push("corrective spans are rejected text, not positive finals");
  }
  if (
    isRecord(final) &&
    final.author_provenance === "imported_correction_span"
  ) {
    eligibilityReasons.push("imported correction spans cannot become complete finals");
  }

  const trainingEligible = errors.length === 0 && eligibilityReasons.length === 0;
  if (value.training_eligible === true && !trainingEligible) {
    errors.push("training_eligible cannot override computed eligibility");
  }

  return {
    schemaValid: errors.filter((error) => !error.startsWith("training_eligible cannot")).length === 0,
    trainingEligible,
    errors,
    eligibilityReasons,
  };
}

export function assertTrainingExportEligible(values: unknown[]): CaptureExample[] {
  const eligible: CaptureExample[] = [];
  const failures: string[] = [];

  values.forEach((value, index) => {
    const result = validateCaptureExample(value);
    if (!result.trainingEligible) {
      failures.push(
        `record ${index}: ${[...result.errors, ...result.eligibilityReasons].join("; ")}`,
      );
      return;
    }
    eligible.push(value as CaptureExample);
  });

  if (failures.length > 0) throw new Error(failures.join("\n"));
  return eligible;
}
