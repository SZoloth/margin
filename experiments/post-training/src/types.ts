export type WritingSourceKind =
  | "complete_document"
  | "candidate_choice"
  | "correction_span";

export type SourcePolarity = "positive" | "corrective" | "unset";

export type AuthorProvenance =
  | "sam_authored"
  | "sam_edited_model_draft"
  | "sam_selected_candidate"
  | "imported_correction_span";

export interface CaptureExample {
  schema_version: 1;
  example_id: string;
  document_group_id: string;
  created_at: string;
  writing_type: string;
  register: string;
  prompt: string;
  source_material: string[];
  factual_constraints: string[];
  lineage: {
    source_kind: WritingSourceKind;
    source_polarity: SourcePolarity;
  };
  draft: {
    candidate_id: string;
    text: string;
    model_id: string;
    generation_config: Record<string, unknown>;
    rules_snapshot_hash: string;
  };
  final: {
    text: string;
    author_provenance: AuthorProvenance;
    finalized_at: string;
  };
  preference?: {
    chosen_candidate_id: string;
    rejected_candidate_ids: string[];
    rationale?: string;
    rule_ids: string[];
  };
  training_eligible: boolean;
  content_hash: string;
}
