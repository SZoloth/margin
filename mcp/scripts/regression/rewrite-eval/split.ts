/**
 * Time split for leakage control.
 *
 * Rule rows carry no per-document provenance, so a document split alone cannot
 * guarantee that the rules A3 sees were not built from held-out corrections.
 * Instead: held-out documents are the ones whose FIRST correction is newest, and
 * A3 may only use rules whose updated_at is strictly before the earliest
 * held-out correction. A rule merged with later signal (updated_at moves
 * forward) is dropped, which errs on the side of fewer rules for Margin.
 */

export interface SplitDoc {
  id: string;
  type: string;
  firstCorrectionAt: number;
}

export interface TimeSplit {
  cutoff: number;
  train: string[];
  heldout: string[];
}

export function timeSplit(docs: SplitDoc[], heldoutFraction = 0.3): TimeSplit {
  if (docs.length < 2) throw new Error("need at least 2 documents to split");
  const sorted = [...docs].sort(
    (a, b) => a.firstCorrectionAt - b.firstCorrectionAt || a.id.localeCompare(b.id),
  );
  const nHeld = Math.min(sorted.length - 1, Math.max(1, Math.round(sorted.length * heldoutFraction)));
  let cut = sorted.length - nHeld;
  // ties at the boundary must land on the held-out side so cutoff is strict
  while (cut > 0 && sorted[cut - 1].firstCorrectionAt === sorted[cut].firstCorrectionAt) cut--;
  if (cut === 0) throw new Error("all documents share one timestamp; cannot time-split");
  const cutoff = sorted[cut].firstCorrectionAt;
  return {
    cutoff,
    train: sorted.slice(0, cut).map((d) => d.id),
    heldout: sorted.slice(cut).map((d) => d.id),
  };
}
