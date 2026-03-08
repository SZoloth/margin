import type { TestRunSummary } from "@/lib/tauri-commands";

function formatShortDate(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function TrendChart({ runs }: { runs: TestRunSummary[] }) {
  // Oldest first for left-to-right
  const sorted = [...runs].reverse();
  if (sorted.length < 2) return null;

  const width = 600;
  const height = 200;
  const padding = 24;
  const bottomPadding = 40;
  const innerW = width - padding * 2;
  const innerH = height - padding - bottomPadding;

  const maxScore = 50;
  const xStep = innerW / (sorted.length - 1);

  const points = sorted.map((r, i) => ({
    x: padding + i * xStep,
    y: padding + innerH - (r.avgDimensionScore / maxScore) * innerH,
  }));

  const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");

  // Area fill: same points plus bottom corners
  const firstPt = points[0]!;
  const lastPt = points[points.length - 1]!;
  const areaPoints = [
    `${firstPt.x},${padding + innerH}`,
    ...points.map((p) => `${p.x},${p.y}`),
    `${lastPt.x},${padding + innerH}`,
  ].join(" ");

  const firstScore = sorted[0]!.avgDimensionScore.toFixed(0);
  const lastScore = sorted[sorted.length - 1]!.avgDimensionScore.toFixed(0);
  const trendLabel = `Score trend from ${firstScore} to ${lastScore} over ${sorted.length} runs`;

  return (
    <div>
      <h3 className="mb-4 text-[length:var(--text-sm)] font-semibold uppercase tracking-wide text-[var(--color-text-tertiary)]">
        Score trend
      </h3>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ maxHeight: 200 }}
        role="img"
        aria-label={trendLabel}
      >
        <title>{trendLabel}</title>
        {/* Grid lines */}
        {[0, 25, 50].map((v) => {
          const y = padding + innerH - (v / maxScore) * innerH;
          return (
            <g key={v}>
              <line
                x1={padding} y1={y} x2={width - padding} y2={y}
                stroke="var(--color-border)" strokeWidth={1}
              />
              <text
                x={padding - 4} y={y + 4}
                textAnchor="end"
                fill="var(--color-text-tertiary)"
                fontSize={10}
              >
                {v}
              </text>
            </g>
          );
        })}
        {/* Area fill */}
        <polygon
          points={areaPoints}
          fill="var(--color-accent)"
          opacity={0.1}
        />
        <polyline
          points={polyline}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={2}
        />
        {points.map((p, i) => (
          <g key={i}>
            <circle
              cx={p.x} cy={p.y} r={3}
              fill="var(--color-accent)"
            />
            {/* X-axis date labels */}
            <text
              x={p.x}
              y={padding + innerH + 16}
              textAnchor="middle"
              fill="var(--color-text-tertiary)"
              fontSize={9}
            >
              {formatShortDate(sorted[i]!.timestamp)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
