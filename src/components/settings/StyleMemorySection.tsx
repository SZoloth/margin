import { useState, useCallback, useRef, useEffect } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { exportCorrectionsJson, getWritingRules, getCorrectionsFlat } from "@/lib/tauri-commands";
import { reportError } from "@/lib/error-bus";
import { cn } from "@/lib/cn";
import { CorrectionsTab } from "@/components/style-memory/CorrectionsTab";
import { RulesTab, countRules, type RuleCounts } from "@/components/style-memory/RulesTab";
import { BUTTON_PRIMARY_CLASS, FOCUS_RING, plural } from "@/components/style-memory/controls";
import type { CorrectionDetail } from "@/types/annotations";

/**
 * Writing rules is one pipeline, so it reads as one: your notes on writing,
 * the rules Claude suggests from them, and the rules Claude follows. The three
 * tabs are those three stages in order, each carrying its own count, so the
 * page needs no separate stat row, import bar or jargon to explain itself.
 */
type Stage = "notes" | "suggested" | "rules";

const STAGES: { id: Stage; label: string }[] = [
  { id: "notes", label: "Your notes" },
  { id: "suggested", label: "Suggested rules" },
  { id: "rules", label: "Rules in use" },
];

/** Mirrors CORRECTION_FILTER: what synthesis will actually consume. */
function readyForRules(c: CorrectionDetail): boolean {
  return c.synthesizedAt == null && c.notes.length > 0 && c.category !== "non-feedback";
}

interface StyleMemorySectionProps {
  onAcceptEdit?: (
    highlightId: string,
    matchText: string,
    suggestedEdit: string,
  ) => boolean | Promise<boolean>;
}

