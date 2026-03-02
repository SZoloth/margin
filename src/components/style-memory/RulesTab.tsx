import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import type { WritingRule, WritingRuleSeverity } from "@/lib/tauri-commands";
import {
  getWritingRules,
  updateWritingRule,
  deleteWritingRule,
  exportWritingRules,
} from "@/lib/tauri-commands";

interface RulesTabProps {
  onStatsChange: (stats: { ruleCount: number }) => void;
}

interface SeverityStyle {
  bg: string;
  color: string;
  border: string;
  darkBg: string;
  darkColor: string;
  darkBorder: string;
}

const DEFAULT_SEVERITY: SeverityStyle = { bg: "#fffbeb", color: "#92400e", border: "#fde68a", darkBg: "#3b3520", darkColor: "#facc15", darkBorder: "#5c4a20" };

const SEVERITY_VALUES: WritingRuleSeverity[] = ["must-fix", "should-fix", "nice-to-fix"];

const SEVERITY_STYLES: Record<string, SeverityStyle> = {
  "must-fix": { bg: "#fef2f2", color: "#b91c1c", border: "#fecaca", darkBg: "#3b1c1c", darkColor: "#f87171", darkBorder: "#5c2020" },
  "should-fix": DEFAULT_SEVERITY,
  "nice-to-fix": { bg: "#f0fdf4", color: "#166534", border: "#bbf7d0", darkBg: "#1c3b25", darkColor: "#4ade80", darkBorder: "#205c30" },
};

const darkModeQuery = window.matchMedia("(prefers-color-scheme: dark)");

function SeverityBadge({ severity }: { severity: string }) {
  const style = SEVERITY_STYLES[severity] ?? DEFAULT_SEVERITY;
  const isDark = document.documentElement.classList.contains("dark") || darkModeQuery.matches;

  return (
    <span
      style={{
        padding: "2px 8px",
        fontSize: 9,
        fontWeight: 600,
        borderRadius: 100,
        textTransform: "uppercase",
        letterSpacing: "0.3px",
        flexShrink: 0,
        background: isDark ? style.darkBg : style.bg,
        color: isDark ? style.darkColor : style.color,
        border: `1px solid ${isDark ? style.darkBorder : style.border}`,
      }}
    >
      {severity}
    </span>
  );
}

