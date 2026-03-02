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
      {/* Header */}
      <div
        style={{
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 32px",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            type="button"
            onClick={onClose}
            aria-label="Back"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px",
              borderRadius: "var(--radius-sm)",
              color: "var(--color-text-secondary)",
              transition: "all 100ms",
            }}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 16, height: 16 }}>
              <path d="M10 3L5 8L10 13" />
            </svg>
          </button>
          <span style={{ fontSize: 22, fontWeight: 600, color: "var(--color-text-primary)", fontFamily: "'Newsreader', Georgia, serif", letterSpacing: "-0.01em" }}>
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
          gap: 48,
          padding: "24px 32px",
          borderBottom: "1px solid var(--color-border)",
          background: "var(--color-page)",
          flexShrink: 0,
        }}
      >
        <Stat value={correctionStats.total} label="Corrections" />
        <Stat value={correctionStats.documentCount} label="Documents" />
        <Stat value={ruleStats.ruleCount} label="Rules" />
        {correctionStats.untaggedCount > 0 && (
          <Stat value={correctionStats.untaggedCount} label="Needs attention" accent />
        )}
      </div>

      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="Style Memory sections"
        style={{
          display: "flex",
          gap: 0,
          padding: "0 32px",
          borderBottom: "1px solid var(--color-border)",
          flexShrink: 0,
          background: "var(--color-page)",
        }}
      >
        <TabButton active={activeTab === "corrections"} onClick={() => setActiveTab("corrections")}>
          Corrections
        </TabButton>
        <TabButton active={activeTab === "rules"} onClick={() => setActiveTab("rules")}>
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

function Stat({ value, label, accent }: { value: number | string; label: string; accent?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <span style={{
        fontSize: 36,
        fontWeight: 700,
        fontFamily: "'Newsreader', Georgia, serif",
        color: accent ? "var(--color-accent)" : "var(--color-text-primary)",
        lineHeight: 1,
        letterSpacing: "-0.02em",
      }}>
        {value}
      </span>
      <span style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 2 }}>
        {label}
      </span>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      style={{
        padding: "12px 16px",
        fontSize: 14,
        fontWeight: active ? 500 : 400,
        color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
        borderBottom: active ? "2px solid var(--color-accent)" : "2px solid transparent",
        cursor: "pointer",
        background: "none",
        borderTop: "none",
        borderLeft: "none",
        borderRight: "none",
        transition: "color 150ms, border-color 150ms",
      }}
    >
      {children}
    </button>
  );
}
