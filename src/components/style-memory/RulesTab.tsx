import { useEffect, useState, useCallback, useRef, useMemo, useId } from "react";
import { cn } from "@/lib/cn";
import { WRITING_TYPES } from "@/lib/writing-types";
import type { WritingRule, WritingRuleSeverity } from "@/lib/tauri-commands";
import { reportError } from "@/lib/error-bus";
import {
  getWritingRules,
  updateWritingRule,
  deleteWritingRule,
  exportWritingRules,
  markRulesReviewed,
  getArchivedWritingRules,
  unarchiveWritingRule,
} from "@/lib/tauri-commands";
import {
  BUTTON_PRIMARY_CLASS,
  BUTTON_SECONDARY_CLASS,
  Chevron,
  Chip,
  EmptyState,
  FIELD_CLASS,
  FOCUS_RING,
  LINK_BUTTON_CLASS,
  SEARCH_CLASS,
  SlashHint,
  plural,
} from "./controls";
import { StyleGuideImport } from "./StyleGuideImport";

/**
 * "suggested": rules Claude proposed from your notes. They do nothing until
 * accepted (the CLI excludes unreviewed synthesis candidates from every export).
 * "rules": everything else. These are what Claude follows.
 */
export type RulesMode = "suggested" | "rules";

export interface RuleCounts {
  inEffect: number;
  suggested: number;
}

interface RulesTabProps {
  mode?: RulesMode;
  onStatsChange: (counts: RuleCounts) => void;
}

/** Mirrors the export gate in cli/db/rules.go (unreviewedCandidateFilter). */
export function isSuggested(rule: Pick<WritingRule, "source" | "reviewedAt">): boolean {
  return rule.source === "synthesis-candidate" && rule.reviewedAt == null;
}

export function countRules(rules: WritingRule[]): RuleCounts {
  let suggested = 0;
  for (const r of rules) if (isSuggested(r)) suggested += 1;
  return { inEffect: rules.length - suggested, suggested };
}

const SEVERITY_VALUES: WritingRuleSeverity[] = ["must-fix", "should-fix", "nice-to-fix"];

const SEVERITY_LABELS: Record<WritingRuleSeverity, string> = {
  "must-fix": "Must fix",
  "should-fix": "Should fix",
  "nice-to-fix": "Nice to fix",
};

function SeverityBadge({ severity }: { severity: string }) {
  const key = (SEVERITY_VALUES.includes(severity as WritingRuleSeverity)
    ? severity
    : "should-fix") as WritingRuleSeverity;

  return (
    <span
      data-severity-badge
      style={{
        padding: "1px 8px",
        fontSize: "var(--text-xs)",
        fontWeight: 500,
        borderRadius: 100,
        flexShrink: 0,
        whiteSpace: "nowrap",
        background: `var(--color-severity-${key}-bg)`,
        color: `var(--color-severity-${key}-text)`,
        borderColor: `var(--color-severity-${key}-border)`,
        borderWidth: 1,
        borderStyle: "solid",
      }}
    >
      {SEVERITY_LABELS[key]}
    </span>
  );
}

type SortKey = "signal" | "newest";

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: (id: string) => React.ReactNode;
  className?: string;
}) {
  const id = `rule-field-${useId()}`;
  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="text-[length:var(--text-xs)] font-medium text-[var(--color-text-secondary)]"
      >
        {label}
      </label>
      {children(id)}
    </div>
  );
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function typeLabel(value: string): string {
  if (value === "general") return "All writing";
  return WRITING_TYPES.find((t) => t.value === value)?.label ?? value;
}

/** Where a rule came from, in the user's words rather than the source column. */
function provenance(rule: WritingRule): string {
  if (rule.source === "seed") return "From your style guide";
  if (rule.source === "manual") return "Added by you";
  return `From ${plural(rule.signalCount, "note", "notes")}`;
}

