import { useState, useCallback, useRef, useEffect } from "react";
import {
  computeDiffChanges,
  changePercentage,
  applyDiffDecisions,
  buildDiffReviewMarkup,
  type DiffChange,
} from "@/lib/diff-engine";

export type DiffReviewMode = "idle" | "pending" | "reviewing";

const AUTO_ACCEPT_THRESHOLD = 5; // percent

export interface UseDiffReviewReturn {
  mode: DiffReviewMode;
  changes: DiffChange[];
  currentIndex: number;
  updatedAt: number | null;
  pendingCount: number;
  reviewContent: string | null;

  enterPending(oldContent: string, newContent: string): boolean;
  startReview(): void;
  acceptChange(id: string): void;
  rejectChange(id: string): void;
  acceptAll(): void;
  revertAll(): void;
  dismiss(): void;
  reset(): void;
  navigateNext(): void;
  navigatePrev(): void;
  getFinalContent(): string;
}

export function useDiffReview(): UseDiffReviewReturn {
  const [mode, setMode] = useState<DiffReviewMode>("idle");
  const [changes, setChanges] = useState<DiffChange[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [reviewContent, setReviewContent] = useState<string | null>(null);

  // Keep old/new content for applyDiffDecisions
  const oldContentRef = useRef("");
  const newContentRef = useRef("");

  const pendingCount = changes.filter((c) => c.status === "pending").length;

  const enterPending = useCallback(
    (oldContent: string, newContent: string) => {
      // Strip highlight markup before diffing — highlights live in the database,
      // not the file. Without this, <mark> tags appear as raw HTML in the diff.
      const clean = (s: string) => s.replace(/<\/?mark[^>]*>/g, "");
      const cleanOld = clean(oldContent);
      const cleanNew = clean(newContent);

      if (cleanOld === cleanNew) {
        setReviewContent(null);
        return false;
      }

      const pct = changePercentage(cleanOld, cleanNew);
      if (pct < AUTO_ACCEPT_THRESHOLD) {
        // Auto-accept minor changes — stay idle
        setReviewContent(null);
        return false;
      }

      const computed = computeDiffChanges(cleanOld, cleanNew);
      if (computed.length === 0) {
        setReviewContent(null);
        return false;
      }

      oldContentRef.current = cleanOld;
      newContentRef.current = cleanNew;
      setChanges(computed);
      setReviewContent(buildDiffReviewMarkup(cleanOld, cleanNew));
      setCurrentIndex(0);
      setUpdatedAt(Date.now());
      setMode("pending");
      return true;
    },
    [],
  );

  const startReview = useCallback(() => {
    if (mode !== "pending") return;
    setCurrentIndex(0);
    setMode("reviewing");
  }, [mode]);

  // Auto-transition to idle when all changes are resolved during review
  useEffect(() => {
    if (mode === "reviewing" && changes.length > 0 && changes.every((c) => c.status !== "pending")) {
      setMode("idle");
    }
  }, [mode, changes]);

  // NOTE: reviewContent is intentionally NOT auto-cleared when mode goes idle.
  // App.tsx calls reset() in the resolution effect, which clears reviewContent
  // atomically with applying final content — preventing a flash of stale content.

  const updateChangeStatus = useCallback(
    (id: string, newStatus: "accepted" | "rejected") => {
      setChanges((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: newStatus } : c)),
      );
    },
    [],
  );

  const acceptChange = useCallback(
    (id: string) => updateChangeStatus(id, "accepted"),
    [updateChangeStatus],
  );

  const rejectChange = useCallback(
    (id: string) => updateChangeStatus(id, "rejected"),
    [updateChangeStatus],
  );

  const acceptAll = useCallback(() => {
    setChanges((prev) => prev.map((c) => ({ ...c, status: "accepted" as const })));
    setMode("idle");
  }, []);

  const revertAll = useCallback(() => {
    // Reject all — restore pre-edit content
    setChanges((prev) => prev.map((c) => ({ ...c, status: "rejected" as const })));
    setMode("idle");
  }, []);

  const dismiss = useCallback(() => {
    // Accept all implicitly — the new content is applied (used in pending mode)
    setChanges((prev) => prev.map((c) => ({ ...c, status: "accepted" as const })));
    setMode("idle");
  }, []);

  const reset = useCallback(() => {
    oldContentRef.current = "";
    newContentRef.current = "";
    setChanges([]);
    setCurrentIndex(0);
    setUpdatedAt(null);
    setReviewContent(null);
    setMode("idle");
  }, []);

  const navigateNext = useCallback(() => {
    setCurrentIndex((prev) =>
      changes.length === 0 ? 0 : (prev + 1) % changes.length,
    );
  }, [changes.length]);

  const navigatePrev = useCallback(() => {
    setCurrentIndex((prev) =>
      changes.length === 0
        ? 0
        : (prev - 1 + changes.length) % changes.length,
    );
  }, [changes.length]);

  const getFinalContent = useCallback(() => {
    if (changes.length === 0) return newContentRef.current;
    return applyDiffDecisions(
      changes,
      oldContentRef.current,
      newContentRef.current,
    );
  }, [changes]);

  return {
    mode,
    changes,
    currentIndex,
    updatedAt,
    pendingCount,
    reviewContent,
    enterPending,
    startReview,
    acceptChange,
    rejectChange,
    acceptAll,
    revertAll,
    dismiss,
    reset,
    navigateNext,
    navigatePrev,
    getFinalContent,
  };
}
