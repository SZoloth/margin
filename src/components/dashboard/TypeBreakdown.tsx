import { useState, useEffect } from "react";
import { getTestRunDetail, type TestRunSummary, type TestRunTypeDetail } from "@/lib/tauri-commands";

export function TypeBreakdown({ run }: { run: TestRunSummary }) {
  const [types, setTypes] = useState<TestRunTypeDetail[]>([]);

  useEffect(() => {
    getTestRunDetail(run.id)
      .then((detail) => {
        // Sort by dimension score ascending (weakest first)
        const sorted = [...detail.types].sort(
          (a, b) => a.avgDimensionScore - b.avgDimensionScore,
        );
        setTypes(sorted);
      })
      .catch((err) => console.error("Failed to load type breakdown:", err));
  }, [run.id]);

  if (types.length === 0) return null;

  const weakest = types[0];

  return (
    <div>
      <h3 className="mb-4 text-[length:var(--text-sm)] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
        Per-type breakdown
      </h3>

      {weakest && (
        <p className="mb-4 text-[length:var(--text-sm)] text-[var(--color-text-secondary)]">
          Focus area: <strong>{weakest.writingType}</strong> has the most room to improve
        </p>
      )}

      <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)]">
        <table className="w-full text-[length:var(--text-sm)]">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-subtle)]">
              <th className="px-4 py-2.5 text-left font-medium text-[var(--color-text-secondary)]">Type</th>
              <th className="px-4 py-2.5 text-right font-medium text-[var(--color-text-secondary)]">Dim Score</th>
              <th className="px-4 py-2.5 text-right font-medium text-[var(--color-text-secondary)]">Mech Issues</th>
              <th className="px-4 py-2.5 text-right font-medium text-[var(--color-text-secondary)]">Delta</th>
              <th className="px-4 py-2.5 text-left font-medium text-[var(--color-text-secondary)]">Violations</th>
            </tr>
          </thead>
          <tbody>
            {types.map((t) => {
              const violations: string[] = t.systematicViolationsJson
                ? JSON.parse(t.systematicViolationsJson)
                : [];
              return (
                <tr key={t.id} className="border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-surface-subtle)]">
                  <td className="px-4 py-2.5 font-medium text-[var(--color-text-primary)]">
                    {t.writingType}
                  </td>
                  <td
                    className="px-4 py-2.5 text-right text-[var(--color-text-primary)]"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {t.avgDimensionScore.toFixed(1)}
                  </td>
                  <td
                    className="px-4 py-2.5 text-right text-[var(--color-text-primary)]"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {t.avgMechanicalIssues.toFixed(1)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {t.dimensionDelta != null ? (
                      <span
                        style={{
                          color: t.dimensionDelta > 0
                            ? "var(--color-green)"
                            : t.dimensionDelta < 0
                              ? "var(--color-red)"
                              : "var(--color-text-tertiary)",
                        }}
                      >
                        {t.dimensionDelta > 0 ? "+" : ""}
                        {t.dimensionDelta.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-[var(--color-text-tertiary)]">--</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-text-tertiary)]">
                    {violations.length > 0
                      ? violations.slice(0, 2).join(", ")
                      : "none"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
