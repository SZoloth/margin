import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import type { WritingRule, WritingRuleSeverity } from "@/lib/tauri-commands";
import {
  getWritingRules,
  updateWritingRule,
  deleteWritingRule,
  exportWritingRules,
  markRulesReviewed,
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

function SourceBadge({ source }: { source: string }) {
  const label = source === "synthesis" ? "synthesized" : source;
  return (
    <span
      style={{
        fontSize: "var(--text-2xs)",
        color: "var(--color-text-secondary)",
        opacity: 0.7,
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}

function SignalBar({ count, max = 7 }: { count: number; max?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "var(--text-2xs)", color: "var(--color-text-secondary)" }}>
      <div style={{ display: "flex", gap: 1 }}>
        {Array.from({ length: max }, (_, i) => (
          <div
            key={i}
            style={{
              width: 4,
              height: 10,
              borderRadius: 1,
              background: i < count ? "var(--color-text-primary)" : "var(--color-border)",
            }}
          />
        ))}
      </div>
      {count} signal{count === 1 ? "" : "s"}
    </div>
  );
}

function ViewToggle({
  view,
  onChangeView,
  unreviewedCount,
  allCount,
}: {
  view: RulesView;
  onChangeView: (v: RulesView) => void;
  unreviewedCount: number;
  allCount: number;
}) {
  const buttonBase: React.CSSProperties = {
    padding: "3px 10px",
    fontSize: "var(--text-xxs)",
    border: "1px solid var(--color-border)",
    cursor: "pointer",
    transition: "all 100ms",
  };

  return (
    <div style={{ display: "flex" }}>
      <button
        type="button"
        onClick={() => onChangeView("unreviewed")}
        style={{
          ...buttonBase,
          borderRadius: "100px 0 0 100px",
          borderRight: "none",
          background: view === "unreviewed" ? "var(--color-text-primary)" : "var(--color-page)",
          color: view === "unreviewed" ? "var(--color-page)" : "var(--color-text-secondary)",
          fontWeight: view === "unreviewed" ? 600 : 400,
        }}
      >
        To review ({unreviewedCount})
      </button>
      <button
        type="button"
        onClick={() => onChangeView("all")}
        style={{
          ...buttonBase,
          borderRadius: "0 100px 100px 0",
          background: view === "all" ? "var(--color-text-primary)" : "var(--color-page)",
          color: view === "all" ? "var(--color-page)" : "var(--color-text-secondary)",
          fontWeight: view === "all" ? 600 : 400,
        }}
      >
        All ({allCount})
      </button>
    </div>
  );
}

function RuleCard({
  rule,
  onUpdate,
  onDelete,
  onMarkReviewed,
}: {
  rule: WritingRule;
  onUpdate: (id: string, updates: Partial<WritingRule>) => Promise<void>;
  onDelete: (id: string) => void;
  onMarkReviewed: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editFields, setEditFields] = useState({
    ruleText: rule.ruleText,
    severity: rule.severity,
    whenToApply: rule.whenToApply ?? "",
    why: rule.why ?? "",
    exampleBefore: rule.exampleBefore ?? "",
    exampleAfter: rule.exampleAfter ?? "",
    notes: rule.notes ?? "",
  });

  const handleSave = useCallback(async () => {
    try {
      await onUpdate(rule.id, {
        ruleText: editFields.ruleText,
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
    setEditFields({
      ruleText: rule.ruleText,
      severity: rule.severity,
      whenToApply: rule.whenToApply ?? "",
      why: rule.why ?? "",
      exampleBefore: rule.exampleBefore ?? "",
      exampleAfter: rule.exampleAfter ?? "",
      notes: rule.notes ?? "",
    });
    setEditing(false);
  }, [rule]);

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "4px 8px",
    fontSize: "var(--text-xs)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-sm)",
    background: "var(--color-page)",
    color: "var(--color-text-primary)",
    outline: "none",
  };

  if (editing) {
    return (
      <div style={{ padding: "14px 0", borderBottom: "1px solid var(--color-border)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div>
            <label style={{ fontSize: "var(--text-2xs)", fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.3px" }}>Rule text</label>
            <input value={editFields.ruleText} onChange={(e) => setEditFields({ ...editFields, ruleText: e.target.value })} style={inputStyle} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: "var(--text-2xs)", fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.3px" }}>Severity</label>
              <select
                value={editFields.severity}
                onChange={(e) => setEditFields({ ...editFields, severity: e.target.value as WritingRule["severity"] })}
                style={{ ...inputStyle, cursor: "pointer" }}
              >
                <option value="must-fix">Must-fix</option>
                <option value="should-fix">Should-fix</option>
                <option value="nice-to-fix">Nice-to-fix</option>
              </select>
            </div>
            <div style={{ flex: 2 }}>
              <label style={{ fontSize: "var(--text-2xs)", fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.3px" }}>When to apply</label>
              <input value={editFields.whenToApply} onChange={(e) => setEditFields({ ...editFields, whenToApply: e.target.value })} style={inputStyle} placeholder="When to apply..." />
            </div>
          </div>
          <div>
            <label style={{ fontSize: "var(--text-2xs)", fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.3px" }}>Why</label>
            <input value={editFields.why} onChange={(e) => setEditFields({ ...editFields, why: e.target.value })} style={inputStyle} placeholder="Why this matters..." />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: "var(--text-2xs)", fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.3px" }}>Before</label>
              <input value={editFields.exampleBefore} onChange={(e) => setEditFields({ ...editFields, exampleBefore: e.target.value })} style={inputStyle} placeholder="Before example..." />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: "var(--text-2xs)", fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.3px" }}>After</label>
              <input value={editFields.exampleAfter} onChange={(e) => setEditFields({ ...editFields, exampleAfter: e.target.value })} style={inputStyle} placeholder="After example..." />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button type="button" onClick={handleSave} style={{ padding: "4px 12px", fontSize: "var(--text-xxs)", background: "var(--color-text-primary)", color: "var(--color-page)", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer" }}>
              Save
            </button>
            <button type="button" onClick={handleCancel} style={{ padding: "4px 12px", fontSize: "var(--text-xxs)", background: "var(--color-page)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isUnreviewed = rule.reviewedAt == null;

  return (
    <div style={{ padding: "14px 0", borderBottom: "1px solid var(--color-border)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
        <div style={{ fontSize: "var(--text-sm)", fontWeight: 500, color: "var(--color-text-primary)", flex: 1, lineHeight: 1.4 }}>
          {rule.ruleText}
        </div>
        <SourceBadge source={rule.source} />
        <SeverityBadge severity={rule.severity} />
      </div>

      {rule.whenToApply && (
        <div style={{ fontSize: "var(--text-xxs)", color: "var(--color-text-secondary)", lineHeight: 1.4, marginBottom: 4 }}>
          <strong style={{ fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", fontSize: "var(--text-3xs)", letterSpacing: "0.3px" }}>When </strong>
          {rule.whenToApply}
        </div>
      )}
      {rule.why && (
        <div style={{ fontSize: "var(--text-xxs)", color: "var(--color-text-secondary)", lineHeight: 1.4, marginBottom: 4 }}>
          <strong style={{ fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", fontSize: "var(--text-3xs)", letterSpacing: "0.3px" }}>Why </strong>
          {rule.why}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
        <SignalBar count={rule.signalCount} />
      </div>

      {(rule.exampleBefore || rule.exampleAfter) && (
        <div
          style={{
            marginTop: 8,
            padding: "8px 12px",
            background: "var(--color-sidebar, var(--hover-bg))",
            borderRadius: "var(--radius-sm)",
            fontSize: "var(--text-xxs)",
            lineHeight: 1.5,
          }}
        >
          {rule.exampleBefore && (
            <span style={{ color: "var(--color-danger, #ef4444)", textDecoration: "line-through", textDecorationColor: "rgba(239,68,68,0.3)" }}>
              {rule.exampleBefore}
            </span>
          )}
          {rule.exampleBefore && rule.exampleAfter && (
            <span style={{ color: "var(--color-text-secondary)", margin: "0 4px" }}>&rarr;</span>
          )}
          {rule.exampleAfter && (
            <span style={{ color: "var(--color-success, #22c55e)" }}>
              {rule.exampleAfter}
            </span>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        {isUnreviewed && (
          <button
            type="button"
            onClick={() => onMarkReviewed(rule.id)}
            style={{
              fontSize: "var(--text-2xs)",
              color: "var(--color-accent)",
              background: "none",
              border: "none",
              cursor: "pointer",
              textDecoration: "underline",
              textUnderlineOffset: 2,
              padding: 0,
            }}
          >
            Mark reviewed
          </button>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          style={{
            fontSize: "var(--text-2xs)",
            color: "var(--color-text-secondary)",
            background: "none",
            border: "none",
            cursor: "pointer",
            textDecoration: "underline",
            textUnderlineOffset: 2,
            padding: 0,
          }}
        >
          Edit
        </button>
        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            style={{
              fontSize: "var(--text-2xs)",
              color: "var(--color-text-secondary)",
              background: "none",
              border: "none",
              cursor: "pointer",
              textDecoration: "underline",
              textUnderlineOffset: 2,
              padding: 0,
            }}
          >
            Delete
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => {
                onDelete(rule.id);
                setConfirmDelete(false);
              }}
              style={{
                fontSize: "var(--text-2xs)",
                color: "var(--color-danger, #ef4444)",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontWeight: 600,
                padding: 0,
              }}
            >
              Confirm delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              style={{
                fontSize: "var(--text-2xs)",
                color: "var(--color-text-secondary)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            >
              Cancel
            </button>
          </>
        )}
      </div>
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

export function RulesTab({ onStatsChange }: RulesTabProps) {
  const [rules, setRules] = useState<WritingRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const exportTimeoutRef = useRef<number | null>(null);
  const loadedRef = useRef(false);

  const unreviewedCount = useMemo(() => rules.filter((r) => r.reviewedAt == null).length, [rules]);
  const [view, setView] = useState<RulesView>("unreviewed");

  // Smart default: show "all" if nothing to review
  const effectiveView = view === "unreviewed" && unreviewedCount === 0 && rules.length > 0 ? "all" : view;

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getWritingRules();
      setRules(data);
    } catch (err) {
      console.error("Failed to load rules:", err);
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
      if (exportTimeoutRef.current !== null) {
        window.clearTimeout(exportTimeoutRef.current);
      }
    };
  }, []);

  const filtered = useMemo(() =>
    rules.filter((r) => {
      if (effectiveView === "unreviewed" && r.reviewedAt != null) return false;
      if (severityFilter && r.severity !== severityFilter) return false;
      return true;
    }),
    [rules, effectiveView, severityFilter],
  );

  const categoryGroups = useMemo(() => groupByCategory(filtered), [filtered]);

  const autoExportAfterRuleMutation = useCallback(async () => {
    try {
      await exportWritingRules();
    } catch (err) {
      console.error("Auto-export after rule mutation failed:", err);
    }
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
      console.error("Failed to update rule:", err);
      throw err;
    }
  }, [autoExportAfterRuleMutation]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteWritingRule(id);
      setRules((prev) => prev.filter((r) => r.id !== id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      void autoExportAfterRuleMutation();
    } catch (err) {
      console.error("Failed to delete rule:", err);
    }
  }, [autoExportAfterRuleMutation]);

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
      console.error("Failed to mark rule reviewed:", err);
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
      console.error("Failed to bulk mark reviewed:", err);
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

  const handleExport = useCallback(async () => {
    try {
      const result = await exportWritingRules();
      setExportStatus(`Exported ${result.ruleCount} rules to ${result.markdownPath}`);
      if (exportTimeoutRef.current !== null) {
        window.clearTimeout(exportTimeoutRef.current);
      }
      exportTimeoutRef.current = window.setTimeout(() => setExportStatus(null), 5000);
    } catch (err) {
      console.error("Failed to export rules:", err);
      setExportStatus("Export failed");
    }
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

  const severityChips: WritingRuleSeverity[] = SEVERITY_VALUES;

  // Empty state
  const emptyMessage = useMemo(() => {
    if (rules.length === 0) {
      return "No writing rules yet. Export corrections for synthesis to generate rules.";
    }
    if (effectiveView === "unreviewed" && unreviewedCount === 0) {
      return "No new rules to review. Export corrections for synthesis to generate rules.";
    }
    if (filtered.length === 0) {
      return "No rules match this filter.";
    }
    return null;
  }, [rules.length, effectiveView, unreviewedCount, filtered.length]);

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
          view={effectiveView}
          onChangeView={(v) => {
            setView(v);
            setSelectedIds(new Set());
          }}
          unreviewedCount={unreviewedCount}
          allCount={rules.length}
        />
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setSeverityFilter(null)}
            style={{
              padding: "3px 10px",
              fontSize: "var(--text-xs)",
              border: "1px solid var(--color-border)",
              borderRadius: 100,
              background: !severityFilter ? "var(--color-text-primary)" : "var(--color-page)",
              color: !severityFilter ? "var(--color-page)" : "var(--color-text-secondary)",
              cursor: "pointer",
            }}
          >
            All
          </button>
          {severityChips.map((sev) => (
            <button
              key={sev}
              type="button"
              onClick={() => setSeverityFilter(severityFilter === sev ? null : sev)}
              style={{
                padding: "3px 10px",
                fontSize: "var(--text-xs)",
                border: "1px solid var(--color-border)",
                borderRadius: 100,
                background: severityFilter === sev ? "var(--color-text-primary)" : "var(--color-page)",
                color: severityFilter === sev ? "var(--color-page)" : "var(--color-text-secondary)",
                cursor: "pointer",
              }}
            >
              {sev.charAt(0).toUpperCase() + sev.slice(1)}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          {selectedIds.size > 0 && effectiveView === "unreviewed" && (
            <>
              <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}>
                {selectedIds.size} selected
              </span>
              <button
                type="button"
                onClick={handleBulkMarkReviewed}
                style={{
                  padding: "4px 10px",
                  fontSize: "var(--text-xs)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--color-page)",
                  color: "var(--color-text-secondary)",
                  cursor: "pointer",
                }}
              >
                Mark reviewed
              </button>
            </>
          )}
          {exportStatus && (
            <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}>
              {exportStatus}
            </span>
          )}
          <button
            type="button"
            onClick={handleExport}
            style={{
              padding: "4px 12px",
              fontSize: "var(--text-xs)",
              fontWeight: 500,
              background: "var(--color-text-primary)",
              color: "var(--color-page)",
              border: "1px solid var(--color-text-primary)",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
            }}
          >
            Export rules + hook
          </button>
        </div>
      </div>

      {/* Content area */}
      <div style={{ flex: 1, overflowY: "auto", padding: 0 }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: "16px 32px 64px" }}>
          {loading && rules.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--color-text-secondary)", fontSize: "var(--text-sm)", padding: "64px 32px" }}>
              Loading...
            </div>
          ) : emptyMessage ? (
            <div style={{ textAlign: "center", color: "var(--color-text-secondary)", fontSize: "var(--text-sm)", padding: "64px 32px", lineHeight: 1.6 }}>
              {emptyMessage}
            </div>
          ) : (
            Array.from(categoryGroups.entries()).map(([category, categoryRules]) => (
              <div key={category}>
                <button
                  type="button"
                  onClick={() => toggleCategory(category)}
                  style={{
                    width: "100%",
                    fontSize: "var(--text-base)",
                    fontWeight: 600,
                    color: "var(--color-text-primary)",
                    padding: "20px 0 8px",
                    borderBottom: "1px solid var(--color-border)",
                    borderTop: "none",
                    borderLeft: "none",
                    borderRight: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: "none",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span>{formatCategoryLabel(category)}</span>
                  <span style={{ fontSize: "var(--text-xs)", fontWeight: 400, color: "var(--color-text-secondary)" }}>
                    {categoryRules.length} rule{categoryRules.length === 1 ? "" : "s"}
                    <span style={{
                      display: "inline-block",
                      marginLeft: 6,
                      fontSize: "var(--text-xs)",
                      transform: collapsedCategories.has(category) ? "rotate(-90deg)" : "rotate(0deg)",
                      transition: "transform 150ms ease",
                    }}>
                      {"\u25BE"}
                    </span>
                  </span>
                </button>
                {!collapsedCategories.has(category) &&
                  categoryRules.map((rule) => (
                    <div key={rule.id} style={{ display: "flex", alignItems: "flex-start" }}>
                      {effectiveView === "unreviewed" && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(rule.id)}
                          onChange={() => handleToggleSelect(rule.id)}
                          style={{ marginTop: 18, marginRight: 8, flexShrink: 0, accentColor: "var(--color-text-primary)" }}
                        />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <RuleCard
                          rule={rule}
                          onUpdate={handleUpdate}
                          onDelete={handleDelete}
                          onMarkReviewed={handleMarkReviewed}
                        />
                      </div>
                    </div>
                  ))}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
