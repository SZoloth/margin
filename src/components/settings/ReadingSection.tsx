import type { Settings } from "@/hooks/useSettings";
import { HIGHLIGHT_COLORS } from "@/lib/highlight-colors";
import { SectionHeader } from "./SectionHeader";
import { SettingsCard } from "./SettingsCard";
import { SettingRow } from "./SettingRow";
import { SegmentedControl } from "./SegmentedControl";
import { ColorPicker } from "./ColorPicker";

interface ReadingSectionProps {
  settings: Settings;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

const THEME_OPTIONS = [
  { value: "light" as const, label: "Light" },
  { value: "dark" as const, label: "Dark" },
  { value: "system" as const, label: "System" },
];

const FONT_SIZE_OPTIONS = [
  { value: "small" as const, label: "Small" },
  { value: "default" as const, label: "Default" },
  { value: "large" as const, label: "Large" },
  { value: "xl" as const, label: "X-Large" },
];

const LINE_SPACING_OPTIONS = [
  { value: "compact" as const, label: "Compact" },
  { value: "default" as const, label: "Default" },
  { value: "relaxed" as const, label: "Relaxed" },
];

const FONT_FAMILY_OPTIONS = [
  { value: "serif" as const, label: "Serif" },
  { value: "sans" as const, label: "Sans" },
];

const READER_WIDTH_OPTIONS = [
  { value: "narrow" as const, label: "Narrow" },
  { value: "default" as const, label: "Default" },
  { value: "wide" as const, label: "Wide" },
];


export function ReadingSection({ settings, setSetting }: ReadingSectionProps) {
  return (
    <div className="flex flex-col gap-2">
      {/* Preview card */}
      <SettingsCard data-testid="reading-preview">
        <p
          className="text-[length:var(--text-sm)] leading-relaxed text-[var(--color-text-secondary)]"
          style={{
            fontFamily: settings.fontFamily === "sans"
              ? "'Instrument Sans', system-ui, sans-serif"
              : "'Newsreader', Georgia, serif",
            fontStyle: "italic",
          }}
        >
          One must be careful of books, and what is inside them, for words have
          the power to change us.
        </p>
      </SettingsCard>

      {/* Controls card */}
      <SettingsCard>
        <SectionHeader title="Reading" />

        <SettingRow label="Theme">
          <SegmentedControl
            options={THEME_OPTIONS}
            value={settings.theme}
            onChange={(v) => setSetting("theme", v)}
            ariaLabel="Theme"
          />
        </SettingRow>

        <SettingRow label="Font">
          <SegmentedControl
            options={FONT_FAMILY_OPTIONS}
            value={settings.fontFamily}
            onChange={(v) => setSetting("fontFamily", v)}
            ariaLabel="Font"
          />
        </SettingRow>

        <SettingRow label="Font size">
          <SegmentedControl
            options={FONT_SIZE_OPTIONS}
            value={settings.fontSize}
            onChange={(v) => setSetting("fontSize", v)}
            ariaLabel="Font size"
          />
        </SettingRow>

        <SettingRow label="Line spacing">
          <SegmentedControl
            options={LINE_SPACING_OPTIONS}
            value={settings.lineSpacing}
            onChange={(v) => setSetting("lineSpacing", v)}
            ariaLabel="Line spacing"
          />
        </SettingRow>

        <SettingRow label="Reader width">
          <SegmentedControl
            options={READER_WIDTH_OPTIONS}
            value={settings.readerWidth}
            onChange={(v) => setSetting("readerWidth", v)}
            ariaLabel="Reader width"
          />
        </SettingRow>

        <SettingRow label="Default highlight color">
          <ColorPicker
            colors={HIGHLIGHT_COLORS}
            value={settings.defaultHighlightColor}
            onChange={(v) => setSetting("defaultHighlightColor", v)}
          />
        </SettingRow>
      </SettingsCard>
    </div>
  );
}
