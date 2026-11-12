import { SectionHeader } from "./SectionHeader";
import { SettingsCard } from "./SettingsCard";

const PROMPTS = [
  "Summarize my highlights from [document title]",
  "Add a margin note to this passage: \"…\"",
  "Search my library for articles about [topic]",
  "Show me my writing corrections",
  "Highlight every mention of [concept] in [document]",
];

export function HelpSection() {
  return (
    <div className="flex flex-col gap-4">
      <SettingsCard>
        <SectionHeader title="Using Margin with Claude" />

        <p className="mt-3 text-[length:var(--text-sm)] text-[var(--color-text-secondary)] leading-relaxed">
          Margin's MCP server lets Claude read your library, create highlights,
          add margin notes, and work with your writing corrections — all from
          a conversation.
        </p>

        <div className="mt-5 flex flex-col gap-4">
          <div>
            <p className="text-[length:var(--text-sm)] font-semibold text-[var(--color-text-primary)]">
              Agent name
            </p>
            <code className="mt-1 inline-block rounded-[var(--radius-sm)] bg-[var(--color-surface-subtle)] px-2 py-0.5 text-[length:var(--text-sm)] font-mono text-[var(--color-text-primary)]">
              margin
            </code>
          </div>

          <div>
            <p className="text-[length:var(--text-sm)] font-semibold text-[var(--color-text-primary)]">
              Claude Desktop
            </p>
            <p className="mt-0.5 text-[length:var(--text-sm)] text-[var(--color-text-secondary)]">
              Go to <span className="font-medium">Settings → Integrations</span> and
              toggle on Claude Desktop. Restart Claude if it was already running.
            </p>
          </div>

          <div>
            <p className="text-[length:var(--text-sm)] font-semibold text-[var(--color-text-primary)]">
              Claude Code
            </p>
            <p className="mt-0.5 text-[length:var(--text-sm)] text-[var(--color-text-secondary)]">
              Copy the config from{" "}
              <span className="font-medium">Settings → Integrations</span> and
              paste it into{" "}
              <code className="rounded bg-[var(--color-surface-subtle)] px-1 py-px font-mono text-[length:11px]">
                ~/.claude.json
              </code>
              , then restart Claude Code.
            </p>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard>
        <SectionHeader title="Writing agent" />

        <p className="mt-3 text-[length:var(--text-sm)] text-[var(--color-text-secondary)] leading-relaxed">
          The Margin Editor is a multi-round writing assistant. You read and
          annotate in Margin, export to Claude Code, and the agent applies your
          corrections to the file. Re-annotate, export again, and it refines
          until your writing converges.
        </p>

        <div className="mt-4 flex flex-col gap-2">
          <p className="text-[length:var(--text-sm)] font-semibold text-[var(--color-text-primary)]">
            Launch from Claude Code
          </p>
          <code className="inline-block rounded-[var(--radius-sm)] bg-[var(--color-surface-subtle)] px-2.5 py-1.5 text-[length:var(--text-sm)] font-mono text-[var(--color-text-primary)]">
            claude --agent margin-editor
          </code>
          <p className="text-[length:var(--text-xs)] text-[var(--color-text-secondary)]">
            Requires the MCP server to be configured (see above).
          </p>
        </div>
      </SettingsCard>

      <SettingsCard>
        <SectionHeader title="Example prompts" />

        <ul className="mt-3 flex flex-col gap-2">
          {PROMPTS.map((prompt) => (
            <li
              key={prompt}
              className="rounded-[var(--radius-sm)] bg-[var(--color-surface-subtle)] px-3 py-2 text-[length:var(--text-sm)] text-[var(--color-text-secondary)] leading-relaxed"
            >
              "{prompt}"
            </li>
          ))}
        </ul>
      </SettingsCard>
    </div>
  );
}
