import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import type { CorrectionDetail } from "@/types/annotations";
import {
  getCorrectionsFlat,
  updateCorrectionWritingType,
  deleteCorrection,
  setCorrectionCategory,
  acceptCorrection,
  bulkDeleteCorrections,
  bulkTagCorrections,
  markCorrectionsUnsynthesized,
} from "@/lib/tauri-commands";
import { WRITING_TYPES, type WritingType } from "@/lib/writing-types";
import { reportError } from "@/lib/error-bus";
import { cn } from "@/lib/cn";
import {
  BUTTON_SECONDARY_CLASS,
  Chip,
  EmptyState,
  LINK_BUTTON_CLASS,
  SEARCH_CLASS,
  SlashHint,
} from "./controls";

const PAGE_SIZE = 500;

type CorrectionView = "inbox" | "archive";

type CorrectionFilterHint = "unsynthesized" | "untagged" | "all" | null;

interface CorrectionsTabProps {
  onStatsChange: (stats: { total: number; documentCount: number; untaggedCount: number; unsynthesizedCount: number }) => void;
  filterHint?: CorrectionFilterHint;
  onAcceptEdit?: (
    highlightId: string,
    matchText: string,
    suggestedEdit: string,
  ) => boolean | Promise<boolean>;
}

function formatDateLabel(timestamp: number, todayMs: number, yesterdayMs: number): string {
  const date = new Date(timestamp);
  const dayMs = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

  if (dayMs === todayMs) {
    return `Today — ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  }
  if (dayMs === yesterdayMs) {
    return `Yesterday — ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  }
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  if (diffDay === 1) return "Yesterday";
  if (diffDay < 7) return `${diffDay} days ago`;
  return new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function groupByDate(corrections: CorrectionDetail[]): Map<string, CorrectionDetail[]> {
  const now = new Date();
  const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayMs = todayMs - 86400000;

  const groups = new Map<string, CorrectionDetail[]>();
  for (const c of corrections) {
    const key = formatDateLabel(c.createdAt, todayMs, yesterdayMs);
    const existing = groups.get(key);
    if (existing) {
      existing.push(c);
    } else {
      groups.set(key, [c]);
    }
  }
  return groups;
}

function WritingTypeChips({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: WritingType) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {WRITING_TYPES.map((wt) => (
        <button
          key={wt.value}
          type="button"
          aria-pressed={value === wt.value}
          onClick={(e) => {
            e.stopPropagation();
            onChange(wt.value);
          }}
          style={{
            padding: "1px 6px",
            fontSize: "var(--text-xs)",
            fontWeight: value === wt.value ? 600 : 400,
            color:
              value === wt.value
                ? "var(--color-text-primary)"
                : "var(--color-text-secondary)",
            backgroundColor:
              value === wt.value ? "var(--hover-bg)" : "transparent",
            border:
              value === wt.value
                ? "1px solid var(--color-border)"
                : "1px solid transparent",
            borderRadius: "var(--radius-sm)",
            cursor: "pointer",
            transition: "all 150ms ease",
          }}
        >
          {wt.label}
        </button>
      ))}
    </div>
  );
}

function ViewToggle({
  view,
  onChangeView,
  inboxCount,
  archiveCount,
}: {
  view: CorrectionView;
  onChangeView: (v: CorrectionView) => void;
  inboxCount: number;
  archiveCount: number;
}) {
  const buttonBase: React.CSSProperties = {
    padding: "3px 10px",
    fontSize: "var(--text-sm)",
    border: "1px solid var(--color-border)",
    cursor: "pointer",
    transition: "all 100ms",
  };

  return (
    <div style={{ display: "flex" }} role="group" aria-label="Which notes">
      <button
        type="button"
        aria-pressed={view === "inbox"}
        title="Notes not yet turned into rules"
        onClick={() => onChangeView("inbox")}
        style={{
          ...buttonBase,
          borderRadius: "100px 0 0 100px",
          borderRight: "none",
          background: view === "inbox" ? "var(--color-text-primary)" : "var(--color-page)",
          color: view === "inbox" ? "var(--color-page)" : "var(--color-text-secondary)",
          fontWeight: view === "inbox" ? 600 : 400,
        }}
      >
        Waiting ({inboxCount})
      </button>
      <button
        type="button"
        aria-pressed={view === "archive"}
        title="Notes already turned into rules, or marked not about writing"
        onClick={() => onChangeView("archive")}
        style={{
          ...buttonBase,
          borderRadius: "0 100px 100px 0",
          background: view === "archive" ? "var(--color-text-primary)" : "var(--color-page)",
          color: view === "archive" ? "var(--color-page)" : "var(--color-text-secondary)",
          fontWeight: view === "archive" ? 600 : 400,
        }}
      >
        Done ({archiveCount})
      </button>
    </div>
  );
}

