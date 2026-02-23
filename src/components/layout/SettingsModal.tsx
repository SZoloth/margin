import { useEffect, useState, useCallback } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import type { Settings } from "@/hooks/useSettings";
import { getAllCorrections } from "@/lib/tauri-commands";
import { formatStyleMemory } from "@/lib/export-annotations";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

const FONT_SIZE_OPTIONS: { value: Settings["fontSize"]; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "default", label: "Default" },
  { value: "large", label: "Large" },
  { value: "xl", label: "X-Large" },
];

const LINE_SPACING_OPTIONS: { value: Settings["lineSpacing"]; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "default", label: "Default" },
  { value: "relaxed", label: "Relaxed" },
];

const READER_WIDTH_OPTIONS: { value: Settings["readerWidth"]; label: string }[] = [
  { value: "narrow", label: "Narrow" },
  { value: "default", label: "Default" },
  { value: "wide", label: "Wide" },
];

const THEME_OPTIONS: { value: Settings["theme"]; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

const HIGHLIGHT_COLORS: { value: Settings["defaultHighlightColor"]; css: string }[] = [
  { value: "yellow", css: "var(--color-highlight-yellow)" },
  { value: "green", css: "var(--color-highlight-green)" },
  { value: "blue", css: "var(--color-highlight-blue)" },
  { value: "pink", css: "var(--color-highlight-pink)" },
  { value: "orange", css: "var(--color-highlight-orange)" },
];

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 1,
        backgroundColor: "var(--hover-bg)",
        borderRadius: "var(--radius-sm)",
        padding: 2,
      }}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          style={{
            flex: 1,
            padding: "5px 10px",
            fontSize: 12,
            fontWeight: value === opt.value ? 600 : 400,
            fontFamily: "'Inter', system-ui, sans-serif",
            color: value === opt.value ? "var(--color-text-primary)" : "var(--color-text-secondary)",
            backgroundColor: value === opt.value ? "var(--color-page)" : "transparent",
            border: value === opt.value ? "1px solid var(--color-border)" : "1px solid transparent",
            borderRadius: "calc(var(--radius-sm) - 2px)",
            cursor: "pointer",
            transition: "all 150ms ease",
            whiteSpace: "nowrap",
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        position: "relative",
        width: 36,
        height: 20,
        borderRadius: 10,
        backgroundColor: checked ? "var(--color-accent)" : "var(--color-border)",
        border: "none",
        cursor: "pointer",
        padding: 0,
        transition: "background-color 200ms ease",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: checked ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: "50%",
          backgroundColor: "var(--color-page)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          transition: "left 200ms ease",
        }}
      />
    </button>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        padding: "10px 0",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--color-text-primary)",
          }}
        >
          {label}
        </div>
        {description && (
          <div
            style={{
              fontSize: 11,
              color: "var(--color-text-secondary)",
              marginTop: 2,
            }}
          >
            {description}
          </div>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        color: "var(--color-text-secondary)",
        padding: "12px 0 4px",
      }}
    >
      {title}
    </div>
  );
}

function StyleMemoryRow() {
  const [correctionCount, setCorrectionCount] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getAllCorrections()
      .then((records) => setCorrectionCount(records.length))
      .catch(() => setCorrectionCount(0));
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      const corrections = await getAllCorrections();
      const text = formatStyleMemory(corrections);
      await writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
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
    <SettingRow label="Style Memory" description={description}>
      <button
        type="button"
        disabled={!hasCorrections}
        onClick={handleCopy}
        style={{
          padding: "5px 14px",
          fontSize: 12,
          fontWeight: 500,
          fontFamily: "'Inter', system-ui, sans-serif",
          color: hasCorrections
            ? "var(--color-text-primary)"
            : "var(--color-text-secondary)",
          backgroundColor: "var(--hover-bg)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-sm)",
          cursor: hasCorrections ? "pointer" : "default",
          opacity: hasCorrections ? 1 : 0.5,
          transition: "all 150ms ease",
          whiteSpace: "nowrap",
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </SettingRow>
  );
}

export function SettingsModal({
  isOpen,
  onClose,
  settings,
  setSetting,
}: SettingsModalProps) {
  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "rgba(0, 0, 0, 0.3)",
        }}
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-label="Settings"
        style={{
          position: "relative",
          backgroundColor: "var(--color-page)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          padding: "20px 24px 24px",
          width: "min(400px, calc(100vw - 32px))",
          maxHeight: "calc(100vh - 64px)",
          overflowY: "auto",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
          fontFamily: "'Inter', system-ui, sans-serif",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <h2
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: "var(--color-text-primary)",
              margin: 0,
            }}
          >
            Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
              color: "var(--color-text-secondary)",
              fontSize: 18,
              lineHeight: 1,
            }}
            aria-label="Close settings"
          >
            &times;
          </button>
        </div>

        {/* Appearance section */}
        <SectionHeader title="Appearance" />

        <SettingRow label="Theme">
          <SegmentedControl
            options={THEME_OPTIONS}
            value={settings.theme}
            onChange={(v) => setSetting("theme", v)}
          />
        </SettingRow>

        <SettingRow label="Font size">
          <SegmentedControl
            options={FONT_SIZE_OPTIONS}
            value={settings.fontSize}
            onChange={(v) => setSetting("fontSize", v)}
          />
        </SettingRow>

        <SettingRow label="Line spacing">
          <SegmentedControl
            options={LINE_SPACING_OPTIONS}
            value={settings.lineSpacing}
            onChange={(v) => setSetting("lineSpacing", v)}
          />
        </SettingRow>

        <SettingRow label="Reader width">
          <SegmentedControl
            options={READER_WIDTH_OPTIONS}
            value={settings.readerWidth}
            onChange={(v) => setSetting("readerWidth", v)}
          />
        </SettingRow>

        {/* Divider */}
        <div
          style={{
            height: 1,
            backgroundColor: "var(--color-border)",
            margin: "8px 0",
          }}
        />

        {/* Editor section */}
        <SectionHeader title="Editor" />

        <SettingRow
          label="Autosave"
          description="Automatically save 2s after editing"
        >
          <ToggleSwitch
            checked={settings.autosave}
            onChange={(v) => setSetting("autosave", v)}
          />
        </SettingRow>

        <SettingRow label="Default highlight color">
          <div style={{ display: "flex", gap: 6 }}>
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setSetting("defaultHighlightColor", c.value)}
                aria-label={`Default: ${c.value}`}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  backgroundColor: c.css,
                  border:
                    settings.defaultHighlightColor === c.value
                      ? "2px solid var(--color-text-primary)"
                      : "1.5px solid var(--color-border)",
                  cursor: "pointer",
                  padding: 0,
                  transition: "border 150ms ease",
                }}
              />
            ))}
          </div>
        </SettingRow>
        <div
          style={{
            height: 1,
            backgroundColor: "var(--color-border)",
            margin: "8px 0",
          }}
        />

        {/* Export section */}
        <SectionHeader title="Export" />

        <SettingRow
          label="Save feedback locally"
          description="Store highlights and notes in local database when exporting"
        >
          <ToggleSwitch
            checked={settings.persistCorrections}
            onChange={(v) => setSetting("persistCorrections", v)}
          />
        </SettingRow>

        <StyleMemoryRow />
      </div>
    </div>
  );
}
