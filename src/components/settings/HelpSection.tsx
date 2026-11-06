import { SectionHeader } from "./SectionHeader";
import { SettingsCard } from "./SettingsCard";

const STEPS: { title: string; body: string }[] = [
  {
    title: "Mark what bothers you",
    body: "Highlight a phrase in anything you read and say what's wrong with it. A word you never want to see again can become a Hard rule on the spot.",
  },
  {
    title: "Turn notes into rules",
    body: "Margin groups your notes into suggested rules under Writing rules. Accept the ones that sound like you.",
  },
  {
    title: "Claude follows them",
    body: "With the writing guard on, Claude Code can't save writing that breaks a Hard rule, and it reads your Preferences before it writes.",
  },
];

const PROMPTS = [
  "Summarize my highlights from [document title]",
  "Add a margin note to the second paragraph of [document]",
  "Search my library for articles about [topic]",
  "What have I been correcting lately?",
  "Highlight every mention of [concept] in [document]",
];

const BODY = "text-[length:var(--text-sm)] leading-relaxed text-[var(--color-text-secondary)]";

export function HelpSection() {
  return (
    <div className="flex flex-col gap-4">
      <SettingsCard>
        <SectionHeader title="How Margin learns your style" />
        <ol className="mt-4 flex flex-col gap-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-3">
              <span className="mt-px w-4 shrink-0 text-[length:var(--text-sm)] tabular-nums text-[var(--color-text-tertiary)]">
                {i + 1}
              </span>
              <div>
                <p className="text-[length:var(--text-sm)] font-medium text-[var(--color-text-primary)]">{step.title}</p>
                <p className={`mt-0.5 ${BODY}`}>{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </SettingsCard>

      <SettingsCard>
        <SectionHeader title="Connect Claude" />
        <p className={`mt-3 ${BODY}`}>
          Turn on Claude Desktop or copy the Claude Code config under{" "}
          <span className="font-medium text-[var(--color-text-primary)]">Integrations</span>, then restart
          Claude. After that, Claude can read your library, add highlights and notes, and see your rules
          when you ask it to.
        </p>
      </SettingsCard>

      <SettingsCard>
        <SectionHeader title="Things to ask Claude" />
        <ul className="mt-3 flex flex-col gap-2">
          {PROMPTS.map((prompt) => (
            <li
              key={prompt}
              className="rounded-[var(--radius-sm)] bg-[var(--color-surface-subtle)] px-3 py-2 text-[length:var(--text-sm)] leading-relaxed text-[var(--color-text-secondary)]"
            >
              “{prompt}”
            </li>
          ))}
        </ul>
      </SettingsCard>
    </div>
  );
}