export function StyleMemorySection({ onAcceptEdit }: StyleMemorySectionProps = {}) {
  const [stage, setStage] = useState<Stage | null>(null);
  const [readyCount, setReadyCount] = useState<number | null>(null);
  const [ruleCounts, setRuleCounts] = useState<RuleCounts | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const copyTimeoutRef = useRef<number | null>(null);
  const tabRefs = useRef<Record<Stage, HTMLButtonElement | null>>({ notes: null, suggested: null, rules: null });

  // Counts for every stage up front, so the tabs are honest before they're opened.
  useEffect(() => {
    let cancelled = false;
    getWritingRules()
      .then((rules) => {
        if (!cancelled) setRuleCounts(countRules(rules));
      })
      .catch((err: unknown) => {
        reportError("Could not load rule counts", err);
        if (!cancelled) setRuleCounts({ inEffect: 0, suggested: 0 });
      });
    getCorrectionsFlat()
      .then((rows) => {
        if (!cancelled) setReadyCount(rows.filter(readyForRules).length);
      })
      .catch((err: unknown) => {
        reportError("Could not load note counts", err);
        if (!cancelled) setReadyCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Open on the stage that needs you: suggestions to decide on, then notes
  // ready to turn into rules, otherwise the rules themselves.
  const effectiveStage: Stage =
    stage ??
    (ruleCounts && ruleCounts.suggested > 0
      ? "suggested"
      : readyCount && readyCount > 0
        ? "notes"
        : "rules");

  // Don't guess a stage and then jump: wait for both counts, then pin the
  // opening stage so later count changes never move the user.
  const settled = stage !== null || (ruleCounts !== null && readyCount !== null);
  useEffect(() => {
    if (stage === null && ruleCounts !== null && readyCount !== null) setStage(effectiveStage);
  }, [stage, ruleCounts, readyCount, effectiveStage]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current !== null) window.clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const handleCorrectionStatsChange = useCallback(
    (stats: { total: number; documentCount: number; untaggedCount: number; unsynthesizedCount: number }) => {
      setReadyCount(stats.unsynthesizedCount);
    },
    [],
  );

  const handleRuleStatsChange = useCallback((counts: RuleCounts) => {
    setRuleCounts(counts);
  }, []);

  const handleCopyPrompt = useCallback(async () => {
    try {
      const result = await exportCorrectionsJson();
      if (result.count === 0) {
        setCopyStatus("No notes are ready yet");
      } else {
        setReadyCount((prev) => Math.max(0, (prev ?? 0) - result.count));
        const idsJson = JSON.stringify(result.highlightIds);
        const prompt = `Analyze ${result.count} writing corrections from ~/.margin/corrections-export.json. Synthesize into actionable writing rules grouped by theme. For each rule: state the rule, when to apply, why it matters, signal count, and a before/after example grounded in actual corrections. Pay attention to polarity tags — separate patterns to reinforce (+positive) from patterns to fix (+corrective). Save each rule via the margin_create_writing_rule MCP tool, and ALWAYS pass synthesized_from with the highlight_ids of the corrections that motivated the rule (valid ids: ${idsJson}). Rules created this way enter as review candidates — accepting them in Margin automatically marks the source corrections synthesized, so do NOT call margin_mark_corrections_synthesized.`;
        await writeText(prompt);
        setCopyStatus("Copied. Paste it into Claude; its drafts will appear under Suggested rules.");
      }
      if (copyTimeoutRef.current !== null) window.clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = window.setTimeout(() => setCopyStatus(null), 8000);
    } catch (err) {
      reportError("Could not prepare your notes for Claude", err);
      setCopyStatus("Couldn't copy the prompt");
    }
  }, []);

  const counts: Record<Stage, number | null> = {
    notes: readyCount,
    suggested: ruleCounts?.suggested ?? null,
    rules: ruleCounts?.inEffect ?? null,
  };

  const onTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = STAGES[(index + (e.key === "ArrowRight" ? 1 : STAGES.length - 1)) % STAGES.length]!;
    setStage(next.id);
    tabRefs.current[next.id]?.focus();
  };

  return (
    <div className="flex flex-col" style={{ minHeight: "calc(100vh - 80px)" }}>
      <header className="px-8 pb-5 pt-12">
        <h2 className="text-[length:var(--text-2xl)] font-light text-[var(--color-text-primary)]">
          Writing rules
        </h2>
        <p className="mt-2 max-w-[640px] text-[length:var(--text-sm)] leading-[1.6] text-[var(--color-text-secondary)]">
          Your notes on what you read become rules. Claude follows the rules you accept, every time it writes for you.
        </p>
      </header>

      <div
        role="tablist"
        aria-label="Writing rules"
        className="flex gap-1 border-b border-[var(--color-border)] px-6"
      >
        {STAGES.map((s, i) => {
          const active = effectiveStage === s.id;
          const count = counts[s.id];
          const wantsYou = s.id === "suggested" && (count ?? 0) > 0;
          return (
            <button
              key={s.id}
              ref={(el) => {
                tabRefs.current[s.id] = el;
              }}
              type="button"
              role="tab"
              id={`wr-tab-${s.id}`}
              aria-selected={active}
              aria-controls={`wr-panel-${s.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setStage(s.id)}
              onKeyDown={(e) => onTabKeyDown(e, i)}
              className={cn(
                "-mb-px flex cursor-pointer items-center gap-2 border-b-2 px-2 py-3 text-[length:var(--text-sm)] transition-colors duration-150",
                FOCUS_RING,
                active
                  ? "border-[var(--color-accent)] font-medium text-[var(--color-text-primary)]"
                  : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
              )}
            >
              {s.label}
              {count !== null && count > 0 && (
                <span
                  className={cn(
                    "rounded-[var(--radius-pill)] px-1.5 text-[length:var(--text-xs)] tabular-nums",
                    wantsYou
                      ? "bg-[var(--color-accent)] text-[var(--color-page)]"
                      : "bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)]",
                  )}
                >
                  {count}
                </span>
              )}
              {i < STAGES.length - 1 && (
                <span aria-hidden="true" className="pl-2 text-[var(--color-text-tertiary)]">
                  →
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`wr-panel-${effectiveStage}`}
        aria-labelledby={`wr-tab-${effectiveStage}`}
        className="relative flex flex-1 flex-col"
        style={{ minHeight: 0 }}
      >
        {!settled ? null : effectiveStage === "notes" ? (
          <>
            <p className="px-8 pt-4 text-[length:var(--text-sm)] text-[var(--color-text-secondary)]">
              Every comment you leave on a highlight about how something is written lands here.
            </p>
            {(readyCount ?? 0) > 0 && (
              <div className="flex items-center gap-4 border-b border-[var(--color-border)] bg-[var(--color-sidebar)] px-8 py-3">
                <p className="flex-1 text-[length:var(--text-sm)] text-[var(--color-text-primary)]">
                  {plural(readyCount ?? 0, "note is", "notes are")} ready to become rules.
                  <span className="text-[var(--color-text-secondary)]">
                    {" "}Claude reads them and drafts rules for you to accept or decline.
                  </span>
                </p>
                <button type="button" onClick={() => void handleCopyPrompt()} className={BUTTON_PRIMARY_CLASS}>
                  Copy prompt for Claude
                </button>
              </div>
            )}
            {copyStatus && (
              <p role="status" aria-live="polite" className="border-b border-[var(--color-border)] px-8 py-2 text-[length:var(--text-xs)] text-[var(--color-text-secondary)]">
                {copyStatus}
              </p>
            )}
            <CorrectionsTab
              onStatsChange={handleCorrectionStatsChange}
              filterHint={null}
              onAcceptEdit={onAcceptEdit}
            />
          </>
        ) : (
          <RulesTab
            key={effectiveStage}
            mode={effectiveStage}
            onStatsChange={handleRuleStatsChange}
          />
        )}
      </div>
    </div>
  );
}
