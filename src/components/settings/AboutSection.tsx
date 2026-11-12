import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { SectionHeader } from "./SectionHeader";
import { SettingRow } from "./SettingRow";
import { SettingsButton } from "./SettingsButton";
import type { useUpdater } from "@/hooks/useUpdater";

interface AboutSectionProps {
  updater: ReturnType<typeof useUpdater>;
}

export function AboutSection({ updater }: AboutSectionProps) {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion("unknown"));
  }, []);

  const buttonLabel = updater.installing
    ? "Installing…"
    : updater.checking
      ? "Checking…"
      : updater.available
        ? `Update to ${updater.version}`
        : "Check for updates";

  return (
    <div className="flex flex-col gap-1">
      <SectionHeader title="About" />

      <SettingRow label="Version" description={version ?? "…"}>
        <SettingsButton
          onClick={updater.available ? updater.install : updater.recheck}
          disabled={updater.checking || updater.installing}
        >
          {buttonLabel}
        </SettingsButton>
      </SettingRow>

      {updater.error && (
        <p className="text-[length:var(--text-sm)] text-[var(--color-text-secondary)]">
          {updater.error}
        </p>
      )}
    </div>
  );
}