function CorrectionCard({
  correction,
  isSelected,
  onToggleSelect,
  onUpdateType,
  onDelete,
  onTriage,
  onAccept,
}: {
  correction: CorrectionDetail;
  isSelected: boolean;
  onToggleSelect: (highlightId: string) => void;
  onUpdateType: (highlightId: string, writingType: WritingType) => void;
  onDelete: (highlightId: string) => void;
  onTriage: (highlightId: string) => void;
  onAccept?: (highlightId: string, matchText: string, suggestedEdit: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showTypeChips, setShowTypeChips] = useState(false);
  const typeChipsId = `writing-type-chips-${correction.highlightId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const isSynthesized = correction.synthesizedAt != null;

  const isPositive = correction.polarity === "positive";
  const isCorrective = correction.polarity === "corrective";
  const polarityAccentColor = isPositive
    ? "var(--color-positive, #2d8a4e)"
    : isCorrective
      ? "var(--color-corrective, #d97706)"
      : undefined;

  return (
    <div
      onClick={() => setExpanded(!expanded)}
      style={{
        padding: "14px 0",
        borderBottom: "1px solid var(--color-border)",
        borderLeft: polarityAccentColor ? `3px solid ${polarityAccentColor}` : undefined,
        paddingLeft: polarityAccentColor ? 10 : 0,
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        cursor: "pointer",
        transition: "background 100ms",
        opacity: isSynthesized ? 0.55 : 1,
      }}
    >
      <input
        type="checkbox"
        checked={isSelected}
        onChange={(e) => {
          e.stopPropagation();
          onToggleSelect(correction.highlightId);
        }}
        onClick={(e) => e.stopPropagation()}
        style={{ marginTop: 3, flexShrink: 0, accentColor: "var(--color-text-primary)" }}
      />
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: `var(--color-highlight-${correction.highlightColor}, var(--color-highlight-yellow))`,
          flexShrink: 0,
          marginTop: 5,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "'Newsreader', Georgia, serif",
            fontSize: "var(--text-lg)",
            fontStyle: "italic",
            color: "var(--color-text-secondary)",
            lineHeight: 1.5,
            marginBottom: 4,
          }}
        >
          &ldquo;{correction.originalText}&rdquo;
        </div>
        {correction.notes.length > 0 && (
          <div style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: "var(--text-base)", color: "var(--color-text-primary)", lineHeight: 1.4, marginBottom: 6 }}>
            {correction.notes.join("; ")}
          </div>
        )}
        {isPositive && correction.rationale && (
          <div style={{ fontSize: "var(--text-xs)", color: "var(--color-positive, #2d8a4e)", fontStyle: "italic", marginBottom: 6 }}>
            {correction.rationale}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--text-xs)", color: "var(--color-text-tertiary, var(--color-text-secondary))" }}>
          <button
            type="button"
            aria-expanded={showTypeChips}
            aria-controls={typeChipsId}
            onClick={(e) => {
              e.stopPropagation();
              setShowTypeChips(!showTypeChips);
            }}
            style={{
              padding: "1px 7px",
              fontSize: "var(--text-xs)",
              color: "var(--color-text-secondary)",
              backgroundColor: correction.writingType ? "var(--hover-bg)" : "transparent",
              border: correction.writingType
                ? "1px solid var(--color-border)"
                : "1px dashed var(--color-border)",
              borderRadius: 100,
              cursor: "pointer",
              opacity: correction.writingType ? 1 : 0.6,
            }}
          >
            {correction.writingType
              ? (WRITING_TYPES.find((t) => t.value === correction.writingType)?.label ?? correction.writingType)
              : "Set type"}
          </button>
          {correction.documentTitle && (
            <span style={{ color: "var(--color-accent)" }}>
              {correction.documentTitle}
            </span>
          )}
          <span>{formatRelativeTime(correction.createdAt)}</span>
          {correction.category !== "non-feedback" && !isSynthesized && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTriage(correction.highlightId);
              }}
              title="Keep it here, but don't turn it into a rule"
              style={{
                padding: 0,
                fontSize: "var(--text-xs)",
                color: "var(--color-text-secondary)",
                background: "none",
                border: "none",
                cursor: "pointer",
                textDecoration: "underline",
                textUnderlineOffset: 2,
                opacity: 0.6,
              }}
            >
              Not about writing
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(correction.highlightId);
            }}
            title="Remove from Notes. The highlight stays in your document."
            style={{
              padding: 0,
              fontSize: "var(--text-xs)",
              color: "var(--color-text-secondary)",
              background: "none",
              border: "none",
              cursor: "pointer",
              textDecoration: "underline",
              textUnderlineOffset: 2,
              opacity: 0.6,
            }}
          >
            Remove
          </button>
          {correction.suggestedEdit != null && onAccept && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAccept(correction.highlightId, correction.originalText, correction.suggestedEdit!);
              }}
              style={{
                padding: "1px 8px",
                fontSize: "var(--text-xs)",
                color: "var(--color-page)",
                background: "var(--color-text-primary)",
                border: "1px solid var(--color-text-primary)",
                borderRadius: 100,
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              Apply edit → "{correction.suggestedEdit.length > 40
                ? correction.suggestedEdit.slice(0, 40) + "…"
                : correction.suggestedEdit}"
            </button>
          )}
        </div>

        {showTypeChips && (
          <div id={typeChipsId} style={{ marginTop: 6 }} onClick={(e) => e.stopPropagation()}>
            <WritingTypeChips
              value={correction.writingType}
              onChange={(v) => {
                onUpdateType(correction.highlightId, v);
                setShowTypeChips(false);
              }}
            />
          </div>
        )}

        {expanded && correction.extendedContext && (
          <div
            style={{
              marginTop: 10,
              padding: "10px 14px",
              background: "var(--color-sidebar, var(--hover-bg))",
              borderRadius: "var(--radius-sm)",
              borderLeft: "3px solid var(--color-border)",
              fontSize: "var(--text-xs)",
              color: "var(--color-text-secondary)",
              lineHeight: 1.6,
            }}
          >
            <div style={{ marginBottom: 6, fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.3px" }}>
              In context
            </div>
            {highlightInContext(correction.extendedContext, correction.originalText)}
          </div>
        )}
      </div>
    </div>
  );
}

function highlightInContext(context: string, original: string): React.ReactNode {
  const idx = context.indexOf(original);
  if (idx === -1) return context;
  return (
    <>
      {context.slice(0, idx)}
      <span style={{
        background: "var(--color-highlight-yellow, #f5edd2)",
        padding: "1px 2px",
        borderRadius: 2,
        fontStyle: "italic",
      }}>
        {original}
      </span>
      {context.slice(idx + original.length)}
    </>
  );
}

export function CorrectionsTab({ onStatsChange, filterHint, onAcceptEdit }: CorrectionsTabProps) {
  const [corrections, setCorrections] = useState<CorrectionDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [searchText, setSearchText] = useState("");
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkTypeChips, setShowBulkTypeChips] = useState(false);
  const [view, setView] = useState<CorrectionView>("inbox");
  const [untaggedOnly, setUntaggedOnly] = useState(false);
  const [polarityFilter, setPolarityFilter] = useState<"positive" | "corrective" | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const loadedRef = useRef(false);
  const prevFilterHintRef = useRef(filterHint);

  useEffect(() => {
    if (filterHint === prevFilterHintRef.current) return;
    prevFilterHintRef.current = filterHint;
    if (filterHint === "untagged") {
      setView("inbox");
      setActiveFilter(null);
      setUntaggedOnly(true);
    } else if (filterHint === "unsynthesized") {
      setView("inbox");
      setActiveFilter(null);
      setUntaggedOnly(false);
    } else {
      setUntaggedOnly(false);
    }
  }, [filterHint]);

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

  const loadCorrections = useCallback(async (pageLimit: number) => {
    setLoading(true);
    try {
      const data = await getCorrectionsFlat(pageLimit);
      setCorrections(data);
    } catch (err) {
      reportError("Could not load corrections", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true;
      void loadCorrections(PAGE_SIZE);
    }
  }, [loadCorrections]);

  // Counts for view toggle. The pending count mirrors the synthesis query
  // (CORRECTION_FILTER): unsynthesized AND has notes AND not triaged as
  // non-feedback — so "Synthesize N pending" matches what synthesis consumes.
  const synthesisEligible = useMemo(
    () => corrections.filter((c) => c.synthesizedAt == null && c.notes.length > 0 && c.category !== "non-feedback"),
    [corrections],
  );
  const isResolved = (c: CorrectionDetail) => c.synthesizedAt != null || c.category === "non-feedback";
  const inboxCount = useMemo(() => corrections.filter((c) => !isResolved(c)).length, [corrections]);
  const archiveCount = useMemo(() => corrections.filter(isResolved).length, [corrections]);

  // Report stats to parent
  useEffect(() => {
    const docs = new Set<string>();
    let untagged = 0;
    for (const c of corrections) {
      docs.add(c.documentTitle ?? "unknown");
      if (!c.writingType) untagged++;
    }
    onStatsChange({
      total: corrections.length,
      documentCount: docs.size,
      untaggedCount: untagged,
      unsynthesizedCount: synthesisEligible.length,
    });
  }, [corrections, onStatsChange, synthesisEligible, inboxCount]);

  // Filtering
  const filtered = useMemo(() =>
    corrections.filter((c) => {
      // View filter
      if (view === "inbox" && isResolved(c)) return false;
      if (view === "archive" && !isResolved(c)) return false;
      if (untaggedOnly && c.writingType) return false;
      if (activeFilter && c.writingType !== activeFilter) return false;
      if (polarityFilter && c.polarity !== polarityFilter) return false;
      if (searchText) {
        const q = searchText.toLowerCase();
        if (!c.originalText.toLowerCase().includes(q) &&
            !c.notes.some((n) => n.toLowerCase().includes(q))) return false;
      }
      return true;
    }),
    [corrections, view, activeFilter, searchText, untaggedOnly, polarityFilter],
  );

  const dateGroups = useMemo(() => groupByDate(filtered), [filtered]);

  const handleUpdateType = useCallback(async (highlightId: string, writingType: WritingType) => {
    try {
      await updateCorrectionWritingType(highlightId, writingType);
      setCorrections((prev) =>
        prev.map((c) => (c.highlightId === highlightId ? { ...c, writingType } : c)),
      );
    } catch (err) {
      reportError("Could not update writing type", err);
    }
  }, []);

  const handleDelete = useCallback(async (highlightId: string) => {
    try {
      await deleteCorrection(highlightId);
      setCorrections((prev) => prev.filter((c) => c.highlightId !== highlightId));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(highlightId);
        return next;
      });
    } catch (err) {
      reportError("Could not delete correction", err);
    }
  }, []);

  const handleAccept = useCallback(async (highlightId: string, matchText: string, suggestedEdit: string) => {
    try {
      const applied = await onAcceptEdit?.(highlightId, matchText, suggestedEdit);
      if (!applied) return;

      await acceptCorrection(highlightId);
      setCorrections((prev) =>
        prev.map((c) => c.highlightId === highlightId ? { ...c, acceptedAt: Date.now() } : c),
      );
    } catch (err) {
      reportError("Could not apply correction", err);
    }
  }, [onAcceptEdit]);

  const handleTriage = useCallback(async (highlightId: string) => {
    try {
      await setCorrectionCategory(highlightId, "non-feedback");
      setCorrections((prev) =>
        prev.map((c) => (c.highlightId === highlightId ? { ...c, category: "non-feedback" } : c)),
      );
    } catch (err) {
      reportError("Could not triage correction", err);
    }
  }, []);

  const handleToggleSelect = useCallback((highlightId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(highlightId)) {
        next.delete(highlightId);
      } else {
        next.add(highlightId);
      }
      return next;
    });
  }, []);

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    try {
      await bulkDeleteCorrections(Array.from(selectedIds));
      setCorrections((prev) => prev.filter((c) => !selectedIds.has(c.highlightId)));
      setSelectedIds(new Set());
    } catch (err) {
      reportError("Bulk delete failed", err);
    }
  }, [selectedIds]);

  const handleBulkTag = useCallback(async (writingType: string) => {
    if (selectedIds.size === 0) return;
    try {
      await bulkTagCorrections(Array.from(selectedIds), writingType);
      setCorrections((prev) =>
        prev.map((c) => (selectedIds.has(c.highlightId) ? { ...c, writingType } : c)),
      );
      setSelectedIds(new Set());
      setShowBulkTypeChips(false);
    } catch (err) {
      reportError("Bulk tagging failed", err);
    }
  }, [selectedIds]);

  const handleBulkRequeue = useCallback(async () => {
    if (selectedIds.size === 0) return;
    try {
      await markCorrectionsUnsynthesized(Array.from(selectedIds));
      setCorrections((prev) =>
        prev.map((c) => (selectedIds.has(c.highlightId) ? { ...c, synthesizedAt: null } : c)),
      );
      setSelectedIds(new Set());
    } catch (err) {
      reportError("Could not requeue corrections", err);
    }
  }, [selectedIds]);

  const handleLoadMore = useCallback(() => {
    const newLimit = limit + PAGE_SIZE;
    setLimit(newLimit);
    void loadCorrections(newLimit);
  }, [limit, loadCorrections]);

  const activeFilterCount = (activeFilter ? 1 : 0) + (polarityFilter ? 1 : 0) + (untaggedOnly ? 1 : 0);

  // Empty states teach the next step instead of announcing absence.
  const emptyState = useMemo((): { title: string; body: string } | null => {
    if (corrections.length === 0) {
      return {
        title: "No notes yet",
        body: "While you read, highlight a passage and write what's wrong with it, or what's right. Those notes collect here and become your rules.",
      };
    }
    if (view === "inbox" && inboxCount === 0 && archiveCount > 0) {
      return {
        title: "All caught up",
        body: "Every note has been turned into rules or set aside. New notes show up here as you read.",
      };
    }
    if (filtered.length === 0) {
      return { title: "No notes match", body: "Try a different search, or clear the filters." };
    }
    return null;
  }, [corrections.length, view, inboxCount, archiveCount, filtered.length]);

  return (
    <>
      {/* Same shape as Suggested and Rules: one search box, everything else behind Filter. */}
      <div className="flex shrink-0 flex-col gap-2 border-b border-[var(--color-border)] bg-[var(--color-page)] px-8 py-2.5">
        {selectedIds.size > 0 ? (
          <div className="flex h-[34px] items-center gap-3">
            <span className="text-[length:var(--text-sm)] font-medium text-[var(--color-text-primary)]">
              {selectedIds.size} selected
            </span>
            <button
              type="button"
              onClick={() => setShowBulkTypeChips(!showBulkTypeChips)}
              aria-expanded={showBulkTypeChips}
              aria-controls="corrections-bulk-tag-chips"
              className={BUTTON_SECONDARY_CLASS}
            >
              Set writing type
            </button>
            {view === "archive" && (
              <button
                type="button"
                onClick={handleBulkRequeue}
                title="Send these notes back to Waiting so they're used again"
                className={BUTTON_SECONDARY_CLASS}
              >
                Use again
              </button>
            )}
            <button
              type="button"
              onClick={handleBulkDelete}
              className={cn(BUTTON_SECONDARY_CLASS, "text-[var(--color-danger-text)]")}
            >
              Remove
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedIds(new Set());
                setShowBulkTypeChips(false);
              }}
              className={cn(LINK_BUTTON_CLASS, "ml-auto")}
            >
              Clear
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <ViewToggle
              view={view}
              onChangeView={(v) => {
                setView(v);
                setSelectedIds(new Set());
              }}
              inboxCount={inboxCount}
              archiveCount={archiveCount}
            />
            <div className="relative flex-1">
              <input
                ref={searchRef}
                type="search"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape" && searchText) {
                    e.stopPropagation();
                    setSearchText("");
                  }
                }}
                placeholder="Search notes"
                aria-label="Search notes"
                className={SEARCH_CLASS}
              />
              {!searchText && <SlashHint />}
            </div>
            <button
              type="button"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((o) => !o)}
              className={cn(BUTTON_SECONDARY_CLASS, "py-1.5 text-[length:var(--text-sm)]")}
            >
              Filter{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}
            </button>
          </div>
        )}

        {filtersOpen && selectedIds.size === 0 && (
          <div className="rule-room flex flex-wrap items-center gap-3" data-room>
            <div className="flex gap-1" role="group" aria-label="Kind of note">
              <Chip
                active={polarityFilter === "corrective"}
                onClick={() => setPolarityFilter(polarityFilter === "corrective" ? null : "corrective")}
                title="Notes about things to stop doing"
              >
                Avoid
              </Chip>
              <Chip
                active={polarityFilter === "positive"}
                onClick={() => setPolarityFilter(polarityFilter === "positive" ? null : "positive")}
                title="Notes about things to keep doing"
              >
                Do more
              </Chip>
            </div>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Writing type">
              {WRITING_TYPES.map((wt) => (
                <Chip
                  key={wt.value}
                  active={activeFilter === wt.value}
                  onClick={() => setActiveFilter(activeFilter === wt.value ? null : wt.value)}
                >
                  {wt.label}
                </Chip>
              ))}
              <Chip active={untaggedOnly} onClick={() => setUntaggedOnly((u) => !u)}>
                No type yet
              </Chip>
            </div>
          </div>
        )}
      </div>

      {/* Bulk tag chips */}
      {showBulkTypeChips && selectedIds.size > 0 && (
        <div id="corrections-bulk-tag-chips" className="border-b border-[var(--color-border)] bg-[var(--color-page)] px-8 py-2">
          <WritingTypeChips value={null} onChange={handleBulkTag} />
        </div>
      )}

      {/* Content area */}
      <div style={{ flex: 1, overflowY: "auto", padding: 0 }}>
        <div style={{ maxWidth: 960, padding: "16px 32px 64px" }}>
          {loading && corrections.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--color-text-secondary)", fontSize: "var(--text-sm)", padding: "64px 32px" }}>
              Loading...
            </div>
          ) : emptyState ? (
            <EmptyState title={emptyState.title}>{emptyState.body}</EmptyState>
          ) : (
            <>
              {Array.from(dateGroups.entries()).map(([dateLabel, items]) => (
                <div key={dateLabel}>
                  <div
                    style={{
                      fontSize: "var(--text-xs)",
                      fontWeight: 600,
                      color: "var(--color-text-tertiary)",
                      textTransform: "uppercase",
                      letterSpacing: "0.3px",
                      padding: "16px 0 6px",
                      borderBottom: "1px solid var(--color-border)",
                    }}
                  >
                    {dateLabel}
                  </div>
                  {items.map((c) => (
                    <CorrectionCard
                      key={c.highlightId}
                      correction={c}
                      isSelected={selectedIds.has(c.highlightId)}
                      onToggleSelect={handleToggleSelect}
                      onUpdateType={handleUpdateType}
                      onDelete={handleDelete}
                      onTriage={handleTriage}
                      onAccept={onAcceptEdit ? handleAccept : undefined}
                    />
                  ))}
                </div>
              ))}
              {corrections.length >= limit && (
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loading}
                  style={{
                    display: "block",
                    margin: "16px auto",
                    padding: "8px 24px",
                    fontSize: "var(--text-xs)",
                    color: "var(--color-text-secondary)",
                    backgroundColor: "var(--hover-bg)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-sm)",
                    cursor: loading ? "default" : "pointer",
                    opacity: loading ? 0.5 : 1,
                  }}
                >
                  {loading ? "Loading..." : "Load more"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
