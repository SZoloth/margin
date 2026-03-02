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
        Keep
      </button>
      <button
        type="button"
        className="diff-controls__btn diff-controls__btn--revert"
        onClick={() => onRevert(changeId)}
      >
        Revert
      </button>
    </div>
  );
}
