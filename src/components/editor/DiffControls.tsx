interface DiffControlsProps {
  changeId: string;
  top: number;
  right: number;
  onKeep: (id: string) => void;
  onRevert: (id: string) => void;
}

export function DiffControls({
  changeId,
  top,
  right,
  onKeep,
  onRevert,
}: DiffControlsProps) {
  return (
    <div className="diff-controls" style={{ top, right }}>
      <button
        type="button"
        className="diff-controls__btn diff-controls__btn--keep"
        onClick={() => onKeep(changeId)}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 6l2.5 2.5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Keep
      </button>
      <button
        type="button"
        className="diff-controls__btn diff-controls__btn--revert"
        onClick={() => onRevert(changeId)}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M9 3.5l-3 3-3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Revert
      </button>
    </div>
  );
}
