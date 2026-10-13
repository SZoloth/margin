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

type RulesView = "unreviewed" | "all";

type RulesFilterHint = "unreviewed" | "all" | null;

interface RulesTabProps {
  onStatsChange: (stats: { ruleCount: number; unreviewedCount: number }) => void;
  filterHint?: RulesFilterHint;
}

const SEVERITY_VALUES: WritingRuleSeverity[] = ["must-fix", "should-fix", "nice-to-fix"];

function SeverityBadge({ severity }: { severity: string }) {
  const key = SEVERITY_VALUES.includes(severity as WritingRuleSeverity)
    ? severity
    : "should-fix";

  return (
    <span
      data-severity-badge
      style={{
        padding: "2px 8px",
        fontSize: "var(--text-xs)",
        fontWeight: 600,
        borderRadius: 100,
        textTransform: "uppercase",
        letterSpacing: "0.3px",
        flexShrink: 0,
        background: `var(--color-severity-${key}-bg)`,
        color: `var(--color-severity-${key}-text)`,
        borderColor: `var(--color-severity-${key}-border)`,
        borderWidth: 1,
        borderStyle: "solid",
      }}
    >
      {severity}
    </span>
  );
}



type SortKey = "signal" | "newest";

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]";

const FIELD_CLASS = cn(
  "w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-page)] px-2 py-1 text-[length:var(--text-sm)] text-[var(--color-text-primary)]",
  FOCUS_RING,
);

