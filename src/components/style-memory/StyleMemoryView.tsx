import { useEffect, useState, useCallback, useRef } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useAnimatedPresence } from "@/hooks/useAnimatedPresence";
import { exportCorrectionsJson } from "@/lib/tauri-commands";
import { CorrectionsTab } from "./CorrectionsTab";
import { RulesTab } from "./RulesTab";

interface StyleMemoryViewProps {
  isOpen: boolean;
  onClose: () => void;
}

type ActiveTab = "corrections" | "rules";

export function StyleMemoryView({ isOpen, onClose }: StyleMemoryViewProps) {
  const { isMounted, isVisible } = useAnimatedPresence(isOpen, 200);
  const [activeTab, setActiveTab] = useState<ActiveTab>("corrections");
  const [correctionStats, setCorrectionStats] = useState({ total: 0, documentCount: 0, untaggedCount: 0 });
  const [ruleStats, setRuleStats] = useState({ ruleCount: 0 });
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const exportTimeoutRef = useRef<number | null>(null);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    return () => {
      if (exportTimeoutRef.current !== null) {
        window.clearTimeout(exportTimeoutRef.current);
      }
    };
  }, []);

  const handleCorrectionStatsChange = useCallback((stats: { total: number; documentCount: number; untaggedCount: number }) => {
    setCorrectionStats(stats);
  }, []);

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
      exportTimeoutRef.current = window.setTimeout(() => setExportStatus(null), 6000);
    } catch (err) {
      console.error("Failed to export corrections:", err);
      setExportStatus("Export failed");
    }
  }, []);

  if (!isMounted) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "var(--color-page)",
        display: "flex",
        flexDirection: "column",
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translateY(0)" : "translateY(8px)",
        transition: isVisible
          ? "opacity 200ms var(--ease-entrance), transform 200ms var(--ease-entrance)"
          : "opacity 150ms var(--ease-exit), transform 150ms var(--ease-exit)",
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          height: 44,
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 13,
              fontWeight: 500,
              color: "var(--color-text-secondary)",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontFamily: "'Inter', system-ui, sans-serif",
              padding: "4px 8px",
              borderRadius: "var(--radius-sm)",
              transition: "all 100ms",
            }}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 14, height: 14 }}>
              <path d="M10 3L5 8L10 13" />
            </svg>
            Back
          </button>
          <span style={{ width: 1, height: 20, background: "var(--color-border)" }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)" }}>
            Style Memory
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {exportStatus && (
            <span style={{ fontSize: 11, color: "var(--color-text-secondary)", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {exportStatus}
            </span>
          )}
          {activeTab === "corrections" && correctionStats.total > 0 && (
            <button
              type="button"
              onClick={handleExportForSynthesis}
              style={{
                padding: "5px 12px",
                fontSize: 12,
                fontWeight: 500,
                fontFamily: "'Inter', system-ui, sans-serif",
                background: "var(--hover-bg)",
                color: "var(--color-text-secondary)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
              }}
            >
              Export for synthesis
            </button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 24,
          padding: "12px 32px",
          borderBottom: "1px solid var(--color-border)",
          background: "var(--color-sidebar, var(--hover-bg))",
          flexShrink: 0,
        }}
      >
        <Stat value={correctionStats.total} label="Corrections" />
        <StatDivider />
        <Stat value={correctionStats.documentCount} label="Documents" />
        <StatDivider />
        <Stat value={ruleStats.ruleCount} label="Rules" />
        {correctionStats.untaggedCount > 0 && (
          <>
            <StatDivider />
            <Stat value={`${correctionStats.untaggedCount} untagged`} label="Needs attention" small />
          </>
        )}
      </div>

      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          gap: 0,
          padding: "0 32px",
          borderBottom: "1px solid var(--color-border)",
          flexShrink: 0,
          background: "var(--color-page)",
        }}
      >
        <TabButton active={activeTab === "corrections"} onClick={() => setActiveTab("corrections")} count={correctionStats.total}>
          Corrections
        </TabButton>
        <TabButton active={activeTab === "rules"} onClick={() => setActiveTab("rules")} count={ruleStats.ruleCount}>
          Rules
        </TabButton>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        {activeTab === "corrections" ? (
          <CorrectionsTab onStatsChange={handleCorrectionStatsChange} />
        ) : (
          <RulesTab onStatsChange={handleRuleStatsChange} />
        )}
      </div>
    </div>
  );
}

function Stat({ value, label, small }: { value: number | string; label: string; small?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span style={{
        fontSize: small ? 14 : 20,
        fontWeight: small ? 500 : 700,
        color: small ? "var(--color-text-secondary)" : "var(--color-text-primary)",
        lineHeight: 1.2,
      }}>
        {value}
      </span>
      <span style={{ fontSize: 10, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.3px", marginTop: 2 }}>
        {label}
      </span>
    </div>
  );
}

function StatDivider() {
  return <div style={{ width: 1, height: 32, background: "var(--color-border)" }} />;
}

function TabButton({ active, onClick, count, children }: { active: boolean; onClick: () => void; count: number; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "10px 16px",
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
        borderBottom: active ? "2px solid var(--color-text-primary)" : "2px solid transparent",
        cursor: "pointer",
        background: "none",
        borderTop: "none",
        borderLeft: "none",
        borderRight: "none",
        fontFamily: "'Inter', system-ui, sans-serif",
        transition: "color 150ms, border-color 150ms",
      }}
    >
      {children}
      <span style={{ fontSize: 11, fontWeight: 400, color: "var(--color-text-secondary)", marginLeft: 4 }}>
        {count}
      </span>
    </button>
  );
}
