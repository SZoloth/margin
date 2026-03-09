import { useState, useCallback, useRef, useEffect } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { exportCorrectionsJson, seedRulesFromGuide, openStyleGuideDialog } from "@/lib/tauri-commands";
import type { SeedRulesResult } from "@/lib/tauri-commands";
import { CorrectionsTab } from "@/components/style-memory/CorrectionsTab";
import { RulesTab } from "@/components/style-memory/RulesTab";
import { WRITING_TYPES } from "@/lib/writing-types";
import { SettingsButton } from "./SettingsButton";

type ActiveTab = "corrections" | "rules";
type StatFilter = "all-corrections" | "all-rules" | "to-process" | "to-review" | "needs-attention" | null;

function SeedGuideSection({ onSeeded }: { onSeeded: () => void }) {
  const [mode, setMode] = useState<"closed" | "paste">("closed");
  const [pasteText, setPasteText] = useState("");
  const [writingType, setWritingType] = useState("general");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SeedRulesResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSeed = useCallback(async (text: string, name?: string) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await seedRulesFromGuide(text, writingType, name);
      setResult(r);
      setMode("closed");
      setPasteText("");
      onSeeded();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [writingType, onSeeded]);

  const handleUpload = useCallback(async () => {
    try {
      const content = await openStyleGuideDialog();
      if (content) {
        await handleSeed(content, "Uploaded file");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [handleSeed]);

  if (loading) {
    return (
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-8 py-4">
        <div
          className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--color-text-tertiary)] border-t-[var(--color-accent)]"
        />
        <span className="text-[length:var(--text-sm)] text-[var(--color-text-secondary)]">
          Extracting rules...
        </span>
      </div>
    );
  }

  return (
    <div className="border-b border-[var(--color-border)] px-8 py-4">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <span className="text-[length:var(--text-sm)] font-medium text-[var(--color-text-primary)]">
            Seed from style guide
          </span>
          {result && (
            <span className="ml-3 text-[length:var(--text-xs)] text-[var(--color-accent)]">
              Extracted {result.created} rule{result.created !== 1 ? "s" : ""}
              {result.deduplicated > 0 && ` (${result.deduplicated} deduplicated)`}
              {" "}&mdash; review below
            </span>
          )}
          {error && (
            <span className="ml-3 text-[length:var(--text-xs)] text-[var(--color-danger,#e53e3e)]">
              {error}
            </span>
          )}
        </div>
        <select
          value={writingType}
          onChange={(e) => setWritingType(e.target.value)}
          className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-2 py-1 text-[length:var(--text-xs)] text-[var(--color-text-primary)]"
        >
          {WRITING_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <SettingsButton onClick={handleUpload} disabled={loading}>
          Upload guide
        </SettingsButton>
        <SettingsButton
          onClick={() => setMode(mode === "paste" ? "closed" : "paste")}
          disabled={loading}
        >
          {mode === "paste" ? "Cancel" : "Paste instead"}
        </SettingsButton>
      </div>

      {mode === "paste" && (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste your style guide content here..."
            rows={6}
            className="w-full resize-y rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-3 text-[length:var(--text-sm)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-accent)] focus:outline-none"
          />
          <div className="flex justify-end">
            <SettingsButton
              onClick={() => handleSeed(pasteText, "Pasted content")}
              disabled={!pasteText.trim()}
            >
              Extract rules
            </SettingsButton>
          </div>
        </div>
      )}
    </div>
  );
}

export function StyleMemorySection() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("corrections");
  const [statFilter, setStatFilter] = useState<StatFilter>(null);
  const [correctionStats, setCorrectionStats] = useState({
    total: 0,
    documentCount: 0,
    untaggedCount: 0,
    unsynthesizedCount: 0,
  });
  const [ruleStats, setRuleStats] = useState({ ruleCount: 0, unreviewedCount: 0 });
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
    (stats: { total: number; documentCount: number; untaggedCount: number; unsynthesizedCount: number }) => {
      setCorrectionStats(stats);
    },
    [],
  );

  const handleRuleStatsChange = useCallback((stats: { ruleCount: number; unreviewedCount: number }) => {
    setRuleStats(stats);
  }, []);

  const handleExportForSynthesis = useCallback(async () => {
    try {
      const result = await exportCorrectionsJson();
      if (result.count === 0) {
        setExportStatus("No corrections to export");
      } else {
        setCorrectionStats((prev) => ({
          ...prev,
          unsynthesizedCount: Math.max(0, prev.unsynthesizedCount - result.count),
        }));
        const idsJson = JSON.stringify(result.highlightIds);
        const prompt = `Analyze ${result.count} writing corrections from ~/.margin/corrections-export.json. Synthesize into actionable writing rules grouped by theme. For each rule: state the rule, when to apply, why it matters, signal count, and a before/after example grounded in actual corrections. Pay attention to polarity tags — separate patterns to reinforce (+positive) from patterns to fix (+corrective). Save each rule via the margin_create_writing_rule MCP tool.\n\nAfter ALL rules are created, call margin_mark_corrections_synthesized with highlight_ids: ${idsJson}`;
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
    <div className="flex flex-col" style={{ minHeight: "calc(100vh - 80px)" }}>
      {/* Stats bar */}
      <div className="flex items-center gap-12 border-b border-[var(--color-border)] px-8 py-6">
        <Stat
          value={correctionStats.total}
          label="Corrections"
          active={statFilter === "all-corrections"}
          onClick={() => {
            const next = statFilter === "all-corrections" ? null : ("all-corrections" as StatFilter);
            setStatFilter(next);
            if (next) setActiveTab("corrections");
          }}
        />
        <Stat
          value={ruleStats.ruleCount}
          label="Rules"
          active={statFilter === "all-rules"}
          onClick={() => {
            const next = statFilter === "all-rules" ? null : ("all-rules" as StatFilter);
            setStatFilter(next);
            if (next) setActiveTab("rules");
          }}
        />
        {correctionStats.unsynthesizedCount > 0 && (
          <Stat
            value={correctionStats.unsynthesizedCount}
            label="To process"
            accent
            active={statFilter === "to-process"}
            onClick={() => {
              const next = statFilter === "to-process" ? null : ("to-process" as StatFilter);
              setStatFilter(next);
              if (next) setActiveTab("corrections");
            }}
          />
        )}
        {ruleStats.unreviewedCount > 0 && (
          <Stat
            value={ruleStats.unreviewedCount}
            label="To review"
            accent
            active={statFilter === "to-review"}
            onClick={() => {
              const next = statFilter === "to-review" ? null : ("to-review" as StatFilter);
              setStatFilter(next);
              if (next) setActiveTab("rules");
            }}
          />
        )}
        {correctionStats.untaggedCount > 0 && (
          <Stat
            value={correctionStats.untaggedCount}
            label="Needs attention"
            active={statFilter === "needs-attention"}
            onClick={() => {
              const next = statFilter === "needs-attention" ? null : ("needs-attention" as StatFilter);
              setStatFilter(next);
              if (next) setActiveTab("corrections");
            }}
          />
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
          {activeTab === "corrections" && correctionStats.unsynthesizedCount > 0 && (
            <button
              type="button"
              onClick={handleExportForSynthesis}
              className="shrink-0 cursor-pointer rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--hover-bg)] px-3 py-1.5 text-[length:var(--text-xs)] font-medium text-[var(--color-text-secondary)] transition-colors duration-150 hover:bg-[var(--color-surface-muted)]"
            >
              Export {correctionStats.unsynthesizedCount} for synthesis
            </button>
          )}
        </div>
      </div>

      {/* Seed from style guide */}
      <SeedGuideSection onSeeded={() => setActiveTab("rules")} />

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
          <CorrectionsTab
            onStatsChange={handleCorrectionStatsChange}
            filterHint={
              statFilter === "to-process" ? "unsynthesized"
                : statFilter === "needs-attention" ? "untagged"
                : statFilter === "all-corrections" ? "all"
                : null
            }
          />
        </div>
      ) : (
        <div
          role="tabpanel"
          id={rulesPanelId}
          aria-labelledby={rulesTabId}
          className="flex flex-1 flex-col"
          style={{ minHeight: 0 }}
        >
          <RulesTab
            onStatsChange={handleRuleStatsChange}
            filterHint={
              statFilter === "to-review" ? "unreviewed"
                : statFilter === "all-rules" ? "all"
                : null
            }
          />
        </div>
      )}
    </div>
  );
}

function Stat({
  value,
  label,
  accent,
  active,
  onClick,
}: {
  value: number | string;
  label: string;
  accent?: boolean;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col bg-transparent border-0 p-0 cursor-pointer text-left"
    >
      <span
        className="font-serif text-4xl font-bold leading-none tracking-tight"
        style={{
          color: accent ? "var(--color-accent)" : "var(--color-text-primary)",
        }}
      >
        {value}
      </span>
      <span
        className="mt-0.5 text-[length:12px] font-medium uppercase tracking-wide"
        style={{
          color: active ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
          borderBottom: active ? "2px solid var(--color-accent)" : "2px solid transparent",
          paddingBottom: 2,
        }}
      >
        {label}
      </span>
    </button>
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
