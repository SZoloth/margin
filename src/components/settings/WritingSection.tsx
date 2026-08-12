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
        <SectionHeader title="Writing" />

        <SettingRow
          label="Learn from feedback"
          description="Save correction feedback to Margin's local learning system as you write"
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