function matchesQuery(rule: WritingRule, q: string): boolean {
  if (!q) return true;
  const hay = [
    rule.ruleText,
    rule.whenToApply,
    rule.why,
    rule.category,
    rule.notes,
    rule.exampleBefore,
    rule.exampleAfter,
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
  return hay.includes(q);
}

/**
 * One rule is one line until you ask for more. Opening it reveals the reason,
 * the example and the actions in place (gradual revelation); nothing else on
 * the page moves. Only one rule is open at a time.
 */
function RuleRow({
  rule,
  suggested,
  open,
  instant,
  selected,
  selecting,
  onToggle,
  onToggleSelect,
  onUpdate,
  onArchive,
  onAccept,
}: {
  rule: WritingRule;
  suggested: boolean;
  open: boolean;
  /** Opened from the keyboard: the result should already be there. */
  instant: boolean;
  selected: boolean;
  selecting: boolean;
  onToggle: (id: string, viaKeyboard: boolean) => void;
  onToggleSelect: (id: string) => void;
  onUpdate: (id: string, updates: Partial<WritingRule>) => Promise<void>;
  onArchive: (id: string) => void;
  onAccept: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const initialFields = useCallback(
    () => ({
      ruleText: rule.ruleText,
      severity: rule.severity,
      whenToApply: rule.whenToApply ?? "",
      why: rule.why ?? "",
      exampleBefore: rule.exampleBefore ?? "",
      exampleAfter: rule.exampleAfter ?? "",
      notes: rule.notes ?? "",
    }),
    [rule],
  );
  const [editFields, setEditFields] = useState(initialFields);

  const handleSave = useCallback(async () => {
    if (!editFields.ruleText.trim()) return;
    try {
      await onUpdate(rule.id, {
        ruleText: editFields.ruleText.trim(),
        severity: editFields.severity as WritingRule["severity"],
        whenToApply: editFields.whenToApply || undefined,
        why: editFields.why || undefined,
        exampleBefore: editFields.exampleBefore || undefined,
        exampleAfter: editFields.exampleAfter || undefined,
        notes: editFields.notes || undefined,
      } as Partial<WritingRule>);
      setEditing(false);
    } catch {
      // Parent already logs; keep editing open so user can retry
    }
  }, [rule.id, editFields, onUpdate]);

  const handleCancel = useCallback(() => {
    setEditFields(initialFields());
    setEditing(false);
  }, [initialFields]);

  const set = (key: keyof typeof editFields) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => setEditFields((f) => ({ ...f, [key]: e.target.value }));

  const enforced = !!rule.detectionPattern;
  const expanded = open || editing;

  return (
    <div className="group border-b border-[var(--color-border)]">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          aria-label={`Select rule: ${rule.ruleText}`}
          checked={selected}
          onChange={() => onToggleSelect(rule.id)}
          className={cn(
            "shrink-0 cursor-pointer transition-opacity duration-100",
            selected || selecting
              ? "opacity-100"
              : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100",
          )}
          style={{ accentColor: "var(--color-text-primary)" }}
        />
        <button
          type="button"
          aria-expanded={expanded}
          onClick={(e) => onToggle(rule.id, e.detail === 0)}
          className={cn(
            "flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-[var(--radius-xs)] py-3 text-left",
            FOCUS_RING,
          )}
        >
          <span
            className={cn(
              "min-w-0 flex-1 text-[length:var(--text-sm)] font-medium leading-[1.4] text-[var(--color-text-primary)]",
              !expanded && "truncate",
            )}
          >
            {rule.ruleText}
          </span>
          <SeverityBadge severity={rule.severity} />
          <Chevron open={expanded} />
        </button>
        {suggested && !editing && (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              aria-label={`Decline: ${rule.ruleText}`}
              onClick={() => onArchive(rule.id)}
              className={BUTTON_SECONDARY_CLASS}
            >
              Decline
            </button>
            <button
              type="button"
              aria-label={`Accept: ${rule.ruleText}`}
              onClick={() => onAccept(rule.id)}
              className={BUTTON_PRIMARY_CLASS}
            >
              Accept
            </button>
          </div>
        )}
      </div>

      {expanded && !editing && (
        <div data-room data-instant={instant || undefined} className="rule-room pb-4 pl-6 pr-6">
          {rule.whenToApply && (
            <p className="mb-1 text-[length:var(--text-sm)] leading-[1.4] text-[var(--color-text-secondary)]">
              <span className="font-medium text-[var(--color-text-primary)]">When: </span>
              {rule.whenToApply}
            </p>
          )}
          {rule.why && (
            <p className="mb-1 text-[length:var(--text-sm)] leading-[1.4] text-[var(--color-text-secondary)]">
              <span className="font-medium text-[var(--color-text-primary)]">Why: </span>
              {rule.why}
            </p>
          )}

          {(rule.exampleBefore || rule.exampleAfter) && (
            <div className="mt-2 rounded-[var(--radius-sm)] bg-[var(--color-sidebar)] px-3 py-2 text-[length:var(--text-sm)] leading-[1.5]">
              {rule.exampleBefore && (
                <span className="text-[var(--color-danger)] line-through decoration-[color-mix(in_srgb,var(--color-danger)_30%,transparent)]">
                  {rule.exampleBefore}
                </span>
              )}
              {rule.exampleBefore && rule.exampleAfter && (
                <span className="mx-1 text-[var(--color-text-secondary)]">&rarr;</span>
              )}
              {rule.exampleAfter && <span className="text-[var(--color-success)]">{rule.exampleAfter}</span>}
            </div>
          )}

          <p className="mt-2 text-[length:var(--text-xs)] text-[var(--color-text-secondary)]">
            {provenance(rule)} · {typeLabel(rule.writingType)} · Added{" "}
            {formatDate(rule.createdAt)}
            {!suggested && (
              <>
                {" · "}
                <span
                  title={
                    enforced
                      ? "Claude can't save text that breaks this rule."
                      : "Claude is told this rule, but nothing stops a slip."
                  }
                >
                  {enforced ? "Blocked automatically" : "Guidance for Claude"}
                </span>
              </>
            )}
          </p>

          <div className="mt-2 flex gap-3">
            <button type="button" onClick={() => setEditing(true)} className={LINK_BUTTON_CLASS}>
              Edit
            </button>
            {!suggested && (
              <button type="button" onClick={() => onArchive(rule.id)} className={LINK_BUTTON_CLASS}>
                Archive
              </button>
            )}
          </div>
        </div>
      )}

      {editing && (
        <div
          data-room
          data-instant={instant || undefined}
          className="rule-room pb-4 pl-6 pr-6"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              handleCancel();
            } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void handleSave();
            }
          }}
        >
          <div className="flex flex-col gap-2">
            <Field label="Rule">
              {(id) => (
                <textarea id={id} rows={2} value={editFields.ruleText} onChange={set("ruleText")} className={cn(FIELD_CLASS, "resize-y")} autoFocus />
              )}
            </Field>
            <div className="flex gap-2">
              <Field label="How strict" className="flex-1">
                {(id) => (
                  <select id={id} value={editFields.severity} onChange={set("severity")} className={cn(FIELD_CLASS, "cursor-pointer")}>
                    {SEVERITY_VALUES.map((s) => (
                      <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="When it applies" className="flex-[2]">
                {(id) => <input id={id} value={editFields.whenToApply} onChange={set("whenToApply")} className={FIELD_CLASS} />}
              </Field>
            </div>
            <Field label="Why">
              {(id) => <input id={id} value={editFields.why} onChange={set("why")} className={FIELD_CLASS} />}
            </Field>
            <div className="flex gap-2">
              <Field label="Instead of" className="flex-1">
                {(id) => <input id={id} value={editFields.exampleBefore} onChange={set("exampleBefore")} className={FIELD_CLASS} />}
              </Field>
              <Field label="Write" className="flex-1">
                {(id) => <input id={id} value={editFields.exampleAfter} onChange={set("exampleAfter")} className={FIELD_CLASS} />}
              </Field>
            </div>
            <Field label="Private notes">
              {(id) => <textarea id={id} rows={2} value={editFields.notes} onChange={set("notes")} className={cn(FIELD_CLASS, "resize-y")} />}
            </Field>
            <div className="mt-1 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={!editFields.ruleText.trim()}
                className={cn(BUTTON_PRIMARY_CLASS, "px-3 text-[length:var(--text-sm)]")}
              >
                Save
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className={cn(BUTTON_SECONDARY_CLASS, "px-3 text-[length:var(--text-sm)]")}
              >
                Cancel
              </button>
              <span className="text-[length:var(--text-xs)] text-[var(--color-text-secondary)]">⌘↵ to save · Esc to cancel</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function groupByCategory(rules: WritingRule[]): Map<string, WritingRule[]> {
  const groups = new Map<string, WritingRule[]>();
  for (const r of rules) {
    const existing = groups.get(r.category);
    if (existing) {
      existing.push(r);
    } else {
      groups.set(r.category, [r]);
    }
  }
  return groups;
}

/** Category ids are pipeline vocabulary; these are the names a writer would use. */
const CATEGORY_LABELS: Record<string, string> = {
  "kill-words": "Words to cut",
  "ai-slop": "AI tells",
  "voice-calibration": "Voice",
};

function formatCategoryLabel(category: string): string {
  const known = CATEGORY_LABELS[category];
  if (known) return known;
  const s = category.replace(/-/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function RulesTab({ mode = "rules", onStatsChange }: RulesTabProps) {
  const suggestedMode = mode === "suggested";
  const [rules, setRules] = useState<WritingRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("signal");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openInstant, setOpenInstant] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [archivedRules, setArchivedRules] = useState<WritingRule[] | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [undo, setUndo] = useState<{ id: string; message: string } | null>(null);
  const syncTimeoutRef = useRef<number | null>(null);
  const undoTimeoutRef = useRef<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const loadedRef = useRef(false);

  const q = query.trim().toLowerCase();

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getWritingRules();
      setRules(data);
      setHasLoaded(true);
    } catch (err) {
      reportError("Could not load writing rules", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true;
      void loadRules();
    }
  }, [loadRules]);

  // Report only real counts: the empty array before the first load is not "zero rules".
  const [hasLoaded, setHasLoaded] = useState(false);
  useEffect(() => {
    if (hasLoaded) onStatsChange(countRules(rules));
  }, [rules, onStatsChange, hasLoaded]);

  useEffect(() => {
    return () => {
      if (syncTimeoutRef.current !== null) window.clearTimeout(syncTimeoutRef.current);
      if (undoTimeoutRef.current !== null) window.clearTimeout(undoTimeoutRef.current);
    };
  }, []);

  // "/" jumps to search, unless the user is already typing somewhere.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el as HTMLElement | null)?.isContentEditable) return;
      e.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const inMode = useMemo(
    () => rules.filter((r) => isSuggested(r) === suggestedMode),
    [rules, suggestedMode],
  );

  const typesPresent = useMemo(
    () => Array.from(new Set(inMode.map((r) => r.writingType))).sort(),
    [inMode],
  );

  const filtered = useMemo(() => {
    const list = inMode.filter((r) => {
      if (severityFilter && r.severity !== severityFilter) return false;
      if (typeFilter && r.writingType !== typeFilter) return false;
      return matchesQuery(r, q);
    });
    return list.sort((a, b) =>
      sort === "signal"
        ? b.signalCount - a.signalCount || b.createdAt - a.createdAt
        : b.createdAt - a.createdAt,
    );
  }, [inMode, severityFilter, typeFilter, q, sort]);

  const filteredArchived = useMemo(
    () => (archivedRules ?? []).filter((r) => matchesQuery(r, q)),
    [archivedRules, q],
  );

  const categoryGroups = useMemo(() => groupByCategory(filtered), [filtered]);

  const activeFilterCount = (severityFilter ? 1 : 0) + (typeFilter ? 1 : 0) + (sort !== "signal" ? 1 : 0);

  // Every change is mirrored to Claude's rules file automatically; say so once, quietly.
  const syncRules = useCallback(async (explicit: boolean) => {
    try {
      const result = await exportWritingRules();
      if (explicit) {
        setSyncStatus(`Sent ${plural(result.ruleCount, "rule", "rules")} to Claude`);
        if (syncTimeoutRef.current !== null) window.clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = window.setTimeout(() => setSyncStatus(null), 5000);
      }
    } catch (err) {
      reportError(
        explicit ? "Could not send rules to Claude" : "Rule saved, but Claude's copy didn't update",
        err,
      );
      if (explicit) setSyncStatus("Couldn't send rules");
    }
  }, []);

  const autoExportAfterRuleMutation = useCallback(() => syncRules(false), [syncRules]);

  const showUndo = useCallback((entry: { id: string; message: string }) => {
    setUndo(entry);
    if (undoTimeoutRef.current !== null) window.clearTimeout(undoTimeoutRef.current);
    undoTimeoutRef.current = window.setTimeout(() => setUndo(null), 8000);
  }, []);

  const dropSelection = useCallback((ids: string[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  }, []);

  const handleUpdate = useCallback(async (id: string, updates: Partial<WritingRule>) => {
    try {
      await updateWritingRule(id, {
        ruleText: updates.ruleText,
        severity: updates.severity,
        whenToApply: updates.whenToApply ?? undefined,
        why: updates.why ?? undefined,
        exampleBefore: updates.exampleBefore ?? undefined,
        exampleAfter: updates.exampleAfter ?? undefined,
        notes: updates.notes ?? undefined,
      });
      setRules((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...updates } : r)),
      );
      void autoExportAfterRuleMutation();
    } catch (err) {
      reportError("Could not update rule", err);
      throw err;
    }
  }, [autoExportAfterRuleMutation]);

  // Archiving is recoverable, so it happens in one step with an Undo, not a confirm.
  const archiveOne = useCallback(async (id: string): Promise<WritingRule | null> => {
    const moved = rules.find((r) => r.id === id) ?? null;
    try {
      await deleteWritingRule(id);
    } catch (err) {
      reportError(suggestedMode ? "Could not decline rule" : "Could not archive rule", err);
      return null;
    }
    setRules((prev) => prev.filter((r) => r.id !== id));
    setOpenId((prev) => (prev === id ? null : prev));
    dropSelection([id]);
    // Keep the archive list honest if it has been loaded.
    setArchivedRules((prev) =>
      prev === null || !moved ? prev : [...prev, { ...moved, archivedAt: Date.now() }],
    );
    return moved;
  }, [rules, suggestedMode, dropSelection]);

  const handleArchive = useCallback(async (id: string) => {
    const moved = await archiveOne(id);
    if (!moved) return;
    void autoExportAfterRuleMutation();
    showUndo({ id, message: `${suggestedMode ? "Declined" : "Archived"} “${moved.ruleText}”` });
  }, [archiveOne, autoExportAfterRuleMutation, showUndo, suggestedMode]);

  const handleBulkArchive = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    let done = 0;
    for (const id of ids) {
      if (await archiveOne(id)) done += 1;
    }
    if (done > 0) void autoExportAfterRuleMutation();
  }, [selectedIds, archiveOne, autoExportAfterRuleMutation]);

  // Accepting is what lets a suggestion reach Claude, so it re-sends the rules.
  const accept = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    try {
      await markRulesReviewed(ids);
    } catch (err) {
      reportError("Could not accept rule", err);
      return;
    }
    const now = Date.now();
    const accepted = new Set(ids);
    setRules((prev) =>
      prev.map((r) => (accepted.has(r.id) ? { ...r, reviewedAt: now, source: "synthesis" } : r)),
    );
    dropSelection(ids);
    setOpenId((prev) => (prev && accepted.has(prev) ? null : prev));
    void autoExportAfterRuleMutation();
  }, [autoExportAfterRuleMutation, dropSelection]);

  const handleToggleArchived = useCallback(async () => {
    const opening = !archivedOpen;
    setArchivedOpen(opening);
    if (opening && archivedRules === null) {
      try {
        setArchivedRules(await getArchivedWritingRules());
      } catch (err) {
        reportError("Could not load archived rules", err);
      }
    }
  }, [archivedOpen, archivedRules]);

  const handleRestore = useCallback(async (id: string) => {
    try {
      await unarchiveWritingRule(id);
      setArchivedRules((prev) => prev?.filter((r) => r.id !== id) ?? prev);
      setUndo((prev) => (prev?.id === id ? null : prev));
      void loadRules();
      void autoExportAfterRuleMutation();
    } catch (err) {
      reportError("Could not restore rule", err);
    }
  }, [autoExportAfterRuleMutation, loadRules]);

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleToggleRow = useCallback((id: string, viaKeyboard: boolean) => {
    setOpenInstant(viaKeyboard);
    setOpenId((prev) => (prev === id ? null : id));
  }, []);

  const toggleCategory = useCallback((category: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setQuery("");
    setSeverityFilter(null);
    setTypeFilter("");
  }, []);

  const handleImported = useCallback(() => {
    void loadRules();
  }, [loadRules]);

  const selecting = selectedIds.size > 0;
  const noun = suggestedMode ? "suggestions" : "rules";

  let body: React.ReactNode;
  if (loading && rules.length === 0) {
    body = (
      <div className="px-8 py-16 text-center text-[length:var(--text-sm)] text-[var(--color-text-secondary)]">
        Loading…
      </div>
    );
  } else if (inMode.length === 0) {
    body = suggestedMode ? (
      <EmptyState title="Nothing to review">
        When Claude turns your notes into rules, they wait here for your yes. Nothing reaches Claude until you accept it.
      </EmptyState>
    ) : (
      <>
        <EmptyState title="No rules yet">
          Rules are what Claude follows when it writes for you. Accept a suggestion made from your notes, or start from a style guide you already have.
        </EmptyState>
        {!importOpen && (
          <div className="max-w-[640px]">
            <StyleGuideImport onImported={handleImported} />
          </div>
        )}
      </>
    );
  } else if (filtered.length === 0) {
    body = (
      <EmptyState title={`No ${noun} match`}>
        <button type="button" onClick={clearFilters} className={LINK_BUTTON_CLASS}>
          Clear search and filters
        </button>
      </EmptyState>
    );
  } else {
    body = Array.from(categoryGroups.entries()).map(([category, categoryRules]) => {
      const collapsed = collapsedCategories.has(category);
      return (
        <section key={category} aria-label={formatCategoryLabel(category)}>
          <button
            type="button"
            aria-expanded={!collapsed}
            onClick={() => toggleCategory(category)}
            className={cn(
              "flex w-full cursor-pointer items-center justify-between bg-transparent pb-1.5 pt-5 text-left text-[length:var(--text-xs)] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-secondary)]",
              FOCUS_RING,
            )}
          >
            <span>{formatCategoryLabel(category)}</span>
            <span className="flex items-center gap-1.5 font-normal normal-case tracking-normal">
              {categoryRules.length}
              <Chevron open={!collapsed} />
            </span>
          </button>
          {!collapsed &&
            categoryRules.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                suggested={suggestedMode}
                open={openId === rule.id}
                instant={openInstant}
                selected={selectedIds.has(rule.id)}
                selecting={selecting}
                onToggle={handleToggleRow}
                onToggleSelect={handleToggleSelect}
                onUpdate={handleUpdate}
                onArchive={(id) => void handleArchive(id)}
                onAccept={(id) => void accept([id])}
              />
            ))}
        </section>
      );
    });
  }

  return (
    <>
      {/* One search box. Everything else is one click away, not on screen. */}
      {inMode.length > 0 && (
        <div className="flex shrink-0 flex-col gap-2 border-b border-[var(--color-border)] bg-[var(--color-page)] px-8 py-2.5">
          {selecting ? (
            <div className="flex h-[34px] items-center gap-3">
              <span className="text-[length:var(--text-sm)] font-medium text-[var(--color-text-primary)]">
                {selectedIds.size} selected
              </span>
              {suggestedMode ? (
                <>
                  <button type="button" onClick={() => void accept(Array.from(selectedIds))} className={BUTTON_PRIMARY_CLASS}>
                    Accept selected
                  </button>
                  <button type="button" onClick={() => void handleBulkArchive()} className={BUTTON_SECONDARY_CLASS}>
                    Decline selected
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => void handleBulkArchive()} className={BUTTON_SECONDARY_CLASS}>
                  Archive selected
                </button>
              )}
              <button type="button" onClick={() => setSelectedIds(new Set())} className={cn(LINK_BUTTON_CLASS, "ml-auto")}>
                Clear
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  ref={searchRef}
                  type="search"
                  aria-label={suggestedMode ? "Search suggestions" : "Search rules"}
                  placeholder={suggestedMode ? "Search suggestions" : "Search rules"}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape" && query) {
                      e.stopPropagation();
                      setQuery("");
                    }
                  }}
                  className={SEARCH_CLASS}
                />
                {!query && <SlashHint />}
              </div>
              <button
                type="button"
                aria-expanded={filtersOpen}
                onClick={() => setFiltersOpen((o) => !o)}
                className={cn(BUTTON_SECONDARY_CLASS, "py-1.5 text-[length:var(--text-sm)]")}
              >
                Filter{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}
              </button>
              {!suggestedMode && (
                <button
                  type="button"
                  aria-expanded={importOpen}
                  onClick={() => setImportOpen((o) => !o)}
                  className={cn(BUTTON_SECONDARY_CLASS, "py-1.5 text-[length:var(--text-sm)]")}
                >
                  Add from style guide
                </button>
              )}
            </div>
          )}

          {filtersOpen && !selecting && (
            <div className="rule-room flex flex-wrap items-center gap-2" data-room>
              <div className="flex flex-wrap gap-1" role="group" aria-label="How strict">
                {SEVERITY_VALUES.map((sev) => (
                  <Chip key={sev} active={severityFilter === sev} onClick={() => setSeverityFilter(severityFilter === sev ? null : sev)}>
                    {SEVERITY_LABELS[sev]}
                  </Chip>
                ))}
              </div>
              {typesPresent.length > 1 && (
                <select
                  aria-label="Writing type"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className={cn(FIELD_CLASS, "w-auto cursor-pointer py-[3px] text-[length:var(--text-xs)]")}
                >
                  <option value="">Every writing type</option>
                  {typesPresent.map((t) => (
                    <option key={t} value={t}>{typeLabel(t)}</option>
                  ))}
                </select>
              )}
              <select
                aria-label="Sort"
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className={cn(FIELD_CLASS, "w-auto cursor-pointer py-[3px] text-[length:var(--text-xs)]")}
              >
                <option value="signal">Most notes first</option>
                <option value="newest">Newest first</option>
              </select>
            </div>
          )}
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[960px] px-8 pb-16 pt-2">
          {suggestedMode && inMode.length > 0 && (
            <p className="pt-3 text-[length:var(--text-sm)] text-[var(--color-text-secondary)]">
              Claude suggested these from your notes. Nothing here reaches Claude until you accept it.
            </p>
          )}
          {importOpen && !suggestedMode && inMode.length > 0 && (
            <div className="pt-4">
              <StyleGuideImport onImported={handleImported} onClose={() => setImportOpen(false)} />
            </div>
          )}

          {body}

          {/* Archived — archived rules keep their provenance and can return */}
          <div className="mt-8">
            <button
              type="button"
              aria-expanded={archivedOpen}
              onClick={() => void handleToggleArchived()}
              className={cn(
                "flex cursor-pointer items-center gap-1.5 text-[length:var(--text-xs)] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-secondary)]",
                FOCUS_RING,
              )}
            >
              <Chevron open={archivedOpen} />
              {suggestedMode ? "Declined and archived" : "Archived"}
              {archivedRules !== null ? ` (${archivedRules.length})` : ""}
            </button>
            {archivedOpen &&
              (archivedRules === null ? (
                <div className="py-3 text-[length:var(--text-sm)] text-[var(--color-text-secondary)]">Loading…</div>
              ) : archivedRules.length === 0 ? (
                <div className="py-3 text-[length:var(--text-sm)] text-[var(--color-text-secondary)]">Nothing archived.</div>
              ) : filteredArchived.length === 0 ? (
                <div className="py-3 text-[length:var(--text-sm)] text-[var(--color-text-secondary)]">No archived rules match.</div>
              ) : (
                filteredArchived.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex items-baseline gap-2 border-b border-[var(--color-border)] py-2"
                  >
                    <div className="min-w-0 flex-1 text-[length:var(--text-sm)] text-[var(--color-text-secondary)]">
                      {rule.ruleText}
                    </div>
                    {rule.archivedAt ? (
                      <span className="shrink-0 text-[length:var(--text-xs)] text-[var(--color-text-secondary)]">
                        {formatDate(rule.archivedAt)}
                      </span>
                    ) : null}
                    <button type="button" onClick={() => void handleRestore(rule.id)} className={LINK_BUTTON_CLASS}>
                      Restore
                    </button>
                  </div>
                ))
              ))}
          </div>

          {!suggestedMode && (
            <p className="mt-8 text-[length:var(--text-xs)] text-[var(--color-text-secondary)]">
              Claude gets every change here automatically.{" "}
              <button type="button" onClick={() => void syncRules(true)} className={LINK_BUTTON_CLASS}>
                Send again
              </button>
              {syncStatus && (
                <span role="status" className="ml-2">
                  {syncStatus}
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      {/* Undo — archiving is one step, so the way back is always one click */}
      {undo && (
        <div
          role="status"
          className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-8"
        >
          <div className="rule-toast pointer-events-auto flex max-w-[560px] items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-page)] px-3 py-2 text-[length:var(--text-sm)] text-[var(--color-text-primary)] shadow-[var(--shadow-md)]">
            <span className="truncate">{undo.message}</span>
            <button
              type="button"
              onClick={() => void handleRestore(undo.id)}
              className={cn(LINK_BUTTON_CLASS, "shrink-0 font-semibold text-[var(--color-text-primary)]")}
            >
              Undo
            </button>
          </div>
        </div>
      )}
    </>
  );
}
