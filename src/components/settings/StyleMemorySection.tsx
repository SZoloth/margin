import { useState, useCallback, useRef, useEffect } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { exportCorrectionsJson, getCorrectionsFlat } from "@/lib/tauri-commands";
import { reportError } from "@/lib/error-bus";
import { cn } from "@/lib/cn";
import { CorrectionsTab } from "@/components/style-memory/CorrectionsTab";
import { StyleGuide } from "@/components/style-memory/StyleGuide";
import type { RuleCounts } from "@/components/style-memory/rules-model";
import { BUTTON_PRIMARY_CLASS, FOCUS_RING, plural } from "@/components/style-memory/controls";
import type { CorrectionDetail } from "@/types/annotations";

/**
 * Writing rules has two views. The style guide is home: the rules Claude
 * follows, with Claude's suggestions inline waiting for a yes. Notes holds the
 * raw material, the comments you left while reading, and the step that turns
 * them into suggestions.
 */
type View = "guide" | "notes";

const VIEWS: { id: View; label: string }[] = [
  { id: "guide", label: "Style guide" },
  { id: "notes", label: "Notes" },
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
  const [view, setView] = useState<View>("guide");
  const [readyCount, setReadyCount] = useState<number | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const copyTimeoutRef = useRef<number | null>(null);
  const tabRefs = useRef<Record<View, HTMLButtonElement | null>>({ guide: null, notes: null });

  // The Notes count shows on its tab before the tab is opened.
  useEffect(() => {
    let cancelled = false;
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

  const handleRuleStatsChange = useCallback((_counts: RuleCounts) => {}, []);

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
        setCopyStatus("Copied. Paste it into Claude; its suggestions will appear in your style guide, underlined.");
      }
      if (copyTimeoutRef.current !== null) window.clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = window.setTimeout(() => setCopyStatus(null), 8000);
    } catch (err) {
      reportError("Could not prepare your notes for Claude", err);
      setCopyStatus("Couldn't copy the prompt");
    }
  }, []);

  const onTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = VIEWS[(index + 1) % VIEWS.length]!;
    setView(next.id);
    tabRefs.current[next.id]?.focus();
  };

  return (
    <div className="flex flex-col" style={{ minHeight: "calc(100vh - 80px)" }}>
      <header className="px-8 pb-5 pt-12">
        <h2 className="text-[length:var(--text-2xl)] font-light text-[var(--color-text-primary)]">
          Writing rules
        </h2>
        <p className="mt-2 max-w-[640px] text-[length:var(--text-sm)] leading-[1.6] text-[var(--color-text-secondary)]">
          Your style guide for Claude. It grows from the notes you leave while reading, and Claude follows it every time it writes for you.
        </p>
      </header>

      <div role="tablist" aria-label="Writing rules" className="flex gap-4 border-b border-[var(--color-border)] px-8">
        {VIEWS.map((v, i) => {
          const active = view === v.id;
          const count = v.id === "notes" ? readyCount : null;
          return (
            <button
              key={v.id}
              ref={(el) => {
                tabRefs.current[v.id] = el;
              }}
              type="button"
              role="tab"
              id={`wr-tab-${v.id}`}
              aria-selected={active}
              aria-controls={`wr-panel-${v.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => setView(v.id)}
              onKeyDown={(e) => onTabKeyDown(e, i)}
              className={cn(
                "-mb-px flex cursor-pointer items-center gap-2 border-b-2 py-3 text-[length:var(--text-sm)] transition-colors duration-150",
                FOCUS_RING,
                active
                  ? "border-[var(--color-accent)] font-medium text-[var(--color-text-primary)]"
                  : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
              )}
            >
              {v.label}
              {count !== null && count > 0 && (
                <span
                  aria-label={`${count} not used yet`}
                  className="rounded-[var(--radius-pill)] bg-[var(--color-surface-subtle)] px-1.5 text-[length:var(--text-xs)] tabular-nums text-[var(--color-text-secondary)]"
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`wr-panel-${view}`}
        aria-labelledby={`wr-tab-${view}`}
        className="relative flex flex-1 flex-col"
        style={{ minHeight: 0 }}
      >
        {view === "notes" ? (
          <>
            <p className="px-8 pt-4 text-[length:var(--text-sm)] text-[var(--color-text-secondary)]">
              Every comment you leave on a highlight about how something is written lands here.
            </p>
            {(readyCount ?? 0) > 0 && (
              <div className="mt-3 flex items-center gap-4 border-y border-[var(--color-border)] bg-[var(--color-sidebar)] px-8 py-3">
                <p className="flex-1 text-[length:var(--text-sm)] text-[var(--color-text-primary)]">
                  {plural(readyCount ?? 0, "note is", "notes are")} ready to become rules.
                  <span className="text-[var(--color-text-secondary)]">
                    {" "}Claude reads them and suggests rules, which show up in your style guide for you to accept or decline.
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
          <StyleGuide
            onStatsChange={handleRuleStatsChange}
            readyNotes={readyCount ?? 0}
            onShowNotes={() => setView("notes")}
          />
        )}
      </div>
    </div>
  );
}
