import { useState } from "react";
import type { Settings } from "@/hooks/useSettings";
import { SettingsNav } from "./SettingsNav";
import { ReadingSection } from "./ReadingSection";
import { WritingSection } from "./WritingSection";
import { IntegrationsSection } from "./IntegrationsSection";

type Section = "reading" | "writing" | "integrations";

interface SettingsPageProps {
  settings: Settings;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  onClose: () => void;
  onOpenCorrections: () => void;
}

export function SettingsPage({
  settings,
  setSetting,
  onClose,
  onOpenCorrections,
}: SettingsPageProps) {
  const [activeSection, setActiveSection] = useState<Section>("reading");

  return (
    <div className="flex h-full">
      <SettingsNav
        activeSection={activeSection}
        onSelect={(s) => setActiveSection(s as Section)}
        onClose={onClose}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[560px] px-8 pt-12 pb-16">
          <h2
            className="mb-12 text-[length:var(--text-2xl)] font-light text-[var(--color-text-primary)]"
          >
            Settings
          </h2>

          <div
            style={{
              transition: "opacity 150ms var(--ease-micro)",
            }}
          >
            {activeSection === "reading" && (
              <ReadingSection settings={settings} setSetting={setSetting} />
            )}
            {activeSection === "writing" && (
              <WritingSection
                settings={settings}
                setSetting={setSetting}
                onOpenCorrections={onOpenCorrections}
              />
            )}
            {activeSection === "integrations" && <IntegrationsSection />}
          </div>
        </div>
      </div>
    </div>
  );
}