function SignalBar({ count, max = 7 }: { count: number; max?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--color-text-secondary)" }}>
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

function RuleCard({
  rule,
  onUpdate,
  onDelete,
}: {
  rule: WritingRule;
  onUpdate: (id: string, updates: Partial<WritingRule>) => Promise<void>;
  onDelete: (id: string) => void;
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
    fontSize: 12,
    fontFamily: "'Inter', system-ui, sans-serif",
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
            <label style={{ fontSize: 10, fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.3px" }}>Rule text</label>
            <input value={editFields.ruleText} onChange={(e) => setEditFields({ ...editFields, ruleText: e.target.value })} style={inputStyle} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 10, fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.3px" }}>Severity</label>
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
              <label style={{ fontSize: 10, fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.3px" }}>When to apply</label>
              <input value={editFields.whenToApply} onChange={(e) => setEditFields({ ...editFields, whenToApply: e.target.value })} style={inputStyle} placeholder="When to apply..." />
            </div>
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.3px" }}>Why</label>
            <input value={editFields.why} onChange={(e) => setEditFields({ ...editFields, why: e.target.value })} style={inputStyle} placeholder="Why this matters..." />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 10, fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.3px" }}>Before</label>
              <input value={editFields.exampleBefore} onChange={(e) => setEditFields({ ...editFields, exampleBefore: e.target.value })} style={inputStyle} placeholder="Before example..." />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 10, fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.3px" }}>After</label>
              <input value={editFields.exampleAfter} onChange={(e) => setEditFields({ ...editFields, exampleAfter: e.target.value })} style={inputStyle} placeholder="After example..." />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button type="button" onClick={handleSave} style={{ padding: "4px 12px", fontSize: 11, fontFamily: "'Inter', system-ui, sans-serif", background: "var(--color-text-primary)", color: "var(--color-page)", border: "none", borderRadius: "var(--radius-sm)", cursor: "pointer" }}>
              Save
            </button>
            <button type="button" onClick={handleCancel} style={{ padding: "4px 12px", fontSize: 11, fontFamily: "'Inter', system-ui, sans-serif", background: "var(--color-page)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-sm)", cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "14px 0", borderBottom: "1px solid var(--color-border)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", flex: 1, lineHeight: 1.4 }}>
          {rule.ruleText}
        </div>
        <SeverityBadge severity={rule.severity} />
      </div>

      {rule.whenToApply && (
        <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.4, marginBottom: 4 }}>
          <strong style={{ fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", fontSize: 9, letterSpacing: "0.3px" }}>When </strong>
          {rule.whenToApply}
        </div>
      )}
      {rule.why && (
        <div style={{ fontSize: 11, color: "var(--color-text-secondary)", lineHeight: 1.4, marginBottom: 4 }}>
          <strong style={{ fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", fontSize: 9, letterSpacing: "0.3px" }}>Why </strong>
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
            fontSize: 11,
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
        <button
          type="button"
          onClick={() => setEditing(true)}
          style={{
            fontSize: 10,
            color: "var(--color-text-secondary)",
            background: "none",
            border: "none",
            cursor: "pointer",
            textDecoration: "underline",
            textUnderlineOffset: 2,
            fontFamily: "'Inter', system-ui, sans-serif",
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
              fontSize: 10,
              color: "var(--color-text-secondary)",
              background: "none",
              border: "none",
              cursor: "pointer",
              textDecoration: "underline",
              textUnderlineOffset: 2,
              fontFamily: "'Inter', system-ui, sans-serif",
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
                fontSize: 10,
                color: "var(--color-danger, #ef4444)",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontWeight: 600,
                fontFamily: "'Inter', system-ui, sans-serif",
                padding: 0,
              }}
            >
              Confirm delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              style={{
                fontSize: 10,
                color: "var(--color-text-secondary)",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontFamily: "'Inter', system-ui, sans-serif",
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
  const exportTimeoutRef = useRef<number | null>(null);
  const loadedRef = useRef(false);

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
    onStatsChange({ ruleCount: rules.length });
  }, [rules, onStatsChange]);

  useEffect(() => {
    return () => {
      if (exportTimeoutRef.current !== null) {
        window.clearTimeout(exportTimeoutRef.current);
      }
    };
  }, []);

  const filtered = useMemo(() =>
    rules.filter((r) => !severityFilter || r.severity === severityFilter),
    [rules, severityFilter],
  );

  const categoryGroups = useMemo(() => groupByCategory(filtered), [filtered]);

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
    } catch (err) {
      console.error("Failed to update rule:", err);
      throw err;
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await deleteWritingRule(id);
      setRules((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.error("Failed to delete rule:", err);
    }
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
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setSeverityFilter(null)}
            style={{
              padding: "3px 10px",
              fontSize: 11,
              fontFamily: "'Inter', system-ui, sans-serif",
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
                fontSize: 11,
                fontFamily: "'Inter', system-ui, sans-serif",
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
          {exportStatus && (
            <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
              {exportStatus}
            </span>
          )}
          <button
            type="button"
            onClick={handleExport}
            style={{
              padding: "4px 12px",
              fontSize: 11,
              fontWeight: 500,
              fontFamily: "'Inter', system-ui, sans-serif",
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
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "16px 32px 64px" }}>
          {loading && rules.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--color-text-secondary)", fontSize: 13, padding: "64px 32px" }}>
              Loading...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--color-text-secondary)", fontSize: 13, padding: "64px 32px", lineHeight: 1.6 }}>
              {rules.length === 0
                ? "No writing rules yet. Export corrections for synthesis to generate rules."
                : "No rules match this filter."}
            </div>
          ) : (
            Array.from(categoryGroups.entries()).map(([category, categoryRules]) => (
              <div key={category}>
                <button
                  type="button"
                  onClick={() => toggleCategory(category)}
                  style={{
                    width: "100%",
                    fontSize: 14,
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
                    fontFamily: "'Inter', system-ui, sans-serif",
                    textAlign: "left",
                  }}
                >
                  <span>{formatCategoryLabel(category)}</span>
                  <span style={{ fontSize: 11, fontWeight: 400, color: "var(--color-text-secondary)" }}>
                    {categoryRules.length} rule{categoryRules.length === 1 ? "" : "s"}
                    <span style={{
                      display: "inline-block",
                      marginLeft: 6,
                      fontSize: 10,
                      transform: collapsedCategories.has(category) ? "rotate(-90deg)" : "rotate(0deg)",
                      transition: "transform 150ms ease",
                    }}>
                      &#9660;
                    </span>
                  </span>
                </button>
                {!collapsedCategories.has(category) &&
                  categoryRules.map((rule) => (
                    <RuleCard
                      key={rule.id}
                      rule={rule}
                      onUpdate={handleUpdate}
                      onDelete={handleDelete}
                    />
                  ))}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
