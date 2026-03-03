import { useState, useCallback, useRef, useEffect } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { exportCorrectionsJson } from "@/lib/tauri-commands";
import { CorrectionsTab } from "@/components/style-memory/CorrectionsTab";
import { RulesTab } from "@/components/style-memory/RulesTab";

type ActiveTab = "corrections" | "rules";

export function StyleMemorySection() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("corrections");
  const [correctionStats, setCorrectionStats] = useState({
    total: 0,
    documentCount: 0,
    untaggedCount: 0,
  });
  const [ruleStats, setRuleStats] = useState({ ruleCount: 0 });
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const exportTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (exportTimeoutRef.current !== null) {
        window.clearTimeout(exportTimeoutRef.current);
      }
    };
  }, []);

  const correctionsTabId = "sm-tab-corrections";
  const rulesTabId = "sm-tab-rules";
  const correctionsPanelId = "sm-panel-corrections";
  const rulesPanelId = "sm-panel-rules";

  const handleCorrectionStatsChange = useCallback(
    (stats: { total: number; documentCount: number; untaggedCount: number }) => {
      setCorrectionStats(stats);
    },
    [],
  );

  const handleRuleStatsChange = useCallback((stats: { ruleCount: number }) => {
    setRuleStats(stats);
  }, []);

  const handleExportForSynthesis = useCallback(async () => {
    try {
      const count = await exportCorrectionsJson();
      if (count === 0) {
        setExportStatus("No corrections to export");
      } else {
        const prompt = `Analyze ${count} writing corrections from ~/.margin/corrections-export.json. Synthesize into actionable writing rules grouped by theme. For each rule: state the rule, when to apply, why it matters, signal count, and a before/after example grounded in actual corrections. Output to the writing_rules table via Margin's Tauri commands.`;
        await writeText(prompt);
        setExportStatus("Prompt copied — paste into your coding agent");
      }
      if (exportTimeoutRef.current !== null) {
        window.clearTimeout(exportTimeoutRef.current);
      }
      exportTimeoutRef.current = window.setTimeout(
        () => setExportStatus(null),
        6000,
      );
    } catch (err) {
      console.error("Failed to export corrections:", err);
      setExportStatus("Export failed");
    }
  }, []);

  return (
    <div className="flex flex-col" style={{ margin: "-48px -32px 0", minHeight: "calc(100vh - 80px)" }}>
      {/* Stats bar */}
      <div className="flex items-center gap-12 border-b border-[var(--color-border)] px-8 py-6">
        <Stat value={correctionStats.total} label="Corrections" />
        <Stat value={correctionStats.documentCount} label="Documents" />
        <Stat value={ruleStats.ruleCount} label="Rules" />
        {correctionStats.untaggedCount > 0 && (
          <Stat value={correctionStats.untaggedCount} label="Needs attention" accent />
        )}
        <div className="ml-auto flex items-center gap-2">
          {exportStatus && (
            <span
              role="status"
              aria-live="polite"
              className="max-w-[300px] truncate text-[length:11px] text-[var(--color-text-secondary)]"
            >
              {exportStatus}
            </span>
          )}
          {activeTab === "corrections" && correctionStats.total > 0 && (
            <button
              type="button"
              onClick={handleExportForSynthesis}
              className="shrink-0 cursor-pointer rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--hover-bg)] px-3 py-1.5 text-[length:var(--text-xs)] font-medium text-[var(--color-text-secondary)] transition-colors duration-150 hover:bg-[var(--color-surface-muted)]"
            >
              Export for synthesis
            </button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="Style Memory sections"
        className="flex gap-0 border-b border-[var(--color-border)] px-8"
      >
        <TabButton
          id={correctionsTabId}
          controlsId={correctionsPanelId}
          active={activeTab === "corrections"}
          onClick={() => setActiveTab("corrections")}
        >
          Corrections
        </TabButton>
        <TabButton
          id={rulesTabId}
          controlsId={rulesPanelId}
          active={activeTab === "rules"}
          onClick={() => setActiveTab("rules")}
        >
          Rules
        </TabButton>
      </div>

      {/* Tab content */}
      {activeTab === "corrections" ? (
        <div
          role="tabpanel"
          id={correctionsPanelId}
          aria-labelledby={correctionsTabId}
          className="flex flex-1 flex-col"
          style={{ minHeight: 0 }}
        >
          <CorrectionsTab onStatsChange={handleCorrectionStatsChange} />
        </div>
      ) : (
        <div
          role="tabpanel"
          id={rulesPanelId}
          aria-labelledby={rulesTabId}
          className="flex flex-1 flex-col"
          style={{ minHeight: 0 }}
        >
          <RulesTab onStatsChange={handleRuleStatsChange} />
        </div>
      )}
    </div>
  );
}

function Stat({
  value,
  label,
  accent,
}: {
  value: number | string;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span
        className="font-serif text-4xl font-bold leading-none tracking-tight"
        style={{
          color: accent ? "var(--color-accent)" : "var(--color-text-primary)",
        }}
      >
        {value}
      </span>
      <span className="mt-0.5 text-[length:12px] font-medium uppercase tracking-wide text-[var(--color-text-tertiary)]">
        {label}
      </span>
    </div>
  );
}

function TabButton({
  id,
  controlsId,
  active,
  onClick,
  children,
}: {
  id: string;
  controlsId: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-selected={active}
      aria-controls={controlsId}
      onClick={onClick}
      tabIndex={active ? 0 : -1}
      className="cursor-pointer border-b-2 border-l-0 border-r-0 border-t-0 bg-transparent px-4 py-3 text-[length:var(--text-sm)] transition-colors duration-150"
      style={{
        fontWeight: active ? 500 : 400,
        color: active
          ? "var(--color-text-primary)"
          : "var(--color-text-secondary)",
        borderBottomColor: active
          ? "var(--color-accent)"
          : "transparent",
      }}
    >
      {children}
    </button>
  );
}
