export interface ExportClearPolicyInput {
  highlightCount: number;
  attemptedCorrectionPersist: boolean;
  correctionsSaved: boolean;
}

/**
 * Clear exported annotations only when it is safe to do so.
 *
 * If we attempted to persist corrections and that write failed, keep annotations
 * in place so the user can retry export without losing feedback.
 */
export function shouldClearAnnotationsAfterExport(input: ExportClearPolicyInput): boolean {
  const hasHighlights = input.highlightCount > 0;
  if (!hasHighlights) return false;

  if (!input.attemptedCorrectionPersist) {
    return true;
  }

  return input.correctionsSaved;
}

