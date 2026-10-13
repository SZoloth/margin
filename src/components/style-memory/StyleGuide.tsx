import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import type { WritingRule } from "@/lib/tauri-commands";
import {
  deleteWritingRule,
  exportWritingRules,
  getArchivedWritingRules,
  getCorrectionsFlat,
  getWritingRules,
  markRulesReviewed,
  unarchiveWritingRule,
  updateWritingRule,
} from "@/lib/tauri-commands";
import { reportError } from "@/lib/error-bus";
import type { CorrectionDetail } from "@/types/annotations";
import {
  BUTTON_PRIMARY_CLASS,
  BUTTON_SECONDARY_CLASS,
  Chip,
  EmptyState,
  FIELD_CLASS,
  FOCUS_RING,
  LINK_BUTTON_CLASS,
  SEARCH_CLASS,
  SERIF,
  plural,
} from "./controls";
import { RuleMargin } from "./RuleMargin";
import { RuleBench } from "./RuleBench";
import { StyleGuideImport } from "./StyleGuideImport";
import {
  STRICTNESS_LABEL,
  type RuleCounts,
  categoryLabel,
  compareRules,
  countRules,
  formatDate,
  isSuggested,
  matchesQuery,
  severityFor,
  strictnessOf,
  typeLabel,
  typeOrder,
} from "./rules-model";

type Show = "all" | "hard" | "preference" | "suggested";

interface Section {
  type: string;
  categories: { category: string; rules: WritingRule[] }[];
}

/** Writing type, then category, then hard rules before preferences. */
function toSections(rules: WritingRule[]): Section[] {
  const byType = new Map<string, Map<string, WritingRule[]>>();
  for (const r of rules) {
    const cats = byType.get(r.writingType) ?? new Map<string, WritingRule[]>();
    const list = cats.get(r.category) ?? [];
    list.push(r);
    cats.set(r.category, list);
    byType.set(r.writingType, cats);
  }
  return [...byType.entries()]
    .sort(([a], [b]) => typeOrder(a) - typeOrder(b))
    .map(([type, cats]) => ({
      type,
      categories: [...cats.entries()]
        .map(([category, list]) => ({ category, rules: list.sort(compareRules) }))
        .sort((a, b) => categoryLabel(a.category).localeCompare(categoryLabel(b.category))),
    }));
}

function isTyping(el: Element | null): boolean {
  const tag = el?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!(el as HTMLElement | null)?.isContentEditable;
}

/**
 * Writing rules as a style guide you can read: sentences under each kind of
 * writing, each starting with how strict it is. Claude's suggestions sit
 * inline, underlined like a suggested edit, until you accept or decline them.
 * The margin beside the guide shows why the selected rule exists.
 */
