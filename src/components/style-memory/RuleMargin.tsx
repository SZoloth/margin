import { useCallback, useEffect, useId, useState } from "react";
import { cn } from "@/lib/cn";
import type { WritingRule } from "@/lib/tauri-commands";
import type { CorrectionDetail } from "@/types/annotations";
import {
  BUTTON_PRIMARY_CLASS,
  BUTTON_SECONDARY_CLASS,
  FIELD_CLASS,
  FOCUS_RING,
  LINK_BUTTON_CLASS,
  SERIF,
  plural,
} from "./controls";
import {
  STRICTNESS_HELP,
  STRICTNESS_LABEL,
  type Strictness,
  formatDate,
  isChecked,
  isSuggested,
  provenance,
  severityFor,
  sourceNoteIds,
  strictnessOf,
  typeLabel,
} from "./rules-model";

const KIND_LABEL = "text-[length:var(--text-xs)] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-secondary)]";

/** Hard rule / Preference, with what the choice means said right under it. */
export function StrictnessControl({
  value,
  onChange,
  idPrefix,
}: {
  value: Strictness;
  onChange: (s: Strictness) => void;
  idPrefix?: string;
}) {
  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Strictness"
        className="inline-flex overflow-hidden rounded-[var(--radius-pill)] border border-[var(--color-border)]"
      >
        {(["hard", "preference"] as const).map((s) => {
          const on = value === s;
          return (
            <button
              key={s}
              id={idPrefix ? `${idPrefix}-${s}` : undefined}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(s)}
              className={cn(
                "cursor-pointer px-3 py-0.5 text-[length:var(--text-xs)] transition-colors duration-100",
                FOCUS_RING,
                on
                  ? s === "hard"
                    ? "bg-[var(--color-severity-must-fix-bg)] font-semibold text-[var(--color-severity-must-fix-text)]"
                    : "bg-[var(--color-severity-nice-to-fix-bg)] font-semibold text-[var(--color-severity-nice-to-fix-text)]"
                  : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
              )}
            >
              {STRICTNESS_LABEL[s]}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[length:var(--text-xs)] leading-[1.45] text-[var(--color-text-secondary)]">
        {STRICTNESS_HELP[value]}
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: (id: string) => React.ReactNode }) {
  const id = `rule-field-${useId()}`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[length:var(--text-xs)] font-medium text-[var(--color-text-secondary)]">
        {label}
      </label>
      {children(id)}
    </div>
  );
}

function EditForm({
  rule,
  onSave,
  onCancel,
}: {
  rule: WritingRule;
  onSave: (updates: Partial<WritingRule>) => Promise<void>;
  onCancel: () => void;
}) {
  const [f, setF] = useState({
    ruleText: rule.ruleText,
    strictness: strictnessOf(rule.severity),
    whenToApply: rule.whenToApply ?? "",
    why: rule.why ?? "",
    exampleBefore: rule.exampleBefore ?? "",
    exampleAfter: rule.exampleAfter ?? "",
  });
  const set = (key: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((prev) => ({ ...prev, [key]: e.target.value }));

  const save = useCallback(async () => {
    if (!f.ruleText.trim()) return;
    try {
      await onSave({
        ruleText: f.ruleText.trim(),
        severity: severityFor(f.strictness, rule.severity),
        whenToApply: f.whenToApply || null,
        why: f.why || null,
        exampleBefore: f.exampleBefore || null,
        exampleAfter: f.exampleAfter || null,
      });
    } catch {
      // The parent reports the error; keep the form open so nothing typed is lost.
    }
  }, [f, onSave, rule.severity]);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onCancel();
        } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          void save();
        }
      }}
    >
      <Field label="Rule">
        {(id) => <textarea id={id} autoFocus rows={2} value={f.ruleText} onChange={set("ruleText")} className={cn(FIELD_CLASS, "resize-none")} />}
      </Field>
      <StrictnessControl value={f.strictness} onChange={(s) => setF((prev) => ({ ...prev, strictness: s }))} />
      <Field label="When it applies">
        {(id) => <input id={id} value={f.whenToApply} onChange={set("whenToApply")} className={FIELD_CLASS} />}
      </Field>
      <Field label="Why">
        {(id) => <textarea id={id} rows={2} value={f.why} onChange={set("why")} className={cn(FIELD_CLASS, "resize-none")} />}
      </Field>
      <Field label="Instead of">
        {(id) => <input id={id} value={f.exampleBefore} onChange={set("exampleBefore")} className={FIELD_CLASS} />}
      </Field>
      <Field label="Write">
        {(id) => <input id={id} value={f.exampleAfter} onChange={set("exampleAfter")} className={FIELD_CLASS} />}
      </Field>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={!f.ruleText.trim()} className={BUTTON_PRIMARY_CLASS}>
          Save
        </button>
        <button type="button" onClick={onCancel} className={BUTTON_SECONDARY_CLASS}>
          Cancel
        </button>
        <span className="text-[length:var(--text-xs)] text-[var(--color-text-secondary)]">⌘↵ saves</span>
      </div>
    </form>
  );
}

