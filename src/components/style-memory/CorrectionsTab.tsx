import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import type { CorrectionDetail } from "@/types/annotations";
import {
  getCorrectionsFlat,
  updateCorrectionWritingType,
  deleteCorrection,
  bulkDeleteCorrections,
  bulkTagCorrections,
  markCorrectionsUnsynthesized,
} from "@/lib/tauri-commands";
import { WRITING_TYPES, type WritingType } from "@/lib/writing-types";

const PAGE_SIZE = 500;
const FILTER_CHIP_TYPES = WRITING_TYPES.slice(0, 6);

type CorrectionView = "inbox" | "archive";

interface CorrectionsTabProps {
  onStatsChange: (stats: { total: number; documentCount: number; untaggedCount: number; unsynthesizedCount: number }) => void;
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
            fontSize: 10,
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
    fontSize: 11,
    border: "1px solid var(--color-border)",
    cursor: "pointer",
    transition: "all 100ms",
  };

  return (
    <div style={{ display: "flex" }}>
      <button
        type="button"
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
        Inbox ({inboxCount})
      </button>
      <button
        type="button"
        onClick={() => onChangeView("archive")}
        style={{
          ...buttonBase,
          borderRadius: "0 100px 100px 0",
          background: view === "archive" ? "var(--color-text-primary)" : "var(--color-page)",
          color: view === "archive" ? "var(--color-page)" : "var(--color-text-secondary)",
          fontWeight: view === "archive" ? 600 : 400,
        }}
      >
        Archive ({archiveCount})
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
}: {
  correction: CorrectionDetail;
  isSelected: boolean;
  onToggleSelect: (highlightId: string) => void;
  onUpdateType: (highlightId: string, writingType: WritingType) => void;
  onDelete: (highlightId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showTypeChips, setShowTypeChips] = useState(false);
  const typeChipsId = `writing-type-chips-${correction.highlightId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const isSynthesized = correction.synthesizedAt != null;

  return (
    <div
      onClick={() => setExpanded(!expanded)}
      style={{
        padding: "14px 0",
        borderBottom: "1px solid var(--color-border)",
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
            fontSize: 15,
            fontStyle: "italic",
            color: "var(--color-text-secondary)",
            lineHeight: 1.5,
            marginBottom: 4,
          }}
        >
          &ldquo;{correction.originalText}&rdquo;
        </div>
        {correction.notes.length > 0 && (
          <div style={{ fontFamily: "'Newsreader', Georgia, serif", fontSize: 14, color: "var(--color-text-primary)", lineHeight: 1.4, marginBottom: 6 }}>
            {correction.notes.join("; ")}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--color-text-tertiary, var(--color-text-secondary))" }}>
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
              fontSize: 12,
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
            {correction.writingType ?? "untagged"}
          </button>
          {correction.documentTitle && (
            <span style={{ color: "var(--color-accent)" }}>
              {correction.documentTitle}
            </span>
          )}
          <span>{formatRelativeTime(correction.createdAt)}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(correction.highlightId);
            }}
            style={{
              padding: 0,
              fontSize: 10,
              color: "var(--color-text-secondary)",
              background: "none",
              border: "none",
              cursor: "pointer",
              textDecoration: "underline",
              textUnderlineOffset: 2,
              opacity: 0.6,
            }}
          >
            Delete
          </button>
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
              fontSize: 12,
              color: "var(--color-text-secondary)",
              lineHeight: 1.6,
            }}
          >
            <div style={{ marginBottom: 6, fontSize: 10, fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.3px" }}>
              Extended context
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

export function CorrectionsTab({ onStatsChange }: CorrectionsTabProps) {
  const [corrections, setCorrections] = useState<CorrectionDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [searchText, setSearchText] = useState("");
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkTypeChips, setShowBulkTypeChips] = useState(false);
  const [view, setView] = useState<CorrectionView>("inbox");
  const loadedRef = useRef(false);

  const loadCorrections = useCallback(async (pageLimit: number) => {
    setLoading(true);
    try {
      const data = await getCorrectionsFlat(pageLimit);
      setCorrections(data);
    } catch (err) {
      console.error("Failed to load corrections:", err);
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

  // Counts for view toggle
  const inboxCount = useMemo(() => corrections.filter((c) => c.synthesizedAt == null).length, [corrections]);
  const archiveCount = useMemo(() => corrections.filter((c) => c.synthesizedAt != null).length, [corrections]);

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
      unsynthesizedCount: inboxCount,
    });
  }, [corrections, onStatsChange, inboxCount]);

  // Filtering
  const filtered = useMemo(() =>
    corrections.filter((c) => {
      // View filter
      if (view === "inbox" && c.synthesizedAt != null) return false;
      if (view === "archive" && c.synthesizedAt == null) return false;
      if (activeFilter && c.writingType !== activeFilter) return false;
      if (searchText) {
        const q = searchText.toLowerCase();
        if (!c.originalText.toLowerCase().includes(q) &&
            !c.notes.some((n) => n.toLowerCase().includes(q))) return false;
      }
      return true;
    }),
    [corrections, view, activeFilter, searchText],
  );

  const dateGroups = useMemo(() => groupByDate(filtered), [filtered]);

  const handleUpdateType = useCallback(async (highlightId: string, writingType: WritingType) => {
    try {
      await updateCorrectionWritingType(highlightId, writingType);
      setCorrections((prev) =>
        prev.map((c) => (c.highlightId === highlightId ? { ...c, writingType } : c)),
      );
    } catch (err) {
      console.error("Failed to update writing type:", err);
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
      console.error("Failed to delete correction:", err);
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
      console.error("Failed to bulk delete:", err);
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
      console.error("Failed to bulk tag:", err);
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
      console.error("Failed to requeue corrections:", err);
    }
  }, [selectedIds]);

  const handleLoadMore = useCallback(() => {
    const newLimit = limit + PAGE_SIZE;
    setLimit(newLimit);
    void loadCorrections(newLimit);
  }, [limit, loadCorrections]);

  const chipTypes = FILTER_CHIP_TYPES;

  // Empty state messages
  const emptyMessage = useMemo(() => {
    if (corrections.length === 0) {
      return "No corrections yet. Highlight text and add margin notes, then export to start collecting feedback.";
    }
    if (view === "inbox" && inboxCount === 0 && archiveCount > 0) {
      return "All caught up. Corrections have been exported for synthesis.";
    }
    if (filtered.length === 0) {
      return "No corrections match your filters.";
    }
    return null;
  }, [corrections.length, view, inboxCount, archiveCount, filtered.length]);

  return (
    <>
      {/* Filter bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 32px",
          borderBottom: "1px solid var(--color-border)",
          flexShrink: 0,
          background: "var(--color-page)",
        }}
      >
        <ViewToggle
          view={view}
          onChangeView={(v) => {
            setView(v);
            setSelectedIds(new Set());
          }}
          inboxCount={inboxCount}
          archiveCount={archiveCount}
        />
        <div style={{ position: "relative", flex: 1, maxWidth: 280 }}>
          <span aria-hidden="true" style={{ position: "absolute", left: 8, top: 7, color: "var(--color-text-secondary)", fontSize: 12, pointerEvents: "none" }}>
            &#x1F50D;
          </span>
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Filter corrections..."
            aria-label="Filter corrections"
            style={{
              width: "100%",
              padding: "6px 10px 6px 28px",
              fontSize: 12,
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
              background: "var(--color-page)",
              color: "var(--color-text-primary)",
              outline: "none",
            }}
          />
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setActiveFilter(null)}
            aria-pressed={!activeFilter}
            style={{
              padding: "3px 10px",
              fontSize: 11,
              border: "1px solid var(--color-border)",
              borderRadius: 100,
              background: !activeFilter ? "var(--color-text-primary)" : "var(--color-page)",
              color: !activeFilter ? "var(--color-page)" : "var(--color-text-secondary)",
              cursor: "pointer",
              transition: "all 100ms",
            }}
          >
            All
          </button>
          {chipTypes.map((wt) => (
            <button
              key={wt.value}
              type="button"
              onClick={() => setActiveFilter(activeFilter === wt.value ? null : wt.value)}
              aria-pressed={activeFilter === wt.value}
              style={{
                padding: "3px 10px",
                fontSize: 11,
                border: "1px solid var(--color-border)",
                borderRadius: 100,
                background: activeFilter === wt.value ? "var(--color-text-primary)" : "var(--color-page)",
                color: activeFilter === wt.value ? "var(--color-page)" : "var(--color-text-secondary)",
                cursor: "pointer",
                transition: "all 100ms",
              }}
            >
              {wt.label}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          {selectedIds.size > 0 && (
            <>
              <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
                {selectedIds.size} selected
              </span>
              {view === "archive" && (
                <button
                  type="button"
                  onClick={handleBulkRequeue}
                  style={{
                    padding: "4px 10px",
                    fontSize: 11,
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-sm)",
                    background: "var(--color-page)",
                    color: "var(--color-text-secondary)",
                    cursor: "pointer",
                  }}
                >
                  Requeue
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowBulkTypeChips(!showBulkTypeChips)}
                aria-expanded={showBulkTypeChips}
                aria-controls="corrections-bulk-tag-chips"
                style={{
                  padding: "4px 10px",
                  fontSize: 11,
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--color-page)",
                  color: "var(--color-text-secondary)",
                  cursor: "pointer",
                }}
              >
                Tag selected
              </button>
              <button
                type="button"
                onClick={handleBulkDelete}
                style={{
                  padding: "4px 10px",
                  fontSize: 11,
                  border: "1px solid var(--color-danger, #ef4444)",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--color-page)",
                  color: "var(--color-danger, #ef4444)",
                  cursor: "pointer",
                }}
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {/* Bulk tag chips */}
      {showBulkTypeChips && selectedIds.size > 0 && (
        <div id="corrections-bulk-tag-chips" style={{ padding: "8px 32px", borderBottom: "1px solid var(--color-border)", background: "var(--color-page)" }}>
          <WritingTypeChips value={null} onChange={handleBulkTag} />
        </div>
      )}

      {/* Content area */}
      <div style={{ flex: 1, overflowY: "auto", padding: 0 }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "16px 32px 64px" }}>
          {loading && corrections.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--color-text-secondary)", fontSize: 13, padding: "64px 32px" }}>
              Loading...
            </div>
          ) : emptyMessage || filtered.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--color-text-secondary)", fontSize: 13, padding: "64px 32px", lineHeight: 1.6 }}>
              {emptyMessage ?? "No corrections match your filters."}
            </div>
          ) : (
            <>
              {Array.from(dateGroups.entries()).map(([dateLabel, items]) => (
                <div key={dateLabel}>
                  <div
                    style={{
                      fontSize: 12,
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
                    fontSize: 12,
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
