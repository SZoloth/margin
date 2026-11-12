import { useState, useCallback, useEffect, useRef } from "react";
import {
  getDashboardSummary,
  startTestRun,
  exportDashboardMarkdown,
  type DashboardSummary,
} from "@/lib/tauri-commands";
import { useTestRunContext } from "./useTestRunContext";

export interface TestProgress {
  writingType: string;
  completed: number;
  total: number;
  step: string;
}

export function useDashboard() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const {
    isTestRunning: isRunning,
    setIsTestRunning: setIsRunning,
    progress,
    setProgress,
    lastCompleteEvent,
    clearLastComplete,
  } = useTestRunContext();

  const loadSummary = useCallback(async () => {
    try {
      const result = await getDashboardSummary(10);
      setSummary(result);
      // On initial load, detect stale running state from DB
      const hasRunning = result.latestRun?.status === "running";
      setIsRunning((prev: boolean) => prev || hasRunning);
    } catch (err) {
      console.error("Failed to load dashboard summary:", err);
      setError(err instanceof Error ? err.message : "Failed to load dashboard data");
    } finally {
      setIsLoading(false);
    }
  }, [setIsRunning]);

  // Load on mount
  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  // Handle complete events from context
  useEffect(() => {
    if (!lastCompleteEvent) return;
    if (lastCompleteEvent.status === "failed" && lastCompleteEvent.error) {
      setError(lastCompleteEvent.error);
    }
    loadSummary();
    clearLastComplete();
  }, [lastCompleteEvent, loadSummary, clearLastComplete]);

  // Poll during run (fallback)
  useEffect(() => {
    if (isRunning) {
      pollRef.current = setInterval(loadSummary, 5000);
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [isRunning, loadSummary]);

  const runTest = useCallback(async () => {
    try {
      setIsRunning(true);
      setError(null);
      setProgress(null);
      await startTestRun();
      await loadSummary();
    } catch (err) {
      console.error("Failed to start test run:", err);
      setIsRunning(false);
      setProgress(null);
      setError(err instanceof Error ? err.message : "Failed to start test run");
    }
  }, [loadSummary, setIsRunning, setProgress]);

  const exportMarkdown = useCallback(async (): Promise<string | null> => {
    try {
      return await exportDashboardMarkdown();
    } catch (err) {
      console.error("Failed to export dashboard markdown:", err);
      setError(err instanceof Error ? err.message : "Failed to export report");
      return null;
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    summary,
    isRunning,
    isLoading,
    error,
    progress,
    clearError,
    loadSummary,
    runTest,
    exportMarkdown,
  };
}
