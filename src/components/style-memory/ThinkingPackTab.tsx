import { useState, useCallback } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
  compileThinkingPack,
  syncEideticMemory,
  type ThinkingPackResult,
  type EideticSyncResult,
} from "@/lib/tauri-commands";
import { reportError } from "@/lib/error-bus";
import { cn } from "@/lib/cn";
import { BUTTON_PRIMARY_CLASS, FOCUS_RING } from "@/components/style-memory/controls";

const BUDGET_OPTIONS = [1200, 2000, 4000] as const;

export function ThinkingPackTab() {
  const [query, setQuery] = useState("");
  const [maxTokens, setMaxTokens] = useState<number>(2000);
  const [pack, setPack] = useState<ThinkingPackResult | null>(null);
  const [syncInfo, setSyncInfo] = useState<EideticSyncResult | null>(null);
  const [compiling, setCompiling] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCompile = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = query.trim();
      if (!trimmed || compiling) return;
      setCompiling(true);
      setError(null);
      setCopied(false);
      try {
        const result = await compileThinkingPack(trimmed, maxTokens);
        setPack(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      } finally {
        setCompiling(false);
      }
    },
    [query, maxTokens, compiling],
  );

  const handleSync = useCallback(async () => {
    if (syncing) return;
    setSyncing(true);
    setError(null);
    try {
      const result = await syncEideticMemory();
      setSyncInfo(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setSyncing(false);
    }
  }, [syncing]);

  const handleCopy = useCallback(async () => {
    if (!pack?.text) return;
    try {
      await writeText(pack.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      reportError("Could not copy Thinking Pack", err);
    }
  }, [pack]);

  const conflictCount = Array.isArray(pack?.conflicts) ? pack.conflicts.length : 0;

  return (
    <div className="flex flex-1 flex-col gap-5 px-8 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-[580px] text-[length:var(--text-sm)] leading-[1.6] text-[var(--color-text-secondary)]">
          Compile a deterministic, budget-capped brief of your relevant writing rules, highlights, and past corrections with provenance and conflict checks.
        </p>
        <button
          type="button"
          onClick={() => void handleSync()}
          disabled={syncing}
          className={cn(
            "cursor-pointer rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[length:var(--text-xs)] font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-subtle)] disabled:cursor-not-allowed disabled:opacity-50",
            FOCUS_RING,
          )}
        >
          {syncing ? "Syncing..." : "Sync library"}
        </button>
      </div>

      {syncInfo && (
        <p
          role="status"
          aria-live="polite"
          className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-sidebar)] px-3.5 py-2 text-[length:var(--text-xs)] text-[var(--color-text-secondary)]"
        >
          Synced {syncInfo.memoriesIndexed} memories ({syncInfo.rulesPrepared} rules, {syncInfo.highlightsPrepared} highlights, {syncInfo.correctionsPrepared} corrections).
        </p>
      )}

      <form onSubmit={(e) => void handleCompile(e)} className="flex flex-wrap items-center gap-2.5">
        <label htmlFor="thinking-pack-query" className="sr-only">
          Topic or writing task
        </label>
        <input
          id="thinking-pack-query"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Topic or writing task (e.g. cover letter framing Margin)"
          className={cn(
            "min-w-[260px] flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[length:var(--text-sm)] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)]",
            FOCUS_RING,
          )}
        />
        <select
          aria-label="Token budget"
          value={maxTokens}
          onChange={(e) => setMaxTokens(Number(e.target.value))}
          className={cn(
            "rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-2 text-[length:var(--text-xs)] text-[var(--color-text-primary)]",
            FOCUS_RING,
          )}
        >
          {BUDGET_OPTIONS.map((b) => (
            <option key={b} value={b}>
              {b.toLocaleString()} tokens
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={compiling || query.trim().length === 0}
          className={cn(BUTTON_PRIMARY_CLASS, "disabled:cursor-not-allowed disabled:opacity-50")}
        >
          {compiling ? "Compiling..." : "Compile pack"}
        </button>
      </form>

      {error && (
        <div
          role="alert"
          className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-sidebar)] px-4 py-3 text-[length:var(--text-xs)] text-[var(--color-text-secondary)]"
        >
          {error}
        </div>
      )}

      {pack && (
        <section className="flex flex-1 flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] pb-3">
            <div className="flex flex-wrap items-center gap-2 text-[length:var(--text-xs)] text-[var(--color-text-secondary)]">
              <span className="rounded-[var(--radius-pill)] bg-[var(--color-surface-subtle)] px-2 py-0.5 font-mono text-[var(--color-text-primary)]">
                {pack.hash.slice(0, 19)}…
              </span>
              <span className="tabular-nums">{pack.itemsCount} items</span>
              {conflictCount > 0 && (
                <span className="rounded-[var(--radius-pill)] bg-[var(--color-surface-subtle)] px-2 py-0.5 font-medium text-[var(--color-text-primary)]">
                  {conflictCount} {conflictCount === 1 ? "conflict" : "conflicts"} flagged
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => void handleCopy()}
              className={cn(
                "cursor-pointer rounded-[var(--radius-sm)] border border-[var(--color-border)] px-2.5 py-1 text-[length:var(--text-xs)] font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-subtle)]",
                FOCUS_RING,
              )}
            >
              {copied ? "Copied" : "Copy pack"}
            </button>
          </div>
          <pre className="max-h-[460px] overflow-auto whitespace-pre-wrap font-mono text-[length:var(--text-xs)] leading-[1.6] text-[var(--color-text-primary)]">
            {pack.text}
          </pre>
        </section>
      )}
    </div>
  );
}
