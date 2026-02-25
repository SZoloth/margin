export interface Highlight {
  id: string;
  document_id: string;
  color: string;
  text_content: string;
  from_pos: number;
  to_pos: number;
  prefix_context: string | null;
  suffix_context: string | null;
  created_at: number;
  updated_at: number;
}

export interface MarginNote {
  id: string;
  highlight_id: string;
  content: string;
  created_at: number;
  updated_at: number;
}

export interface CorrectionInput {
  highlight_id: string;
  original_text: string;
  prefix_context: string | null;
  suffix_context: string | null;
  extended_context: string | null;
  notes: string[];
  highlight_color: string;
  writing_type: string | null;
}

export interface CorrectionRecord {
  originalText: string;
  notes: string[];
  highlightColor: string;
  documentTitle: string | null;
  documentId: string;
  createdAt: number;
  writingType: string | null;
}

export interface CorrectionDetail {
  highlightId: string;
  originalText: string;
  notes: string[];
  extendedContext: string | null;
  highlightColor: string;
  writingType: string | null;
  documentTitle: string | null;
  createdAt: number;
}

export interface DocumentCorrections {
  documentId: string;
  documentTitle: string | null;
  documentPath: string | null;
  corrections: CorrectionDetail[];
}
