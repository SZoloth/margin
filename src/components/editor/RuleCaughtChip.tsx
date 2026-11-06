interface RuleCaughtChipProps {
  /** Matches of the just-made rule that are outside the view. */
  count: number;
  direction: "above" | "below";
  /** Scroll to the nearest one. */
  onGo: () => void;
}

/**
 * Shown right after "Never write this" when the new rule also caught text
 * the reader can't see, so the rule visibly works beyond the phrase marked.
 */
export function RuleCaughtChip({ count, direction, onGo }: RuleCaughtChipProps) {
  return (
    <button type="button" className="rule-caught-chip" onClick={onGo}>
      <span className="rule-caught-chip-dot" aria-hidden="true" />
      <span>{`Caught ${count} more ${direction}`}</span>
    </button>
  );
}