export function StyleGuide({
  onStatsChange,
  readyNotes = 0,
  onShowNotes,
}: {
  onStatsChange: (counts: RuleCounts) => void;
  /** Notes that haven't become rules yet; shown as a nudge toward the Notes view. */
  readyNotes?: number;
  onShowNotes?: () => void;
}) {
  const [rules, setRules] = useState<WritingRule[]>([]);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [notesById, setNotesById] = useState<Map<string, CorrectionDetail>>(new Map());
  const [query, setQuery] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [typeFilter, setTypeFilter] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [benchOpen, setBenchOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [archived, setArchived] = useState<WritingRule[] | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [undo, setUndo] = useState<{ id: string; message: string } | null>(null);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const undoTimer = useRef<number | null>(null);
  const syncTimer = useRef<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const guideRef = useRef<HTMLDivElement>(null);

  const loadRules = useCallback(async () => {
    try {
      setRules(await getWritingRules());
      setHasLoaded(true);
    } catch (err) {
      reportError("Could not load writing rules", err);
    }
  }, []);

  useEffect(() => {
    void loadRules();
    getCorrectionsFlat()
      .then((rows) => setNotesById(new Map(rows.map((r) => [r.highlightId, r]))))
      .catch((err: unknown) => reportError("Could not load the notes behind your rules", err));
  }, [loadRules]);

  // Report only real counts: the empty list before the first load is not "zero rules".
  useEffect(() => {
    if (hasLoaded) onStatsChange(countRules(rules));
  }, [rules, hasLoaded, onStatsChange]);

  useEffect(
    () => () => {
      if (undoTimer.current !== null) window.clearTimeout(undoTimer.current);
      if (syncTimer.current !== null) window.clearTimeout(syncTimer.current);
    },
    [],
  );

  const q = query.trim().toLowerCase();
  const suggestedCount = useMemo(() => rules.filter(isSuggested).length, [rules]);
  const inEffectCount = rules.length - suggestedCount;
  const typesPresent = useMemo(
    () => [...new Set(rules.map((r) => r.writingType))].sort((a, b) => typeOrder(a) - typeOrder(b)),
    [rules],
  );

  const visible = useMemo(
    () =>
      rules.filter((r) => {
        if (show === "suggested" && !isSuggested(r)) return false;
        if ((show === "hard" || show === "preference") && (isSuggested(r) || strictnessOf(r.severity) !== show)) return false;
        if (typeFilter && r.writingType !== typeFilter) return false;
        return matchesQuery(r, q);
      }),
    [rules, show, typeFilter, q],
  );
  const sections = useMemo(() => toSections(visible), [visible]);
  /** Reading order, for arrow-key movement. */
  const order = useMemo(() => sections.flatMap((s) => s.categories.flatMap((c) => c.rules.map((r) => r.id))), [sections]);
  const selected = rules.find((r) => r.id === selectedId) ?? null;
  const activeFilterCount = (show !== "all" ? 1 : 0) + (typeFilter ? 1 : 0);

  // Every change is mirrored to Claude's rules file automatically; say so once, quietly.
  const syncRules = useCallback(async (explicit: boolean) => {
    try {
      const result = await exportWritingRules();
      if (explicit) {
        setSyncStatus(`Sent ${plural(result.ruleCount, "rule", "rules")} to Claude`);
        if (syncTimer.current !== null) window.clearTimeout(syncTimer.current);
        syncTimer.current = window.setTimeout(() => setSyncStatus(null), 5000);
      }
    } catch (err) {
      reportError(explicit ? "Could not send rules to Claude" : "Rule saved, but Claude's copy didn't update", err);
      if (explicit) setSyncStatus("Couldn't send rules");
    }
  }, []);

  const handleUpdate = useCallback(
    async (id: string, updates: Partial<WritingRule>) => {
      try {
        await updateWritingRule(id, {
          ruleText: updates.ruleText,
          severity: updates.severity,
          whenToApply: updates.whenToApply ?? undefined,
          why: updates.why ?? undefined,
          exampleBefore: updates.exampleBefore ?? undefined,
          exampleAfter: updates.exampleAfter ?? undefined,
        });
      } catch (err) {
        reportError("Could not update rule", err);
        throw err;
      }
      setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)));
      void syncRules(false);
    },
    [syncRules],
  );

  const moveSelection = useCallback(
    (fromId: string) => {
      const i = order.indexOf(fromId);
      const next = order[i + 1] ?? order[i - 1] ?? null;
      setSelectedId(next && next !== fromId ? next : null);
    },
    [order],
  );

  const showUndo = useCallback((entry: { id: string; message: string }) => {
    setUndo(entry);
    if (undoTimer.current !== null) window.clearTimeout(undoTimer.current);
    undoTimer.current = window.setTimeout(() => setUndo(null), 8000);
  }, []);

  // Accepting is what lets a suggestion reach Claude, so it re-sends the rules.
  const accept = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      try {
        await markRulesReviewed(ids);
      } catch (err) {
        reportError("Could not accept rule", err);
        return;
      }
      const now = Date.now();
      const done = new Set(ids);
      setRules((prev) => prev.map((r) => (done.has(r.id) ? { ...r, reviewedAt: now, source: "synthesis" } : r)));
      void syncRules(false);
    },
    [syncRules],
  );

  // Archiving and declining are recoverable, so they happen in one step with an Undo.
  const archive = useCallback(
    async (id: string) => {
      const rule = rules.find((r) => r.id === id);
      if (!rule) return;
      const declining = isSuggested(rule);
      try {
        await deleteWritingRule(id);
      } catch (err) {
        reportError(declining ? "Could not decline rule" : "Could not archive rule", err);
        return;
      }
      if (selectedId === id) moveSelection(id);
      setEditing(false);
      setRules((prev) => prev.filter((r) => r.id !== id));
      setArchived((prev) => (prev === null ? prev : [...prev, { ...rule, archivedAt: Date.now() }]));
      void syncRules(false);
      showUndo({ id, message: `${declining ? "Declined" : "Archived"} “${rule.ruleText}”` });
    },
    [rules, selectedId, moveSelection, syncRules, showUndo],
  );

  const restore = useCallback(
    async (id: string) => {
      try {
        await unarchiveWritingRule(id);
      } catch (err) {
        reportError("Could not restore rule", err);
        return;
      }
      setArchived((prev) => prev?.filter((r) => r.id !== id) ?? prev);
      setUndo((prev) => (prev?.id === id ? null : prev));
      await loadRules();
      void syncRules(false);
    },
    [loadRules, syncRules],
  );

  const toggleArchived = useCallback(async () => {
    const opening = !archivedOpen;
    setArchivedOpen(opening);
    if (opening && archived === null) {
      try {
        setArchived(await getArchivedWritingRules());
      } catch (err) {
        reportError("Could not load archived rules", err);
      }
    }
  }, [archivedOpen, archived]);

  const flipStrictness = useCallback(
    (rule: WritingRule) => {
      const next = strictnessOf(rule.severity) === "hard" ? "preference" : "hard";
      void handleUpdate(rule.id, { severity: severityFor(next, rule.severity) }).catch(() => {});
    },
    [handleUpdate],
  );

  // Keys work anywhere on the page unless you're typing: "/" searches, arrows
  // move through the guide, A/D accept or decline a suggestion, H flips strictness.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(document.activeElement)) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "j" || e.key === "k") {
        if (order.length === 0) return;
        e.preventDefault();
        const i = selectedId ? order.indexOf(selectedId) : -1;
        const down = e.key === "ArrowDown" || e.key === "j";
        const next = order[Math.max(0, Math.min(order.length - 1, i === -1 ? 0 : i + (down ? 1 : -1)))]!;
        setSelectedId(next);
        setEditing(false);
        guideRef.current?.querySelector<HTMLElement>(`[data-rule-id="${next}"]`)?.focus();
        return;
      }
      if (!selected || editing) return;
      const key = e.key.toLowerCase();
      if (key === "escape") setSelectedId(null);
      else if (key === "h") flipStrictness(selected);
      else if (key === "e") setEditing(true);
      else if (isSuggested(selected) && key === "a") {
        moveSelection(selected.id);
        void accept([selected.id]);
      } else if (isSuggested(selected) && key === "d") void archive(selected.id);
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [order, selectedId, selected, editing, flipStrictness, accept, archive, moveSelection]);

  const clearFilters = () => {
    setQuery("");
    setShow("all");
    setTypeFilter("");
  };

  let guide: React.ReactNode;
  if (!hasLoaded) {
    guide = <p className="py-12 text-[length:var(--text-sm)] text-[var(--color-text-secondary)]">Loading…</p>;
  } else if (rules.length === 0) {
    guide = (
      <>
        <EmptyState title="Your style guide is empty">
          Rules are what Claude follows when it writes for you. They come from the notes you leave while reading, or from a style guide you already have.
        </EmptyState>
        <StyleGuideImport onImported={() => void loadRules()} />
      </>
    );
  } else if (sections.length === 0) {
    guide = (
      <EmptyState title="No rules match">
        <button type="button" onClick={clearFilters} className={LINK_BUTTON_CLASS}>
          Clear search and filters
        </button>
      </EmptyState>
    );
  } else {
    guide = sections.map((section) => (
      <section key={section.type} aria-labelledby={`sg-${section.type}`} className="pt-6">
        <h3 id={`sg-${section.type}`} className={cn(SERIF, "text-[length:var(--text-xl)] font-normal text-[var(--color-text-primary)]")}>
          {typeLabel(section.type)}
        </h3>
        {section.categories.map(({ category, rules: list }) => (
          <div key={category} className="pt-3">
            <h4 className="pb-1 text-[length:var(--text-xs)] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">
              {categoryLabel(category)}
            </h4>
            <ul className="flex flex-col">
              {list.map((rule) => (
                <GuideLine
                  key={rule.id}
                  rule={rule}
                  selected={rule.id === selectedId}
                  onSelect={() => {
                    setSelectedId(rule.id === selectedId ? null : rule.id);
                    setEditing(false);
                  }}
                  onAccept={() => void accept([rule.id])}
                  onDecline={() => void archive(rule.id)}
                />
              ))}
            </ul>
          </div>
        ))}
      </section>
    ));
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-8 py-3">
        <div className="relative min-w-[200px] flex-1">
          <input
            ref={searchRef}
            type="search"
            aria-label="Search rules"
            placeholder="Search rules"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setQuery("");
                e.currentTarget.blur();
              }
            }}
            className={SEARCH_CLASS}
          />
        </div>
        <button
          type="button"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((o) => !o)}
          className={BUTTON_SECONDARY_CLASS}
        >
          {activeFilterCount ? `Filter · ${activeFilterCount}` : "Filter"}
        </button>
        <button type="button" aria-expanded={benchOpen} onClick={() => setBenchOpen((o) => !o)} className={BUTTON_SECONDARY_CLASS}>
          Try your rules
        </button>
        {rules.length > 0 && (
          <button type="button" aria-expanded={importOpen} onClick={() => setImportOpen((o) => !o)} className={BUTTON_SECONDARY_CLASS}>
            Add from style guide
          </button>
        )}
        {filtersOpen && (
          <div className="flex w-full flex-wrap items-center gap-x-5 gap-y-2 pt-2">
            <div role="group" aria-label="Show" className="flex flex-wrap gap-1">
              {(
                [
                  ["all", "Everything"],
                  ["hard", "Hard rules"],
                  ["preference", "Preferences"],
                  ["suggested", "Suggested"],
                ] as const
              ).map(([value, label]) => (
                <Chip key={value} active={show === value} onClick={() => setShow(value)}>
                  {label}
                </Chip>
              ))}
            </div>
            <select
              aria-label="Writing type"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className={cn(FIELD_CLASS, "w-auto")}
            >
              <option value="">Every kind of writing</option>
              {typesPresent.map((t) => (
                <option key={t} value={t}>
                  {typeLabel(t)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-8 pb-16 pt-4">
          {benchOpen && <RuleBench rules={rules} onClose={() => setBenchOpen(false)} />}
          {importOpen && (
            <div className="mb-4 max-w-[680px]">
              <StyleGuideImport
                onImported={() => void loadRules()}
                onClose={() => setImportOpen(false)}
              />
            </div>
          )}

          {rules.length > 0 && (
            <p className="text-[length:var(--text-sm)] leading-[1.5] text-[var(--color-text-secondary)]">
              {plural(inEffectCount, "rule", "rules")} Claude follows when it writes for you.
              {suggestedCount > 0 && (
                <>
                  {" "}
                  <span className="text-[var(--color-success)]">
                    {plural(suggestedCount, "suggestion", "suggestions")} from Claude, underlined.
                  </span>{" "}
                  <button type="button" onClick={() => void accept(rules.filter(isSuggested).map((r) => r.id))} className={LINK_BUTTON_CLASS}>
                    Accept all
                  </button>
                </>
              )}
              {readyNotes > 0 && onShowNotes && (
                <>
                  {" · "}
                  <button type="button" onClick={onShowNotes} className={LINK_BUTTON_CLASS}>
                    {plural(readyNotes, "note hasn't", "notes haven't")} become rules yet
                  </button>
                </>
              )}
            </p>
          )}

          <div className="grid grid-cols-1 gap-x-10 lg:grid-cols-[minmax(0,680px)_300px]">
            <div ref={guideRef} className="min-w-0">
              {guide}
            </div>
            {rules.length > 0 && (
              <aside
                aria-label="Rule details"
                className="mt-6 border-t border-[var(--color-border)] pt-5 lg:sticky lg:top-4 lg:mt-6 lg:self-start lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0"
              >
                <RuleMargin
                  rule={selected}
                  notesById={notesById}
                  editing={editing}
                  onEditingChange={setEditing}
                  onUpdate={handleUpdate}
                  onAccept={(id) => {
                    moveSelection(id);
                    void accept([id]);
                  }}
                  onArchive={(id) => void archive(id)}
                />
              </aside>
            )}
          </div>

          {rules.length > 0 && (
            <div className="mt-10 max-w-[680px]">
              <button
                type="button"
                aria-expanded={archivedOpen}
                onClick={() => void toggleArchived()}
                className={cn(LINK_BUTTON_CLASS, "no-underline")}
              >
                {archivedOpen ? "Hide archived and declined rules" : "Show archived and declined rules"}
              </button>
              {archivedOpen && (
                <ul className="mt-2 flex flex-col">
                  {archived === null ? (
                    <li className="py-2 text-[length:var(--text-sm)] text-[var(--color-text-secondary)]">Loading…</li>
                  ) : archived.length === 0 ? (
                    <li className="py-2 text-[length:var(--text-sm)] text-[var(--color-text-secondary)]">Nothing archived.</li>
                  ) : (
                    archived
                      .filter((r) => matchesQuery(r, q))
                      .map((r) => (
                        <li key={r.id} className="flex items-baseline gap-3 border-b border-[var(--color-border)] py-2 text-[length:var(--text-sm)]">
                          <span className={cn(SERIF, "flex-1 text-[length:var(--text-base)] text-[var(--color-text-secondary)] line-through decoration-[var(--color-border)]")}>
                            {r.ruleText}
                          </span>
                          {r.archivedAt ? (
                            <span className="text-[length:var(--text-xs)] text-[var(--color-text-tertiary)]">{formatDate(r.archivedAt)}</span>
                          ) : null}
                          <button type="button" onClick={() => void restore(r.id)} className={LINK_BUTTON_CLASS}>
                            Restore
                          </button>
                        </li>
                      ))
                  )}
                </ul>
              )}
              <p className="mt-6 text-[length:var(--text-xs)] text-[var(--color-text-secondary)]">
                Changes reach Claude as soon as you make them.{" "}
                <button type="button" onClick={() => void syncRules(true)} className={LINK_BUTTON_CLASS}>
                  Resend all rules
                </button>
                {syncStatus && (
                  <span role="status" className="ml-2">
                    {syncStatus}
                  </span>
                )}
              </p>
            </div>
          )}
        </div>
      </div>

      {undo && (
        <div role="status" className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-8">
          <div className="rule-toast pointer-events-auto flex max-w-[560px] items-center gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-page)] px-3 py-2 text-[length:var(--text-sm)] text-[var(--color-text-primary)] shadow-[var(--shadow-md)]">
            <span className="truncate">{undo.message}</span>
            <button
              type="button"
              onClick={() => void restore(undo.id)}
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

/**
 * One rule, read as a sentence. The leading word says how strict it is; a
 * suggestion reads like a suggested edit, with its decision right beside it.
 */
function GuideLine({
  rule,
  selected,
  onSelect,
  onAccept,
  onDecline,
}: {
  rule: WritingRule;
  selected: boolean;
  onSelect: () => void;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const suggested = isSuggested(rule);
  const strictness = strictnessOf(rule.severity);
  return (
    <li
      className={cn(
        "-mx-2 flex items-baseline gap-3 rounded-[var(--radius-sm)] px-2 transition-colors duration-100",
        suggested && "bg-[color-mix(in_srgb,var(--color-success)_9%,transparent)]",
        selected ? "bg-[var(--color-sidebar)]" : "hover:bg-[var(--hover-bg)]",
      )}
    >
      <button
        type="button"
        data-rule-id={rule.id}
        aria-pressed={selected}
        onClick={onSelect}
        className={cn("flex min-w-0 flex-1 cursor-pointer items-baseline gap-3 bg-transparent py-1.5 text-left", FOCUS_RING)}
      >
        <span
          className={cn(
            "w-[76px] shrink-0 text-[length:var(--text-xs)] font-semibold uppercase tracking-[0.06em]",
            suggested
              ? "text-[var(--color-success)]"
              : strictness === "hard"
                ? "text-[var(--color-severity-must-fix-text)]"
                : "text-[var(--color-severity-nice-to-fix-text)]",
          )}
        >
          {suggested ? "Suggested" : strictness === "hard" ? STRICTNESS_LABEL.hard : "Prefer"}
        </span>
        <span
          className={cn(
            SERIF,
            "min-w-0 text-[length:var(--text-lg)] leading-[1.45]",
            suggested
              ? "text-[var(--color-success)] underline decoration-[color-mix(in_srgb,var(--color-success)_45%,transparent)] underline-offset-4"
              : "text-[var(--color-text-primary)]",
          )}
        >
          {rule.ruleText}
        </span>
      </button>
      {suggested && (
        <span className="flex shrink-0 gap-1.5 self-center">
          <button type="button" aria-label={`Accept: ${rule.ruleText}`} onClick={onAccept} className={BUTTON_PRIMARY_CLASS}>
            Accept
          </button>
          <button type="button" aria-label={`Decline: ${rule.ruleText}`} onClick={onDecline} className={BUTTON_SECONDARY_CLASS}>
            Decline
          </button>
        </span>
      )}
    </li>
  );
}