const LINK_BUTTON_CLASS = cn(
  "cursor-pointer rounded-[var(--radius-xs)] text-[length:var(--text-xs)] text-[var(--color-text-secondary)] underline underline-offset-2 transition-colors duration-100 hover:text-[var(--color-text-primary)]",
  FOCUS_RING,
);

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-[var(--radius-pill)] border border-[var(--color-border)] px-2.5 py-[3px] text-[length:var(--text-xs)] transition-colors duration-100",
        FOCUS_RING,
        active
          ? "bg-[var(--color-text-primary)] text-[var(--color-page)]"
          : "bg-[var(--color-page)] text-[var(--color-text-secondary)] hover:bg-[var(--hover-bg)]",
      )}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: (id: string) => React.ReactNode;
  className?: string;
}) {
  const uid = useId();
  const id = `rule-field-${uid}`;
  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="text-[length:var(--text-xs)] font-semibold uppercase tracking-[0.3px] text-[var(--color-text-secondary)]"
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
  return WRITING_TYPES.find((t) => t.value === value)?.label ?? value;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
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

function Chevron({ open }: { open: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 text-[length:var(--text-xs)] text-[var(--color-text-secondary)] transition-transform duration-150 ease-[var(--ease-micro)]"
      style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
    >
      {"▾"}
    </span>
  );
}

/**
 * One rule is one line until you ask for more. Opening it reveals the reason,
 * the example and the actions in place (gradual revelation); nothing else on
 * the page moves. Only one rule is open at a time.
 */
function RuleRow({
  rule,
  open,
  instant,
  selected,
  selecting,
  onToggle,
  onToggleSelect,
  onUpdate,
  onArchive,
  onMarkReviewed,
}: {
  rule: WritingRule;
  open: boolean;
  /** Opened from the keyboard: the result should already be there. */
  instant: boolean;
  selected: boolean;
  selecting: boolean;
  onToggle: (id: string, viaKeyboard: boolean) => void;
  onToggleSelect: (id: string) => void;
  onUpdate: (id: string, updates: Partial<WritingRule>) => Promise<void>;
  onArchive: (id: string) => void;
  onMarkReviewed: (id: string) => void;
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

  const isUnreviewed = rule.reviewedAt == null;
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
          {isUnreviewed && (
            <span
              role="img"
              aria-label="New"
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent)]"
            />
          )}
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
      </div>

      {expanded && !editing && (
        <div data-room data-instant={instant || undefined} className="rule-room pb-4 pl-6 pr-6">
          {rule.whenToApply && (
            <div className="mb-1 text-[length:var(--text-sm)] leading-[1.4] text-[var(--color-text-secondary)]">
              <strong className="text-[length:var(--text-xs)] font-semibold uppercase tracking-[0.3px]">When </strong>
              {rule.whenToApply}
            </div>
          )}
          {rule.why && (
            <div className="mb-1 text-[length:var(--text-sm)] leading-[1.4] text-[var(--color-text-secondary)]">
              <strong className="text-[length:var(--text-xs)] font-semibold uppercase tracking-[0.3px]">Why </strong>
              {rule.why}
            </div>
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

          <div className="mt-2 text-[length:var(--text-xs)] text-[var(--color-text-secondary)]">
            Flagged {plural(rule.signalCount, "time", "times")} · {typeLabel(rule.writingType)} · Added{" "}
            {formatDate(rule.createdAt)} ·{" "}
            <span
              title={
                enforced
                  ? "The writing guard blocks text that matches this rule."
                  : "Claude is told this rule, but nothing blocks a violation."
              }
            >
              {enforced ? "Enforced automatically" : "Guidance only"}
            </span>
          </div>

          <div className="mt-2 flex gap-3">
            {isUnreviewed && (
              <button type="button" onClick={() => onMarkReviewed(rule.id)} className={cn(LINK_BUTTON_CLASS, "text-[var(--color-accent)]")}>
                Mark reviewed
              </button>
            )}
            <button type="button" onClick={() => setEditing(true)} className={LINK_BUTTON_CLASS}>
              Edit
            </button>
            <button type="button" onClick={() => onArchive(rule.id)} className={LINK_BUTTON_CLASS}>
              Archive
            </button>
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
            <Field label="Rule text">
              {(id) => (
                <textarea id={id} rows={2} value={editFields.ruleText} onChange={set("ruleText")} className={cn(FIELD_CLASS, "resize-y")} autoFocus />
              )}
            </Field>
            <div className="flex gap-2">
              <Field label="Severity" className="flex-1">
                {(id) => (
                  <select id={id} value={editFields.severity} onChange={set("severity")} className={cn(FIELD_CLASS, "cursor-pointer")}>
                    <option value="must-fix">Must-fix</option>
                    <option value="should-fix">Should-fix</option>
                    <option value="nice-to-fix">Nice-to-fix</option>
                  </select>
                )}
              </Field>
              <Field label="When to apply" className="flex-[2]">
                {(id) => <input id={id} value={editFields.whenToApply} onChange={set("whenToApply")} className={FIELD_CLASS} />}
              </Field>
            </div>
            <Field label="Why">
              {(id) => <input id={id} value={editFields.why} onChange={set("why")} className={FIELD_CLASS} />}
            </Field>
            <div className="flex gap-2">
              <Field label="Before" className="flex-1">
                {(id) => <input id={id} value={editFields.exampleBefore} onChange={set("exampleBefore")} className={FIELD_CLASS} />}
              </Field>
              <Field label="After" className="flex-1">
                {(id) => <input id={id} value={editFields.exampleAfter} onChange={set("exampleAfter")} className={FIELD_CLASS} />}
              </Field>
            </div>
            <Field label="Notes">
              {(id) => <textarea id={id} rows={2} value={editFields.notes} onChange={set("notes")} className={cn(FIELD_CLASS, "resize-y")} />}
            </Field>
            <div className="mt-1 flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={!editFields.ruleText.trim()}
                className={cn(
                  "cursor-pointer rounded-[var(--radius-sm)] bg-[var(--color-text-primary)] px-3 py-1 text-[length:var(--text-sm)] text-[var(--color-page)] disabled:cursor-default disabled:opacity-50",
                  FOCUS_RING,
                )}
              >
                Save
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className={cn(
                  "cursor-pointer rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-page)] px-3 py-1 text-[length:var(--text-sm)] text-[var(--color-text-secondary)] hover:bg-[var(--hover-bg)]",
                  FOCUS_RING,
                )}
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

function formatCategoryLabel(category: string): string {
  return category
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function RulesTab({ onStatsChange, filterHint }: RulesTabProps) {
  const [rules, setRules] = useState<WritingRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("signal");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [openInstant, setOpenInstant] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [archivedRules, setArchivedRules] = useState<WritingRule[] | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [lastArchived, setLastArchived] = useState<{ id: string; ruleText: string } | null>(null);
  const syncTimeoutRef = useRef<number | null>(null);
  const undoTimeoutRef = useRef<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const loadedRef = useRef(false);

  const unreviewedCount = useMemo(() => rules.filter((r) => r.reviewedAt == null).length, [rules]);
  const [view, setView] = useState<RulesView>("unreviewed");

  // The stat tiles above the tabs can ask for a specific view.
  useEffect(() => {
    if (filterHint === "unreviewed" || filterHint === "all") setView(filterHint);
  }, [filterHint]);

  const q = query.trim().toLowerCase();
  // Smart default: show "all" if nothing to review. A search always spans every rule.
  const effectiveView: RulesView =
    q || (view === "unreviewed" && unreviewedCount === 0 && rules.length > 0) ? "all" : view;

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getWritingRules();
      setRules(data);
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

  useEffect(() => {
    onStatsChange({ ruleCount: rules.length, unreviewedCount });
  }, [rules, onStatsChange, unreviewedCount]);

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

  const typesPresent = useMemo(
    () => Array.from(new Set(rules.map((r) => r.writingType))).sort(),
    [rules],
  );

  const filtered = useMemo(() => {
    const list = rules.filter((r) => {
      if (effectiveView === "unreviewed" && r.reviewedAt != null) return false;
      if (severityFilter && r.severity !== severityFilter) return false;
      if (typeFilter && r.writingType !== typeFilter) return false;
      return matchesQuery(r, q);
    });
    return list.sort((a, b) =>
      sort === "signal"
        ? b.signalCount - a.signalCount || b.createdAt - a.createdAt
        : b.createdAt - a.createdAt,
    );
  }, [rules, effectiveView, severityFilter, typeFilter, q, sort]);

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
        setSyncStatus(`Synced ${plural(result.ruleCount, "rule", "rules")}`);
        if (syncTimeoutRef.current !== null) window.clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = window.setTimeout(() => setSyncStatus(null), 5000);
      }
    } catch (err) {
      reportError(
        explicit ? "Could not sync rules" : "Rule saved, but the writing profile export failed",
        err,
      );
      if (explicit) setSyncStatus("Sync failed");
    }
  }, []);

  const autoExportAfterRuleMutation = useCallback(() => syncRules(false), [syncRules]);

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
      reportError("Could not archive rule", err);
      return null;
    }
    setRules((prev) => prev.filter((r) => r.id !== id));
    setOpenId((prev) => (prev === id ? null : prev));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    // Keep the archive list honest if it has been loaded.
    setArchivedRules((prev) =>
      prev === null || !moved ? prev : [...prev, { ...moved, archivedAt: Date.now() }],
    );
    return moved;
  }, [rules]);

  const showUndo = useCallback((entry: { id: string; ruleText: string }) => {
    setLastArchived(entry);
    if (undoTimeoutRef.current !== null) window.clearTimeout(undoTimeoutRef.current);
    undoTimeoutRef.current = window.setTimeout(() => setLastArchived(null), 8000);
  }, []);

  const handleArchive = useCallback(async (id: string) => {
    const moved = await archiveOne(id);
    if (!moved) return;
    void autoExportAfterRuleMutation();
    showUndo({ id, ruleText: moved.ruleText });
  }, [archiveOne, autoExportAfterRuleMutation, showUndo]);

  const handleBulkArchive = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    let done = 0;
    for (const id of ids) {
      if (await archiveOne(id)) done += 1;
    }
    if (done > 0) void autoExportAfterRuleMutation();
  }, [selectedIds, archiveOne, autoExportAfterRuleMutation]);

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
      setLastArchived((prev) => (prev?.id === id ? null : prev));
      void loadRules();
      void autoExportAfterRuleMutation();
    } catch (err) {
      reportError("Could not restore rule", err);
    }
  }, [autoExportAfterRuleMutation, loadRules]);

  const handleMarkReviewed = useCallback(async (id: string) => {
    try {
      await markRulesReviewed([id]);
      setRules((prev) =>
        prev.map((r) => (r.id === id ? { ...r, reviewedAt: Date.now() } : r)),
      );
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    } catch (err) {
      reportError("Could not mark rule reviewed", err);
    }
  }, []);

  const handleBulkMarkReviewed = useCallback(async () => {
    if (selectedIds.size === 0) return;
    try {
      await markRulesReviewed(Array.from(selectedIds));
      const now = Date.now();
      setRules((prev) =>
        prev.map((r) => (selectedIds.has(r.id) ? { ...r, reviewedAt: now } : r)),
      );
      setSelectedIds(new Set());
    } catch (err) {
      reportError("Bulk review failed", err);
    }
  }, [selectedIds]);

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

  const hasActiveFilter = !!(q || severityFilter || typeFilter);
  const clearFilters = useCallback(() => {
    setQuery("");
    setSeverityFilter(null);
    setTypeFilter("");
  }, []);

  const emptyMessage = useMemo(() => {
    if (rules.length === 0) {
      return "No writing rules yet. Export corrections for synthesis to generate rules.";
    }
    if (filtered.length === 0 && hasActiveFilter) {
      return "No rules match these filters.";
    }
    if (effectiveView === "unreviewed" && unreviewedCount === 0) {
      return "No new rules to review. Export corrections for synthesis to generate rules.";
    }
    if (filtered.length === 0) {
      return "No rules match this filter.";
    }
    return null;
  }, [rules.length, effectiveView, unreviewedCount, filtered.length, hasActiveFilter]);

  const buttonSecondary = cn(
    "cursor-pointer rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-page)] px-2.5 py-1 text-[length:var(--text-xs)] text-[var(--color-text-secondary)] transition-colors duration-100 hover:bg-[var(--hover-bg)]",
    FOCUS_RING,
  );
  const selecting = selectedIds.size > 0;

  return (
    <>
      {/* One search box. Everything else is one click away, not on screen. */}
      <div className="flex shrink-0 flex-col gap-2 border-b border-[var(--color-border)] bg-[var(--color-page)] px-8 py-2.5">
        {selecting ? (
          <div className="flex h-[34px] items-center gap-3">
            <span className="text-[length:var(--text-sm)] font-medium text-[var(--color-text-primary)]">
              {selectedIds.size} selected
            </span>
            <button type="button" onClick={handleBulkMarkReviewed} className={buttonSecondary}>
              Mark reviewed
            </button>
            <button type="button" onClick={() => void handleBulkArchive()} className={buttonSecondary}>
              Archive selected
            </button>
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
                aria-label="Search rules"
                placeholder="Search rules"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && query) {
                    e.stopPropagation();
                    setQuery("");
                  }
                }}
                className={cn(FIELD_CLASS, "py-1.5 pr-8 [&::-webkit-search-cancel-button]:appearance-none")}
              />
              {!query && (
                <kbd
                  aria-hidden="true"
                  className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-[var(--radius-xs)] border border-[var(--color-border)] px-1 text-[length:var(--text-xs)] text-[var(--color-text-secondary)]"
                >
                  /
                </kbd>
              )}
            </div>
            <button
              type="button"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((o) => !o)}
              className={cn(buttonSecondary, "py-1.5 text-[length:var(--text-sm)]")}
            >
              Filter{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}
            </button>
          </div>
        )}

        {filtersOpen && !selecting && (
          <div className="rule-room flex flex-wrap items-center gap-2" data-room>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Severity">
              {SEVERITY_VALUES.map((sev) => (
                <Chip key={sev} active={severityFilter === sev} onClick={() => setSeverityFilter(severityFilter === sev ? null : sev)}>
                  {sev.charAt(0).toUpperCase() + sev.slice(1)}
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
                <option value="">All writing types</option>
                {typesPresent.map((t) => (
                  <option key={t} value={t}>{typeLabel(t)}</option>
                ))}
              </select>
            )}
            <select
              aria-label="Sort rules"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className={cn(FIELD_CLASS, "w-auto cursor-pointer py-[3px] text-[length:var(--text-xs)]")}
            >
              <option value="signal">Most flagged first</option>
              <option value="newest">Newest first</option>
            </select>
          </div>
        )}

        {/* The review queue is a sentence, not a second set of tabs. */}
        {!q && rules.length > 0 && (effectiveView === "unreviewed" || unreviewedCount > 0) && (
          <div className="text-[length:var(--text-xs)] text-[var(--color-text-secondary)]">
            {effectiveView === "unreviewed" ? (
              <>
                Showing {plural(unreviewedCount, "new rule", "new rules")}.{" "}
                <button type="button" onClick={() => { setView("all"); setSelectedIds(new Set()); }} className={LINK_BUTTON_CLASS}>
                  Show all {rules.length}
                </button>
              </>
            ) : (
              <>
                {plural(unreviewedCount, "new rule", "new rules")} to review.{" "}
                <button type="button" onClick={() => { setView("unreviewed"); setSelectedIds(new Set()); }} className={LINK_BUTTON_CLASS}>
                  Review them
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[960px] px-8 pb-16 pt-2">
          {loading && rules.length === 0 ? (
            <div className="px-8 py-16 text-center text-[length:var(--text-sm)] text-[var(--color-text-secondary)]">
              Loading...
            </div>
          ) : emptyMessage ? (
            <div className="px-8 py-16 text-center text-[length:var(--text-sm)] leading-[1.6] text-[var(--color-text-secondary)]">
              {emptyMessage}
              {hasActiveFilter && rules.length > 0 && (
                <div className="mt-2">
                  <button type="button" onClick={clearFilters} className={LINK_BUTTON_CLASS}>
                    Clear filters
                  </button>
                </div>
              )}
            </div>
          ) : (
            Array.from(categoryGroups.entries()).map(([category, categoryRules]) => {
              const collapsed = collapsedCategories.has(category);
              return (
                <div key={category}>
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
                        open={openId === rule.id}
                        instant={openInstant}
                        selected={selectedIds.has(rule.id)}
                        selecting={selecting}
                        onToggle={handleToggleRow}
                        onToggleSelect={handleToggleSelect}
                        onUpdate={handleUpdate}
                        onArchive={(id) => void handleArchive(id)}
                        onMarkReviewed={handleMarkReviewed}
                      />
                    ))}
                </div>
              );
            })
          )}

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
              Archived{archivedRules !== null ? ` (${archivedRules.length})` : ""}
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
                    className="flex items-baseline gap-2 border-b border-[var(--color-border)] py-2 opacity-70"
                  >
                    <div className="min-w-0 flex-1 text-[length:var(--text-sm)] text-[var(--color-text-primary)]">
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

          <p className="mt-8 text-[length:var(--text-xs)] text-[var(--color-text-secondary)]">
            Changes reach Claude automatically.{" "}
            <button type="button" onClick={() => void syncRules(true)} className={LINK_BUTTON_CLASS}>
              Sync now
            </button>
            {syncStatus && (
              <span role="status" className="ml-2">
                {syncStatus}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Undo — archiving is one step, so the way back is always one click */}
      {lastArchived && (
        <div
          role="status"
          className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-8"
        >
          <div className="rule-toast pointer-events-auto flex max-w-[560px] items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-page)] px-3 py-2 text-[length:var(--text-sm)] text-[var(--color-text-primary)] shadow-[var(--shadow-md)]">
            <span className="truncate">Archived “{lastArchived.ruleText}”</span>
            <button
              type="button"
              onClick={() => void handleRestore(lastArchived.id)}
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
