export interface ExportResult {
  highlightCount: number;
  noteCount: number;
  snippets: string[];
  correctionsSaved: boolean;
  correctionsFile: string;
  sentToClaude?: boolean;
  positiveCount?: number;
  correctiveCount?: number;
  correctionCount?: number;
  promptCount?: number;
  noteOnlyCount?: number;
  /** Highlight IDs whose corrections were persisted — used to re-tag post-export. */
  correctionHighlightIds?: string[];
}
