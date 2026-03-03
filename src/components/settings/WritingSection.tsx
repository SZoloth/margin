import { useEffect, useState, useCallback } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import type { Settings } from "@/hooks/useSettings";
import { useCopyFeedback } from "@/hooks/useCopyFeedback";
import { SectionHeader } from "./SectionHeader";
import { SettingRow } from "./SettingRow";
import { ToggleSwitch } from "./ToggleSwitch";
import { SettingsButton } from "./SettingsButton";
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
  const { copied, triggerCopied } = useCopyFeedback();

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

  const handleCopy = useCallback(async () => {
    try {
      const corrections = await getAllCorrections(200);
      const text = formatStyleMemory(corrections, {
        totalCount: correctionCount ?? corrections.length,
      });
      if (!text) return;
      await writeText(text);
      triggerCopied();
    } catch {
      // clipboard write failed silently
    }
  }, [correctionCount, triggerCopied]);

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
              <SettingsButton onClick={onOpenCorrections}>
                View all
              </SettingsButton>
            )}
            <SettingsButton
              disabled={!hasCorrections}
              onClick={handleCopy}
            >
              {copied ? "Copied" : "Copy"}
            </SettingsButton>
          </div>
        </SettingRow>
      </div>
    </div>
  );
}
