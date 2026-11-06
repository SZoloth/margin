import { useState } from "react";
import type { Settings } from "@/hooks/useSettings";
import type { useUpdater } from "@/hooks/useUpdater";
import { SettingsNav, SECTIONS, type Section } from "./SettingsNav";
import { ReadingSection } from "./ReadingSection";
import { WritingSection } from "./WritingSection";
import { StyleMemorySection } from "./StyleMemorySection";
import { IntegrationsSection } from "./IntegrationsSection";
import { AboutSection } from "./AboutSection";
import { HelpSection } from "./HelpSection";
import { DashboardSection } from "@/components/dashboard/DashboardSection";

interface SettingsPageProps {
  settings: Settings;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  onClose: () => void;
  updater: ReturnType<typeof useUpdater>;
  initialSection?: Section;
  onAcceptEdit?: (
    highlightId: string,
    matchText: string,
    suggestedEdit: string,
  ) => boolean | Promise<boolean>;
}

export function SettingsPage({
  settings,
  setSetting,
  onClose,
  updater,
  initialSection,
  onAcceptEdit,
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
        {activeSection === "style-memory" ? (
          <StyleMemorySection
            onAcceptEdit={onAcceptEdit}
            onOpenRuleTests={() => setActiveSection("dashboard")}
          />
        ) : activeSection === "dashboard" ? (
          <div className="flex flex-col">
            <div className="px-8 pt-6">
              <button
                type="button"
                onClick={() => setActiveSection("style-memory")}
                className="text-[length:var(--text-sm)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
              >
                <span aria-hidden="true">&larr;</span> Writing rules
              </button>
              <h2 className="mt-6 text-[length:var(--text-2xl)] font-light text-[var(--color-text-primary)]">
                Test your rules against Claude
              </h2>
              <p className="mt-2 max-w-[560px] text-[length:var(--text-sm)] text-[var(--color-text-secondary)]">
                Claude writes the same pieces with and without your rules, and Margin scores each
                version against them.
              </p>
            </div>
            <DashboardSection />
          </div>
        ) : (
          // Same column and title as Writing rules, so every page reads as
          // one app: the section's own name, left-aligned.
          <div className="max-w-[640px] px-8 pt-12 pb-16">
            <h2 className="mb-8 text-[length:var(--text-2xl)] font-light text-[var(--color-text-primary)]">
              {SECTIONS.find((s) => s.id === (activeSection === "writing" ? "reading" : activeSection))?.label}
            </h2>

            {(activeSection === "reading" || activeSection === "writing") && (
              <div className="flex flex-col gap-4">
                <ReadingSection settings={settings} setSetting={setSetting} />
                <WritingSection settings={settings} setSetting={setSetting} />
              </div>
            )}
            {activeSection === "integrations" && <IntegrationsSection />}
            {activeSection === "help" && <HelpSection />}
            {activeSection === "about" && <AboutSection updater={updater} />}
          </div>
        )}
      </div>
    </div>
  );
}
