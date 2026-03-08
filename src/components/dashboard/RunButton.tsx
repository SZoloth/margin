import type { TestProgress } from "@/hooks/useDashboard";

export function RunButton({
  isRunning,
  onRun,
  progress,
}: {
  isRunning: boolean;
  onRun: () => void;
  progress?: TestProgress | null;
}) {
  const pct = progress ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={onRun}
        disabled={isRunning}
        className="cursor-pointer rounded-[var(--radius-md)] bg-[var(--color-accent)] px-6 py-2.5 text-[length:var(--text-sm)] font-medium text-white transition-colors duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isRunning ? (
          <span className="flex items-center gap-2" aria-live="polite">
            <Spinner />
            {progress
              ? `Testing ${progress.writingType}... (${progress.completed}/${progress.total})`
              : "Starting test..."}
          </span>
        ) : (
          "Run comparison test"
        )}
      </button>
      {isRunning && progress ? (
        <div className="flex w-full max-w-[240px] flex-col items-center gap-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-border)]">
            <div
              className="h-full rounded-full bg-[var(--color-accent)]"
              style={{
                width: `${pct}%`,
                transition: "width 0.3s ease-out",
              }}
            />
          </div>
          <span className="text-[length:var(--text-xs)] text-[var(--color-text-tertiary)]">
            {pct}%
          </span>
        </div>
      ) : !isRunning ? (
        <span className="text-[length:var(--text-xs)] text-[var(--color-text-tertiary)]">
          9 types &times; 3 samples &times; 2 modes
        </span>
      ) : null}
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin motion-reduce:animate-none"
      width={14}
      height={14}
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx={7} cy={7} r={6}
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray="28"
        strokeDashoffset="21"
      />
    </svg>
  );
}
