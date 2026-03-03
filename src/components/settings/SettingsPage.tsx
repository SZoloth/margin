import { useState } from "react";
import type { Settings } from "@/hooks/useSettings";
import type { useUpdater } from "@/hooks/useUpdater";
import { SettingsNav, type Section } from "./SettingsNav";
import { ReadingSection } from "./ReadingSection";
import { WritingSection } from "./WritingSection";
import { StyleMemorySection } from "./StyleMemorySection";
import { IntegrationsSection } from "./IntegrationsSection";
import { AboutSection } from "./AboutSection";

interface SettingsPageProps {
  settings: Settings;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  onClose: () => void;
  updater: ReturnType<typeof useUpdater>;
  initialSection?: Section;
}

export function SettingsPage({
  settings,
  setSetting,
  onClose,
  updater,
  initialSection,
}: SettingsPageProps) {
  const [activeSection, setActiveSection] = useState<Section>(
    initialSection || "reading",
  );

  return (
    <div className="flex h-full">
      <SettingsNav
        activeSection={activeSection}
        onSelect={setActiveSection}
        onClose={onClose}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[560px] px-8 pt-12 pb-16">
          <h2
            className="mb-12 text-[length:var(--text-2xl)] font-light text-[var(--color-text-primary)]"
          >
            Settings
          </h2>

          {activeSection === "reading" && (
            <ReadingSection settings={settings} setSetting={setSetting} />
          )}
          {activeSection === "writing" && (
            <WritingSection
              settings={settings}
              setSetting={setSetting}
              onOpenCorrections={() => setActiveSection("style-memory")}
            />
          )}
          {activeSection === "style-memory" && <StyleMemorySection />}
          {activeSection === "integrations" && <IntegrationsSection />}
          {activeSection === "about" && <AboutSection updater={updater} />}
        </div>
      </div>
    </div>
  );
}
