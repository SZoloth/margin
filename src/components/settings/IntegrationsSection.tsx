import { useEffect, useState, useCallback, useRef } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useCopyFeedback } from "@/hooks/useCopyFeedback";
import { SectionHeader } from "./SectionHeader";
import { SettingsCard } from "./SettingsCard";
import { SettingRow } from "./SettingRow";
import { SettingsButton } from "./SettingsButton";
import { ToggleSwitch } from "./ToggleSwitch";
import {
  isMcpEnabledInClaude,
  enableMcpInClaude,
  disableMcpInClaude,
  checkMcpConnection,
} from "@/lib/mcp-bridge";

const CLAUDE_CODE_SNIPPET = `{
  "mcpServers": {
    "margin": {
      "command": "node",
      "args": ["/Applications/Margin.app/Contents/Resources/mcp/dist/index.js"]
    }
  }
}`;

export function IntegrationsSection() {
  const [enabled, setEnabled] = useState(false);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showSnippet, setShowSnippet] = useState(false);
  const savingRef = useRef(false);
  const { copied, triggerCopied } = useCopyFeedback();

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([isMcpEnabledInClaude(), checkMcpConnection()]).then(
      ([enabledRes, connectedRes]) => {
        if (cancelled) return;
        setEnabled(enabledRes.status === "fulfilled" && enabledRes.value);
        setConnected(connectedRes.status === "fulfilled" && connectedRes.value);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggle = useCallback(async (next: boolean) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setEnabled(next);
    try {
      if (next) {
        await enableMcpInClaude();
      } else {
        await disableMcpInClaude();
      }
      const nowConnected = await checkMcpConnection();
      setConnected(nowConnected);
    } catch {
      setEnabled(!next);
    } finally {
      savingRef.current = false;
    }
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await writeText(CLAUDE_CODE_SNIPPET);
      triggerCopied();
    } catch {
      // clipboard write failed
    }
  }, [triggerCopied]);

  return (
    <div className="flex flex-col gap-2">
      <SettingsCard>
        <SectionHeader title="Integrations" />

        <p className="mt-2 mb-2 text-[length:var(--text-sm)] text-[var(--color-text-secondary)]">
          Connect Margin to Claude for AI-assisted reading and writing
        </p>

        {!loading && (
          <>
            <SettingRow
              label="Claude Desktop"
              description="Auto-configured — toggle to enable or disable"
            >
              <ToggleSwitch checked={enabled} onChange={handleToggle} />
            </SettingRow>

            {enabled && (
              <div className="flex items-center gap-1.5 pb-2 text-[length:var(--text-xs)] text-[var(--color-text-secondary)]">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{
                    backgroundColor: connected
                      ? "var(--color-success)"
                      : "var(--color-text-secondary)",
                  }}
                />
                {connected
                  ? "Connected"
                  : "Not connected \u2014 restart Claude to connect"}
              </div>
            )}

            <SettingRow
              label="Claude Code"
              description="Add to ~/.claude.json, then restart Claude Code"
            >
              <SettingsButton onClick={handleCopy}>
                {copied ? "Copied" : "Copy config"}
              </SettingsButton>
            </SettingRow>

            <div className="mt-1">
              <button
                type="button"
                onClick={() => setShowSnippet(!showSnippet)}
                className="cursor-pointer text-[length:var(--text-xs)] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors duration-150"
              >
                {showSnippet ? "Hide config" : "Show config"}
              </button>

              {showSnippet && (
                <pre className="mt-2 overflow-auto rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-2.5 text-[length:11px] leading-relaxed text-[var(--color-text-secondary)]">
                  {CLAUDE_CODE_SNIPPET}
                </pre>
              )}
            </div>
          </>
        )}
      </SettingsCard>
    </div>
  );
}
