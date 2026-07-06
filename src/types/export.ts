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
}
