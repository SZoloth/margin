import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import type { CorrectionDetail } from "@/types/annotations";
import {
  getCorrectionsFlat,
  updateCorrectionWritingType,
  deleteCorrection,
  bulkDeleteCorrections,
  bulkTagCorrections,
} from "@/lib/tauri-commands";
import { WRITING_TYPES, type WritingType } from "@/lib/writing-types";

const PAGE_SIZE = 500;
const FILTER_CHIP_TYPES = WRITING_TYPES.slice(0, 6);

interface CorrectionsTabProps {
  onStatsChange: (stats: { total: number; documentCount: number; untaggedCount: number }) => void;
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

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
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
            fontSize: 13,
            fontStyle: "italic",
            color: "var(--color-text-primary)",
            lineHeight: 1.5,
            marginBottom: 4,
            fontWeight: expanded ? 500 : 400,
          }}
        >
          &ldquo;{correction.originalText}&rdquo;
        </div>
        {correction.notes.length > 0 && (
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.4, marginBottom: 6 }}>
            {correction.notes.join("; ")}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, color: "var(--color-text-tertiary, var(--color-text-secondary))" }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowTypeChips(!showTypeChips);
            }}
            style={{
              padding: "1px 7px",
              fontSize: 10,
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
            <span style={{ textDecoration: "underline", textUnderlineOffset: 2 }}>
              {correction.documentTitle}
            </span>
          )}
          <span>{formatTime(correction.createdAt)}</span>
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
          <div style={{ marginTop: 6 }} onClick={(e) => e.stopPropagation()}>
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

  // Report stats to parent
  useEffect(() => {
    const docs = new Set<string>();
    let untagged = 0;
    for (const c of corrections) {
      docs.add(c.documentTitle ?? "unknown");
      if (!c.writingType) untagged++;
    }
    onStatsChange({ total: corrections.length, documentCount: docs.size, untaggedCount: untagged });
  }, [corrections, onStatsChange]);

  // Filtering
  const filtered = useMemo(() =>
    corrections.filter((c) => {
      if (activeFilter && c.writingType !== activeFilter) return false;
      if (searchText) {
        const q = searchText.toLowerCase();
        if (!c.originalText.toLowerCase().includes(q) &&
            !c.notes.some((n) => n.toLowerCase().includes(q))) return false;
      }
      return true;
    }),
    [corrections, activeFilter, searchText],
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

  const handleLoadMore = useCallback(() => {
    const newLimit = limit + PAGE_SIZE;
    setLimit(newLimit);
    void loadCorrections(newLimit);
  }, [limit, loadCorrections]);

  const chipTypes = FILTER_CHIP_TYPES;

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
        <div style={{ position: "relative", flex: 1, maxWidth: 280 }}>
          <span style={{ position: "absolute", left: 8, top: 7, color: "var(--color-text-secondary)", fontSize: 12, pointerEvents: "none" }}>
            &#x1F50D;
          </span>
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search corrections..."
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
              <button
                type="button"
                onClick={() => setShowBulkTypeChips(!showBulkTypeChips)}
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
        <div style={{ padding: "8px 32px", borderBottom: "1px solid var(--color-border)", background: "var(--color-page)" }}>
          <WritingTypeChips value={null} onChange={handleBulkTag} />
        </div>
      )}

      {/* Content area */}
      <div style={{ flex: 1, overflowY: "auto", padding: 0 }}>
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "16px 32px 64px" }}>
          {loading && corrections.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--color-text-secondary)", fontSize: 13, padding: "64px 32px" }}>
              Loading...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--color-text-secondary)", fontSize: 13, padding: "64px 32px", lineHeight: 1.6 }}>
              {corrections.length === 0
                ? "No corrections yet. Highlight text and add margin notes, then export to start collecting feedback."
                : "No corrections match your filters."}
            </div>
          ) : (
            <>
              {Array.from(dateGroups.entries()).map(([dateLabel, items]) => (
                <div key={dateLabel}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--color-text-secondary)",
                      textTransform: "uppercase",
                      letterSpacing: "0.3px",
                      padding: "16px 0 6px",
                      borderBottom: "1px solid var(--color-border)",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    {dateLabel}
                    <span style={{ fontWeight: 400 }}>
                      &middot; {items.length} correction{items.length === 1 ? "" : "s"}
                    </span>
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
