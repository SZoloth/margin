import type { TestRunSummary } from "@/lib/tauri-commands";

const DIMENSIONS = ["directness", "rhythm", "trust", "authenticity", "density"] as const;

function barColor(score: number): string {
  if (score >= 7) return "var(--color-green)";
  if (score >= 5) return "var(--color-amber)";
  return "var(--color-red)";
}

export function DimensionBars({ run }: { run: TestRunSummary }) {
  let averages: Record<string, number> = {};
  let deltas: Record<string, number> | null = null;
  try {
    if (run.dimensionAveragesJson) averages = JSON.parse(run.dimensionAveragesJson);
    if (run.dimensionDeltasJson) deltas = JSON.parse(run.dimensionDeltasJson);
  } catch {
    console.error("Failed to parse dimension JSON");
  }

  return (
    <div>
      <h3 className="mb-4 text-[length:var(--text-sm)] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
        Dimension scores
      </h3>
      <div className="flex flex-col gap-3">
        {DIMENSIONS.map((dim, index) => {
          const score = averages[dim] ?? 0;
          const delta = deltas?.[dim] ?? null;
          const uncoachedScore = delta != null ? score - delta : null;
          return (
            <div key={dim} className="flex items-center gap-3">
              <span className="w-24 text-[length:var(--text-sm)] capitalize text-[var(--color-text-secondary)]">
                {dim}
              </span>
              <div
                className="relative h-5 flex-1 overflow-hidden rounded-[var(--radius-sm)] bg-[var(--color-surface-subtle)]"
                role="progressbar"
                aria-valuenow={score}
                aria-valuemin={0}
                aria-valuemax={10}
                aria-label={dim}
              >
                {uncoachedScore != null && (
                  <div
                    className="absolute inset-y-0 left-0 rounded-[var(--radius-sm)] border border-dashed opacity-30"
                    style={{
                      width: `${(uncoachedScore / 10) * 100}%`,
                      borderColor: "var(--color-text-tertiary)",
                    }}
                  />
                )}
                <div
                  className="absolute inset-y-0 left-0 rounded-[var(--radius-sm)] transition-[width] duration-300"
                  style={{
                    width: `${(score / 10) * 100}%`,
                    backgroundColor: barColor(score),
                    animation: `barFill 400ms ease-out`,
                    animationDelay: `${index * 60}ms`,
                    animationFillMode: "backwards",
                  }}
                />
              </div>
              <span
                className="w-10 text-right text-[length:var(--text-sm)] font-medium text-[var(--color-text-primary)]"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {score.toFixed(1)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
