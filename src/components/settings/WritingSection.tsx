import type { Settings } from "@/hooks/useSettings";
import { SectionHeader } from "./SectionHeader";
import { SettingsCard } from "./SettingsCard";
import { SettingRow } from "./SettingRow";
import { ToggleSwitch } from "./ToggleSwitch";

interface WritingSectionProps {
  settings: Settings;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

export function WritingSection({
  settings,
  setSetting,
}: WritingSectionProps) {
  return (
    <div className="flex flex-col gap-2">
      <SettingsCard>
        <SectionHeader title="Notes" />

        <SettingRow
          label="Keep notes for rules"
          description="When you export notes, Margin keeps them so they can become writing rules. Off, an export leaves nothing behind."
        >
          <ToggleSwitch
            checked={settings.persistCorrections}
            onChange={(v) => setSetting("persistCorrections", v)}
          />
        </SettingRow>
      </SettingsCard>
    </div>
  );
}
