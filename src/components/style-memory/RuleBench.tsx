import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import type { WritingRule } from "@/lib/tauri-commands";
import { FIELD_CLASS, LINK_BUTTON_CLASS, SERIF, plural } from "./controls";
import { scanDraft } from "./rules-bench";

const SAMPLE =
  "Hope you're doing well! I just wanted to share how teams leverage Margin to build a writing profile. It isn't just a reading app, it's a coach that really learns your taste.";

/**
 * "Try your rules": paste a draft and see what the writing guard would do with
 * it. Hard rules underline in red; preferences with a pattern underline dotted.
 */
export function RuleBench({ rules, onClose }: { rules: WritingRule[]; onClose: () => void }) {
  const [text, setText] = useState(SAMPLE);
  const result = useMemo(() => scanDraft(text, rules), [text, rules]);
  const byId = useMemo(() => new Map(rules.map((r) => [r.id, r])), [rules]);

  // Draw non-overlapping hits in reading order.
  const pieces: React.ReactNode[] = [];
  let pos = 0;
  result.hits.forEach((h, i) => {
    if (h.start < pos) return;
    pieces.push(text.slice(pos, h.start));
    pieces.push(
      <mark
        key={i}
        title={byId.get(h.ruleId)?.ruleText}
        className={cn(
          "bg-transparent text-inherit underline underline-offset-4",
          h.kind === "hard"
            ? "decoration-[var(--color-danger)] decoration-wavy decoration-[1.5px]"
            : "decoration-[var(--color-success)] decoration-dotted decoration-2",
        )}
      >
        {text.slice(h.start, h.end)}
      </mark>,
    );
    pos = h.end;
  });
  pieces.push(text.slice(pos));

  const firing = [...new Set(result.hits.map((h) => h.ruleId))].map((id) => byId.get(id)).filter((r): r is WritingRule => !!r);
  const hard = result.hardRuleIds.length;
  const soft = result.softFamilies.length;

  return (
    <div className="mb-6 max-w-[980px] rounded-[var(--radius-md)] border border-[var(--color-border)] p-4" aria-label="Try your rules" role="region">
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <p className="text-[length:var(--text-sm)] font-medium text-[var(--color-text-primary)]">
          Try your rules on a draft
        </p>
        <button type="button" onClick={onClose} className={LINK_BUTTON_CLASS}>
          Close
        </button>
      </div>
      <p className="mb-3 text-[length:var(--text-xs)] text-[var(--color-text-secondary)]">
        Paste anything Claude wrote. This shows what Margin's automatic check would catch. Rules without a pattern still reach Claude; they just can't be checked here.
      </p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <textarea
          aria-label="Draft to check"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          className={cn(FIELD_CLASS, SERIF, "resize-y text-[length:var(--text-base)] leading-[1.6]")}
        />
        <div
          aria-label="Draft with rule hits marked"
          className={cn(SERIF, "whitespace-pre-wrap rounded-[var(--radius-sm)] bg-[var(--color-sidebar)] px-3 py-2 text-[length:var(--text-base)] leading-[1.7] text-[var(--color-text-primary)]")}
        >
          {pieces}
        </div>
      </div>
      <p
        role="status"
        className={cn(
          "mt-3 rounded-[var(--radius-sm)] px-3 py-2 text-[length:var(--text-sm)]",
          result.wouldBlock
            ? "bg-[var(--color-severity-must-fix-bg)] text-[var(--color-severity-must-fix-text)]"
            : "bg-[var(--color-severity-nice-to-fix-bg)] text-[var(--color-severity-nice-to-fix-text)]",
        )}
      >
        {rules.length === 0
          ? "No rules yet."
          : result.wouldBlock
            ? `In a published piece, Margin would stop this save and send it back to Claude${hard ? ` (${plural(hard, "hard rule", "hard rules")} broken)` : ` (${soft} kinds of AI tell together)`}. Anywhere else it warns Claude instead.`
            : firing.length > 0
              ? `Nothing here would be stopped. Claude would be warned about ${plural(firing.length, "rule", "rules")}.`
              : "Nothing here breaks a rule Margin can check."}
      </p>
      {firing.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 text-[length:var(--text-xs)] text-[var(--color-text-secondary)]">
          {firing.map((r) => (
            <li key={r.id}>
              {result.hardRuleIds.includes(r.id) ? (
                <span className="text-[var(--color-severity-must-fix-text)]">Stops the save</span>
              ) : (
                <span className="text-[var(--color-severity-nice-to-fix-text)]">Warns Claude</span>
              )}
              {" · "}
              {r.ruleText}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
