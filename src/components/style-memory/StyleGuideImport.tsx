import { useCallback, useState } from "react";
import { seedRulesFromGuide, openStyleGuideDialog } from "@/lib/tauri-commands";
import { WRITING_TYPES } from "@/lib/writing-types";
import { cn } from "@/lib/cn";
import { BUTTON_PRIMARY_CLASS, BUTTON_SECONDARY_CLASS, FIELD_CLASS, plural } from "./controls";

/**
 * Start from a style guide you already have. Rules extracted here take effect
 * straight away (they are exported like any accepted rule), so the result
 * line says so rather than sending the user to a review queue.
 */
export function StyleGuideImport({
  onImported,
  onClose,
}: {
  onImported: () => void;
  onClose?: () => void;
}) {
  const [pasting, setPasting] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [writingType, setWritingType] = useState("general");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSeed = useCallback(async (text: string, name?: string) => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await seedRulesFromGuide(text, writingType, name);
      const dupes = r.deduplicated > 0 ? ` ${plural(r.deduplicated, "was", "were")} already here.` : "";
      setResult(`Added ${plural(r.created, "rule", "rules")}.${dupes}`);
      setPasting(false);
      setPasteText("");
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [writingType, onImported]);

  const handleUpload = useCallback(async () => {
    try {
      const content = await openStyleGuideDialog();
      if (content) await handleSeed(content, "Uploaded file");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [handleSeed]);

  return (
    <div className="rule-room rounded-[var(--radius-md)] bg-[var(--color-sidebar)] p-4" data-room>
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="text-[length:var(--text-sm)] font-medium text-[var(--color-text-primary)]">
            Start from a style guide
          </p>
          <p className="mt-0.5 text-[length:var(--text-xs)] text-[var(--color-text-secondary)]">
            Margin reads the guide and turns it into rules. They take effect right away, and you can edit or archive any of them.
          </p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close" className={cn(BUTTON_SECONDARY_CLASS, "border-transparent bg-transparent")}>
            ✕
          </button>
        )}
      </div>

      {loading ? (
        <div className="mt-3 flex items-center gap-2 text-[length:var(--text-sm)] text-[var(--color-text-secondary)]" role="status">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--color-text-tertiary)] border-t-[var(--color-accent)]" />
          Reading your guide…
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="text-[length:var(--text-xs)] text-[var(--color-text-secondary)]" htmlFor="guide-writing-type">
            Applies to
          </label>
          <select
            id="guide-writing-type"
            value={writingType}
            onChange={(e) => setWritingType(e.target.value)}
            className={cn(FIELD_CLASS, "w-auto cursor-pointer py-[3px] text-[length:var(--text-xs)]")}
          >
            {WRITING_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.value === "general" ? "All writing" : t.label}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void handleUpload()} className={BUTTON_SECONDARY_CLASS}>
            Choose file…
          </button>
          <button type="button" onClick={() => setPasting((p) => !p)} aria-expanded={pasting} className={BUTTON_SECONDARY_CLASS}>
            Paste text
          </button>
        </div>
      )}

      {pasting && !loading && (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            aria-label="Style guide text"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste your style guide here"
            rows={6}
            className={cn(FIELD_CLASS, "resize-y p-3")}
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void handleSeed(pasteText, "Pasted content")}
              disabled={!pasteText.trim()}
              className={BUTTON_PRIMARY_CLASS}
            >
              Make rules
            </button>
          </div>
        </div>
      )}

      {result && (
        <p role="status" className="mt-3 text-[length:var(--text-xs)] text-[var(--color-success)]">
          {result}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-[length:var(--text-xs)] text-[var(--color-danger-text)]">
          {error}
        </p>
      )}
    </div>
  );
}
