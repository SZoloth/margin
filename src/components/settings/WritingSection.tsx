import { useEffect, useState, useCallback, useRef } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import type { Settings } from "@/hooks/useSettings";
import { SectionHeader } from "./SectionHeader";
import { SettingRow } from "./SettingRow";
import { ToggleSwitch } from "./ToggleSwitch";
import { getCorrectionsCount, getAllCorrections } from "@/lib/tauri-commands";
import { formatStyleMemory } from "@/lib/export-annotations";

interface WritingSectionProps {
  settings: Settings;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  onOpenCorrections: () => void;
}

export function WritingSection({
  settings,
  setSetting,
  onOpenCorrections,
}: WritingSectionProps) {
  const [correctionCount, setCorrectionCount] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const copiedTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    getCorrectionsCount()
      .then((count) => {
        if (!cancelled) setCorrectionCount(count);
      })
      .catch(() => {
        if (!cancelled) setCorrectionCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current !== null) {
        window.clearTimeout(copiedTimeoutRef.current);
      }
    };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      const [countRes, correctionsRes] = await Promise.allSettled([
        getCorrectionsCount(),
        getAllCorrections(200),
      ]);

      if (correctionsRes.status !== "fulfilled") return;
      const corrections = correctionsRes.value;
      const totalCount =
        countRes.status === "fulfilled" ? countRes.value : corrections.length;

      const text = formatStyleMemory(corrections, { totalCount });
      if (!text) return;
      await writeText(text);
      setCopied(true);
      if (copiedTimeoutRef.current !== null) {
        window.clearTimeout(copiedTimeoutRef.current);
      }
      copiedTimeoutRef.current = window.setTimeout(
        () => setCopied(false),
        1500,
      );
    } catch {
      // clipboard write failed silently
    }
  }, []);

  const count = correctionCount ?? 0;
  const hasCorrections = count > 0;
  const description = hasCorrections
    ? `${count} correction${count === 1 ? "" : "s"} \u2014 copy as AI prompt`
    : "No corrections yet \u2014 export annotations first";

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-xl bg-[var(--color-sidebar)] p-6">
        <SectionHeader title="Writing" />

        <SettingRow
          label="Remember corrections"
          description="Store highlights and notes in local database when exporting"
        >
          <ToggleSwitch
            checked={settings.persistCorrections}
            onChange={(v) => setSetting("persistCorrections", v)}
          />
        </SettingRow>

        <SettingRow label="Style Memory" description={description}>
          <div className="flex gap-1.5">
            {hasCorrections && (
              <button
                type="button"
                onClick={onOpenCorrections}
                className="shrink-0 cursor-pointer rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3.5 py-1.5 text-[length:var(--text-xs)] font-medium text-[var(--color-text-primary)] transition-colors duration-150 hover:bg-[var(--color-surface-muted)]"
              >
                View all
              </button>
            )}
            <button
              type="button"
              disabled={!hasCorrections}
              onClick={handleCopy}
              className="shrink-0 cursor-pointer rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3.5 py-1.5 text-[length:var(--text-xs)] font-medium transition-colors duration-150 hover:bg-[var(--color-surface-muted)] disabled:cursor-default disabled:opacity-50"
              style={{
                color: hasCorrections
                  ? "var(--color-text-primary)"
                  : "var(--color-text-secondary)",
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </SettingRow>
      </div>
    </div>
  );
}
