import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { SectionHeader } from "./SectionHeader";
import { SettingRow } from "./SettingRow";
import { SettingsButton } from "./SettingsButton";
import { useCopyFeedback } from "@/hooks/useCopyFeedback";
import { reportError } from "@/lib/error-bus";
import { backupLabel, copyDiagnostics } from "@/lib/crash-reporting";
import { getBackupStatus, revealBackupsDir, revealLogsDir, type BackupStatus } from "@/lib/tauri-commands";
import type { useUpdater } from "@/hooks/useUpdater";

interface AboutSectionProps {
  updater: ReturnType<typeof useUpdater>;
}

export function AboutSection({ updater }: AboutSectionProps) {
  const [version, setVersion] = useState<string | null>(null);
  const [backups, setBackups] = useState<BackupStatus | null>(null);
  const { copied, triggerCopied } = useCopyFeedback();

  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion("unknown"));
    getBackupStatus().then(setBackups).catch(() => setBackups(null));
  }, []);

  const latest = backups?.latest ? backupLabel(backups.latest.name) : null;
  const backupDescription = backups === null
    ? "Daily snapshots of your library, kept on this Mac"
    : latest
      ? `Latest ${latest}. Margin keeps the last 7 days.`
      : "None yet. Margin takes one each day you open it.";

  const handleCopyDiagnostics = async () => {
    try {
      await copyDiagnostics();
      triggerCopied();
    } catch (err) {
      reportError("Could not copy diagnostics", err);
    }
  };

  const handleReveal = (reveal: () => Promise<void>, what: string) => async () => {
    try {
      await reveal();
    } catch (err) {
      reportError(`Could not open the ${what} folder`, err);
    }
  };

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

      <div className="mt-8">
        <SectionHeader title="Data and diagnostics" />
      </div>

      <SettingRow label="Backups" description={backupDescription}>
        <SettingsButton onClick={handleReveal(revealBackupsDir, "backups")}>
          Show in Finder
        </SettingsButton>
      </SettingRow>

      <SettingRow
        label="Diagnostics"
        description="Counts, versions and recent errors. Never your writing. Nothing leaves this Mac unless you send it."
      >
        <div className="flex gap-2">
          <SettingsButton onClick={handleReveal(revealLogsDir, "logs")}>
            Show logs
          </SettingsButton>
          <SettingsButton onClick={handleCopyDiagnostics}>
            {copied ? "Copied" : "Copy diagnostics"}
          </SettingsButton>
        </div>
      </SettingRow>
    </div>
  );
}
