export interface Highlight {
  id: string;
  document_id: string;
  color: HighlightColor;
  text_content: string;
  from_pos: number;
  to_pos: number;
  prefix_context: string | null;
  suffix_context: string | null;
  created_at: number;
  updated_at: number;
}

export type HighlightColor = "yellow" | "green" | "blue" | "pink" | "orange";

export interface MarginNote {
  id: string;
  highlight_id: string;
  content: string;
  created_at: number;
  updated_at: number;
}