/**
 * The margin beside the style guide. With nothing selected it explains the two
 * kinds of rule; with a rule selected it answers "why does this rule exist?"
 * with the notes that produced it, and holds every action on that rule.
 */
export function RuleMargin({
  rule,
  notesById,
  editing,
  onEditingChange,
  onUpdate,
  onAccept,
  onArchive,
}: {
  rule: WritingRule | null;
  notesById: Map<string, CorrectionDetail>;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onUpdate: (id: string, updates: Partial<WritingRule>) => Promise<void>;
  onAccept: (id: string) => void;
  onArchive: (id: string) => void;
}) {
  useEffect(() => {
    if (!rule) onEditingChange(false);
  }, [rule, onEditingChange]);

  if (!rule) {
    return (
      <div className="flex flex-col gap-4 text-[length:var(--text-sm)] leading-[1.5] text-[var(--color-text-secondary)]">
        <p>Select a rule to see the notes behind it, change how strict it is, or edit it.</p>
        <dl className="flex flex-col gap-3">
          {(["hard", "preference"] as const).map((s) => (
            <div key={s}>
              <dt
                className={cn(
                  "text-[length:var(--text-xs)] font-semibold uppercase tracking-[0.08em]",
                  s === "hard" ? "text-[var(--color-severity-must-fix-text)]" : "text-[var(--color-severity-nice-to-fix-text)]",
                )}
              >
                {STRICTNESS_LABEL[s]}
              </dt>
              <dd className="m-0">{STRICTNESS_HELP[s]}</dd>
            </div>
          ))}
          <div>
            <dt className="text-[length:var(--text-xs)] font-semibold uppercase tracking-[0.08em] text-[var(--color-success)]">
              Suggested
            </dt>
            <dd className="m-0">Drafted by Claude from your notes. Nothing reaches Claude until you accept it.</dd>
          </div>
        </dl>
      </div>
    );
  }

  const suggested = isSuggested(rule);
  const ids = sourceNoteIds(rule.notes);
  const sourceNotes = ids.map((id) => notesById.get(id)).filter((c): c is CorrectionDetail => !!c);

  if (editing) {
    return (
      <EditForm
        key={rule.id}
        rule={rule}
        onCancel={() => onEditingChange(false)}
        onSave={async (updates) => {
          await onUpdate(rule.id, updates);
          onEditingChange(false);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 text-[length:var(--text-sm)]">
      <div>
        <div className={KIND_LABEL}>{suggested ? "Suggested by Claude" : "Rule"}</div>
        <p className={cn(SERIF, "mt-1 text-[length:var(--text-lg)] leading-[1.4] text-[var(--color-text-primary)]")}>
          {rule.ruleText}
        </p>
      </div>

      <StrictnessControl
        value={strictnessOf(rule.severity)}
        onChange={(s) => {
          if (s !== strictnessOf(rule.severity)) void onUpdate(rule.id, { severity: severityFor(s, rule.severity) }).catch(() => {});
        }}
      />

      {!suggested && (
        <p className="text-[length:var(--text-xs)] leading-[1.45] text-[var(--color-text-secondary)]">
          {isChecked(rule)
            ? "Checked automatically: Margin scans Claude's drafts for this."
            : "Claude is told this rule; nothing checks for it automatically."}
        </p>
      )}

      {(rule.whenToApply || rule.why) && (
        <div className="flex flex-col gap-1 leading-[1.45] text-[var(--color-text-secondary)]">
          {rule.whenToApply && (
            <p>
              <span className="font-medium text-[var(--color-text-primary)]">When: </span>
              {rule.whenToApply}
            </p>
          )}
          {rule.why && (
            <p>
              <span className="font-medium text-[var(--color-text-primary)]">Why: </span>
              {rule.why}
            </p>
          )}
        </div>
      )}

      {(rule.exampleBefore || rule.exampleAfter) && rule.category !== "heading-patterns" && (
        <div className={cn(SERIF, "rounded-[var(--radius-sm)] bg-[var(--color-sidebar)] px-3 py-2 text-[length:var(--text-base)] leading-[1.5]")}>
          {rule.exampleBefore && (
            <span className="text-[var(--color-danger)] line-through decoration-[color-mix(in_srgb,var(--color-danger)_30%,transparent)]">
              {rule.exampleBefore}
            </span>
          )}
          {rule.exampleBefore && rule.exampleAfter && <span className="mx-1 text-[var(--color-text-secondary)]">&rarr;</span>}
          {rule.exampleAfter && <span className="text-[var(--color-success)]">{rule.exampleAfter}</span>}
        </div>
      )}

      <div>
        <div className={KIND_LABEL}>Why this rule exists</div>
        {sourceNotes.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-3">
            {sourceNotes.map((n) => (
              <li key={n.highlightId}>
                <q className={cn(SERIF, "block italic leading-[1.4] text-[var(--color-text-secondary)]")}>{n.originalText}</q>
                {n.notes.length > 0 && (
                  <p className={cn(SERIF, "text-[length:var(--text-base)] leading-[1.4] text-[var(--color-text-primary)]")}>
                    {n.notes.join("; ")}
                  </p>
                )}
                {n.documentTitle && (
                  <p className="text-[length:var(--text-xs)] text-[var(--color-text-tertiary)]">in {n.documentTitle}</p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 leading-[1.45] text-[var(--color-text-secondary)]">
            {rule.source === "seed"
              ? "It came from a style guide you added."
              : rule.source === "manual"
                ? "You added it yourself."
                : `${provenance(rule)}. Margin didn't record which ones.`}
          </p>
        )}
      </div>

      <p className="text-[length:var(--text-xs)] text-[var(--color-text-secondary)]">
        For {typeLabel(rule.writingType).toLowerCase()} · Added {formatDate(rule.createdAt)}
        {sourceNotes.length > 0 && ` · ${plural(sourceNotes.length, "note", "notes")}`}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {suggested ? (
          <>
            <button type="button" onClick={() => onAccept(rule.id)} className={BUTTON_PRIMARY_CLASS}>
              Accept
            </button>
            <button type="button" onClick={() => onArchive(rule.id)} className={BUTTON_SECONDARY_CLASS}>
              Decline
            </button>
            <button type="button" onClick={() => onEditingChange(true)} className={LINK_BUTTON_CLASS}>
              Edit first
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => onEditingChange(true)} className={BUTTON_SECONDARY_CLASS}>
              Edit
            </button>
            <button type="button" onClick={() => onArchive(rule.id)} className={LINK_BUTTON_CLASS}>
              Archive
            </button>
          </>
        )}
      </div>
      <p className="text-[length:var(--text-xs)] text-[var(--color-text-tertiary)]">
        Keys: ↑ ↓ move · {suggested ? "A accept · D decline · " : ""}H hard rule or preference · E edit
      </p>
    </div>
  );
}
