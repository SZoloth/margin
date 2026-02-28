import { useEffect, useState, useCallback, useRef } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import type { DocumentCorrections, CorrectionDetail } from "@/types/annotations";
import {
  getCorrectionsByDocument,
  updateCorrectionWritingType,
  deleteCorrection,
  exportCorrectionsJson,
} from "@/lib/tauri-commands";
import { useAnimatedPresence } from "@/hooks/useAnimatedPresence";
import { WRITING_TYPES } from "@/lib/writing-types";

const PAGE_SIZE = 50;

interface CorrectionsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

function WritingTypeChips({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string) => void;
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
            fontFamily: "'Inter', system-ui, sans-serif",
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

function CorrectionItem({
  correction,
  onUpdateType,
  onDelete,
}: {
  correction: CorrectionDetail;
  onUpdateType: (highlightId: string, writingType: string) => void;
  onDelete: (highlightId: string) => void;
}) {
  const [showTypeChips, setShowTypeChips] = useState(false);
  const truncatedText =
    correction.originalText.length > 100
      ? correction.originalText.slice(0, 97) + "\u2026"
      : correction.originalText;

  return (
    <div
      style={{
        padding: "8px 0",
        borderBottom: "1px solid var(--color-border)",
        fontSize: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
        {/* Color dot */}
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: `var(--color-highlight-${correction.highlightColor}, var(--color-highlight-yellow))`,
            flexShrink: 0,
            marginTop: 4,
          }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Original text */}
          <div
            style={{
              color: "var(--color-text-primary)",
              fontStyle: "italic",
              marginBottom: 4,
            }}
          >
            "{truncatedText}"
          </div>
          {/* Notes */}
          {correction.notes.length > 0 && (
            <div style={{ color: "var(--color-text-secondary)", marginBottom: 4 }}>
              {correction.notes.join("; ")}
            </div>
          )}
          {/* Writing type tag + actions */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <button
              type="button"
              onClick={() => setShowTypeChips(!showTypeChips)}
              style={{
                padding: "1px 6px",
                fontSize: 10,
                fontFamily: "'Inter', system-ui, sans-serif",
                color: "var(--color-text-secondary)",
                backgroundColor: correction.writingType ? "var(--hover-bg)" : "transparent",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
              }}
            >
              {correction.writingType ?? "untagged"}
            </button>
            <button
              type="button"
              onClick={() => onDelete(correction.highlightId)}
              style={{
                padding: "1px 6px",
                fontSize: 10,
                fontFamily: "'Inter', system-ui, sans-serif",
                color: "var(--color-text-secondary)",
                backgroundColor: "transparent",
                border: "none",
                cursor: "pointer",
                opacity: 0.6,
              }}
            >
              Delete
            </button>
          </div>
          {showTypeChips && (
            <div style={{ marginTop: 4 }}>
              <WritingTypeChips
                value={correction.writingType}
                onChange={(v) => {
                  onUpdateType(correction.highlightId, v);
                  setShowTypeChips(false);
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DocumentGroup({
  group,
  onUpdateType,
  onDelete,
}: {
  group: DocumentCorrections;
  onUpdateType: (highlightId: string, writingType: string) => void;
  onDelete: (highlightId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div style={{ marginBottom: 12 }}>
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          padding: "6px 0",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span
          style={{
            fontSize: 10,
            color: "var(--color-text-secondary)",
            transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
            transition: "transform 150ms ease",
          }}
        >
          &#9660;
        </span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--color-text-primary)",
          }}
        >
          {group.documentTitle ?? "Untitled"}
        </span>
        <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>
          ({group.corrections.length})
        </span>
      </button>
      {!collapsed &&
        group.corrections.map((c) => (
          <CorrectionItem
            key={c.highlightId}
            correction={c}
            onUpdateType={onUpdateType}
            onDelete={onDelete}
          />
        ))}
    </div>
  );
}

export function CorrectionsPanel({ isOpen, onClose }: CorrectionsPanelProps) {
  const [groups, setGroups] = useState<DocumentCorrections[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const { isMounted, isVisible } = useAnimatedPresence(isOpen, 200);
  const exportTimeoutRef = useRef<number | null>(null);

  const loadCorrections = useCallback(async (pageLimit: number) => {
    setLoading(true);
    try {
      const data = await getCorrectionsByDocument(pageLimit);
      setGroups(data);
      const total = data.reduce((sum, g) => sum + g.corrections.length, 0);
      setTotalCount(total);
    } catch (err) {
      console.error("Failed to load corrections:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setLimit(PAGE_SIZE);
      void loadCorrections(PAGE_SIZE);
    }
  }, [isOpen, loadCorrections]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    return () => {
      if (exportTimeoutRef.current !== null) {
        window.clearTimeout(exportTimeoutRef.current);
      }
    };
  }, []);

  const handleUpdateType = useCallback(
    async (highlightId: string, writingType: string) => {
      try {
        await updateCorrectionWritingType(highlightId, writingType);
        setGroups((prev) =>
          prev.map((g) => ({
            ...g,
            corrections: g.corrections.map((c) =>
              c.highlightId === highlightId ? { ...c, writingType } : c,
            ),
          })),
        );
      } catch (err) {
        console.error("Failed to update writing type:", err);
      }
    },
    [],
  );

  const handleDelete = useCallback(
    async (highlightId: string) => {
      try {
        await deleteCorrection(highlightId);
        setGroups((prev) =>
          prev
            .map((g) => ({
              ...g,
              corrections: g.corrections.filter(
                (c) => c.highlightId !== highlightId,
              ),
            }))
            .filter((g) => g.corrections.length > 0),
        );
        setTotalCount((prev) => prev - 1);
      } catch (err) {
        console.error("Failed to delete correction:", err);
      }
    },
    [],
  );

  const handleExportForSynthesis = useCallback(async () => {
    try {
      const count = await exportCorrectionsJson();
      if (count === 0) {
        setExportStatus("No corrections to export");
      } else {
        const prompt = `Objective
- Convert writing corrections from ~/.margin/corrections-export.json into actionable writing rules in ~/.margin/writing-rules.md.
- Done when: (1) rules are grouped and de-duplicated, (2) each rule has ≥1 before/after example grounded in the corrections, (3) only the "## Learned from corrections" section is added/updated while all other existing content is preserved verbatim.

Context / Inputs
- Input JSON: ~/.margin/corrections-export.json (${count} corrections)
- Output Markdown: ~/.margin/writing-rules.md

Scope Constraints (blast radius)
- Read ONLY: ~/.margin/corrections-export.json (and ~/.margin/writing-rules.md if it exists).
- Write ONLY: ~/.margin/writing-rules.md
- Do NOT change any sections outside "## Learned from corrections".
- No invented examples: before/after must be derived from actual snippet + correction pairs found in the JSON. If a correction lacks enough context to show a clean example, omit the example and mark the rule "example unavailable".

Process (must follow)
1) Inspect
   - Parse the JSON and print a short schema sketch of what you found (keys present, how filename/snippet/notes are represented).
   - Report counts: total corrections, unique filenames, and whether writingType exists (and distinct values).
2) Plan (checkpoint)
   - Propose a grouping strategy:
     - Primary themes: word choice, tone, structure, domain-specific, clarity, concision, formatting (add others only if needed).
     - Secondary grouping: writingType (if present). If not present, infer a small set of writing contexts ONLY when the correction text explicitly indicates it (e.g., "email", "blog", "doc").
   - Define "strong signal" as the same or semantically equivalent correction occurring ≥2 times (e.g., repeated admonition about hedging words). List the top repeated patterns you expect to turn into rules.
   - STOP after the plan and wait for approval if anything about the JSON structure prevents faithful extraction.
3) Generate rules
   - Create/update the "## Learned from corrections" section with this structure:

## Learned from corrections
### Summary
- Bullet list of 5-10 highest-signal rules (ordered by strength: repeat frequency + severity/impact).

### By writing type (if writingType exists)
#### <writingType>
- Theme headings under each type.

### By theme (always include)
#### Word choice
#### Tone
#### Structure
#### Domain-specific / terminology
(Include additional themes only if supported by corrections.)

Rule format (repeat for each rule)
- Rule: <imperative, testable>
- When to apply: <1 sentence>
- Why: <1 sentence, grounded in correction text>
- Signal: <e.g., "seen 3 times across 2 files">
- Before -> After:
  - Before: "..." (verbatim snippet segment)
  - After:  "..." (edited version matching the correction)
- Notes: <edge cases or exceptions; optional>

4) Update file safely (preservation requirement)
   - If ~/.margin/writing-rules.md exists:
     - Preserve everything outside the "## Learned from corrections" section verbatim.
     - Replace the entire "## Learned from corrections" section content (idempotent rewrite).
   - If it does not exist:
     - Create it with a short header and then the "## Learned from corrections" section.
5) Wire into agent config (idempotent)
   - Look for the agent config file in the current project or home directory. Common locations:
     - CLAUDE.md or .claude/CLAUDE.md (Claude Code)
     - AGENTS.md (Codex, others)
     - .cursorrules (Cursor)
     - .windsurfrules (Windsurf)
     - .github/copilot-instructions.md (Copilot)
   - If you find one (or more), check whether it already references ~/.margin/writing-rules.md.
   - If not, append a one-line include/reference at the end. Example for markdown-based configs:
     - "See ~/.margin/writing-rules.md for writing style rules learned from corrections."
   - If you can't determine the agent config format, print the line and ask the user where to add it.
   - Do NOT modify any existing content in the config file beyond appending this reference.

Verification (must provide)
- A checklist:
  - [ ] Total corrections processed = <N>
  - [ ] Number of rules generated = <N>
  - [ ] Number of rules with before/after examples = <N>
  - [ ] Repeated patterns (>=2) captured = <list + counts>
- Show a brief "change summary":
  - Whether file was created vs updated
  - The exact heading path(s) added under "## Learned from corrections"
  - Confirm no other sections were modified

Stop Conditions (pause and ask)
- If JSON lacks snippet text needed for before/after examples.
- If writingType is absent and you would need to guess contexts.
- If ~/.margin/writing-rules.md has multiple similarly-named sections and it's ambiguous which one to replace.`;
        await writeText(prompt);
        setExportStatus("Prompt copied to clipboard. Paste into your coding agent to generate writing rules.");
      }
      if (exportTimeoutRef.current !== null) {
        window.clearTimeout(exportTimeoutRef.current);
      }
      exportTimeoutRef.current = window.setTimeout(
        () => setExportStatus(null),
        8000,
      );
    } catch (err) {
      console.error("Failed to export corrections:", err);
      setExportStatus("Export failed");
    }
  }, []);

  const handleLoadMore = useCallback(() => {
    const newLimit = limit + PAGE_SIZE;
    setLimit(newLimit);
    void loadCorrections(newLimit);
  }, [limit, loadCorrections]);

  if (!isMounted) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "rgba(0, 0, 0, 0.3)",
          opacity: isVisible ? 1 : 0,
          transition: `opacity ${isVisible ? "200ms var(--ease-entrance)" : "150ms var(--ease-exit)"}`,
        }}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-label="Corrections"
        style={{
          position: "relative",
          backgroundColor: "var(--color-page)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          padding: "20px 24px 24px",
          width: "min(480px, calc(100vw - 32px))",
          maxHeight: "calc(100vh - 64px)",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
          fontFamily: "'Inter', system-ui, sans-serif",
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? "scale(1) translateY(0)" : "scale(0.97) translateY(4px)",
          transition: isVisible
            ? "opacity 200ms var(--ease-entrance), transform 200ms var(--ease-entrance)"
            : "opacity 150ms var(--ease-exit), transform 150ms var(--ease-exit)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
            flexShrink: 0,
          }}
        >
          <div>
            <h2
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: "var(--color-text-primary)",
                margin: 0,
              }}
            >
              Corrections
            </h2>
            {totalCount > 0 && (
              <div
                style={{
                  fontSize: 11,
                  color: "var(--color-text-secondary)",
                  marginTop: 2,
                }}
              >
                {totalCount} correction{totalCount === 1 ? "" : "s"} across{" "}
                {groups.length} document{groups.length === 1 ? "" : "s"}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
              color: "var(--color-text-secondary)",
              fontSize: 18,
              lineHeight: 1,
            }}
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            overflowY: "auto",
            flex: 1,
            minHeight: 0,
          }}
        >
          {loading && groups.length === 0 ? (
            <div
              style={{
                textAlign: "center",
                color: "var(--color-text-secondary)",
                fontSize: 13,
                padding: "24px 0",
              }}
            >
              Loading...
            </div>
          ) : totalCount === 0 ? (
            <div
              style={{
                textAlign: "center",
                color: "var(--color-text-secondary)",
                fontSize: 13,
                padding: "24px 16px",
                lineHeight: 1.6,
              }}
            >
              No corrections yet. Highlight text and add margin notes, then
              export to start collecting feedback.
            </div>
          ) : (
            <>
              {groups.map((group) => (
                <DocumentGroup
                  key={group.documentId}
                  group={group}
                  onUpdateType={handleUpdateType}
                  onDelete={handleDelete}
                />
              ))}
              {totalCount >= limit && (
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loading}
                  style={{
                    display: "block",
                    margin: "8px auto",
                    padding: "6px 16px",
                    fontSize: 12,
                    fontFamily: "'Inter', system-ui, sans-serif",
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

        {/* Footer */}
        {totalCount > 0 && (
          <div
            style={{
              borderTop: "1px solid var(--color-border)",
              paddingTop: 12,
              marginTop: 8,
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              onClick={handleExportForSynthesis}
              style={{
                width: "100%",
                padding: "8px 16px",
                fontSize: 13,
                fontWeight: 500,
                fontFamily: "'Inter', system-ui, sans-serif",
                color: "var(--color-text-primary)",
                backgroundColor: "var(--hover-bg)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-sm)",
                cursor: "pointer",
                transition: "all 150ms ease",
              }}
            >
              Export for synthesis
            </button>
            {exportStatus && (
              <div
                style={{
                  fontSize: 11,
                  color: "var(--color-text-secondary)",
                  lineHeight: 1.5,
                  marginTop: 8,
                  padding: "8px 10px",
                  backgroundColor: "var(--hover-bg)",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                {exportStatus}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
