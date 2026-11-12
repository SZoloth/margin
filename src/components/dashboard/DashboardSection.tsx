import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useState, useCallback } from "react";
import { useDashboard } from "@/hooks/useDashboard";
import { DimensionBars } from "./DimensionBars";
import { TypeBreakdown } from "./TypeBreakdown";
import { TrendChart } from "./TrendChart";
import { RunButton } from "./RunButton";

export function DashboardSection() {
  const { summary, isRunning, isLoading, error, progress, clearError, runTest, exportMarkdown } = useDashboard();
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const handleExport = useCallback(async () => {
    const md = await exportMarkdown();
    if (md) {
      await writeText(md);
      setExportStatus("Copied to clipboard");
      setTimeout(() => setExportStatus(null), 3000);
    }
  }, [exportMarkdown]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24" role="status">
        <span className="text-[length:var(--text-sm)] text-[var(--color-text-tertiary)]">
          Loading dashboard...
        </span>
      </div>
    );
  }

  const latest = summary?.latestRun;
  const hasData = latest && latest.status === "completed";

  return (
    <div className="flex flex-col" style={{ minHeight: "calc(100dvh - 80px)" }}>
      {/* Score summary bar */}
      <div className="flex items-center gap-12 border-b border-[var(--color-border)] px-8 py-6">
        {hasData ? (
          <>
            <Stat
              value={`${latest.avgDimensionScore.toFixed(0)}/50`}
              label="Dimension score"
              delta={latest.avgDimensionDelta}
            />
            <Stat
              value={latest.avgMechanicalIssues.toFixed(1)}
              label="Avg mechanical"
              delta={latest.avgMechanicalDelta}
              invertDelta
            />
            <Stat value={summary!.ruleCount} label="Rules active" />
            <Stat
              value={formatRelativeTime(latest.timestamp)}
              label="Last tested"
            />
          </>
        ) : (
          <>
            <Stat value={summary?.ruleCount ?? 0} label="Rules active" />
            <Stat value="--" label="Not yet tested" />
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          {exportStatus && (
            <span
              className="text-[length:var(--text-xs)] text-[var(--color-text-secondary)] transition-opacity duration-200"
              role="status"
              aria-live="polite"
            >
              {exportStatus}
            </span>
          )}
          {hasData && (
            <button
              type="button"
              onClick={handleExport}
              className="shrink-0 cursor-pointer rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--hover-bg)] px-3 py-1.5 text-[length:var(--text-xs)] font-medium text-[var(--color-text-secondary)] transition-colors duration-150 hover:bg-[var(--color-surface-muted)]"
            >
              Export report
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-severity-must-fix-bg)] px-8 py-3">
          <span className="flex-1 text-[length:var(--text-sm)] text-[var(--color-severity-must-fix-text)]">
            {error}
          </span>
          <button
            type="button"
            onClick={clearError}
            className="cursor-pointer text-[length:var(--text-sm)] text-[var(--color-severity-must-fix-text)] underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 overflow-y-auto px-8 py-8 transition-opacity duration-200">
        {hasData ? (
          <div className="mx-auto flex max-w-[720px] flex-col gap-10">
            <DimensionBars run={latest} />
            <TypeBreakdown run={latest} />
            {(summary?.recentRuns.length ?? 0) >= 2 && (
              <TrendChart runs={summary!.recentRuns} />
            )}
            <div className="flex justify-center pt-4">
              <RunButton isRunning={isRunning} onRun={runTest} progress={progress} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="mb-2 text-[length:var(--text-base)] text-[var(--color-text-primary)]">
              No test results yet
            </p>
            <p className="mb-8 text-[length:var(--text-sm)] text-[var(--color-text-tertiary)]">
              Compare AI output with and without your writing rules.
            </p>
            <RunButton isRunning={isRunning} onRun={runTest} progress={progress} />
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({
  value,
  label,
  delta,
  invertDelta,
}: {
  value: number | string;
  label: string;
  delta?: number | null;
  invertDelta?: boolean;
}) {
  const isPositive = delta
    ? (invertDelta ? delta < 0 : delta > 0)
    : false;
  const deltaColor = delta
    ? isPositive
      ? "var(--color-green)"
      : "var(--color-red)"
    : undefined;
  const arrow = delta
    ? isPositive ? "\u2191" : "\u2193"
    : "";

  return (
    <div className="flex flex-col">
      <div className="flex items-baseline gap-2">
        <span
          className="font-serif text-4xl font-bold leading-none tracking-tight text-[var(--color-text-primary)]"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {value}
        </span>
        {delta != null && delta !== 0 && (
          <span
            className="text-[length:var(--text-sm)] font-medium"
            style={{ color: deltaColor }}
          >
            {arrow}
            {delta > 0 ? "+" : ""}
            {delta.toFixed(1)}
          </span>
        )}
      </div>
      <span className="mt-0.5 text-[length:12px] font-medium uppercase tracking-wide text-[var(--color-text-tertiary)]">
        {label}
      </span>
    </div>
  );
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
