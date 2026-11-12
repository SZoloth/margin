import React, { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";
import type { TestProgress } from "./useDashboard";

interface TestRunCompletePayload {
  runId: string;
  status: string;
  error: string | null;
}

interface TestRunProgressPayload {
  runId: string;
  data: string;
}

interface TestRunContextValue {
  isTestRunning: boolean;
  setIsTestRunning: React.Dispatch<React.SetStateAction<boolean>>;
  progress: TestProgress | null;
  setProgress: React.Dispatch<React.SetStateAction<TestProgress | null>>;
  lastCompleteEvent: TestRunCompletePayload | null;
  clearLastComplete: () => void;
}

const TestRunContext = createContext<TestRunContextValue | null>(null);

export function TestRunProvider({ children }: { children: ReactNode }) {
  const [isTestRunning, setIsTestRunning] = useState(false);
  const [progress, setProgress] = useState<TestProgress | null>(null);
  const [lastCompleteEvent, setLastCompleteEvent] = useState<TestRunCompletePayload | null>(null);
  const notifiedRef = useRef(false);

  // Listen for progress events (always mounted)
  useEffect(() => {
    const unlisten = listen<TestRunProgressPayload>("test-run-progress", (event) => {
      try {
        const data = JSON.parse(event.payload.data);
        if (data.event === "sample") {
          setIsTestRunning(true);
          setProgress({
            writingType: data.writingType,
            completed: data.completed,
            total: data.total,
            step: data.step,
          });
        } else if (data.event === "start-type") {
          setIsTestRunning(true);
          setProgress((prev) => prev ? { ...prev, writingType: data.writingType } : {
            writingType: data.writingType,
            completed: 0,
            total: 0,
            step: "starting",
          });
        }
      } catch {
        // ignore malformed
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  // Listen for complete events (always mounted)
  useEffect(() => {
    const unlisten = listen<TestRunCompletePayload>("test-run-complete", (event) => {
      setIsTestRunning(false);
      setProgress(null);
      setLastCompleteEvent(event.payload);

      // Fire OS notification
      if ("Notification" in window && Notification.permission === "granted") {
        const title = event.payload.status === "completed"
          ? "Test run complete"
          : "Test run failed";
        const body = event.payload.status === "completed"
          ? "Writing quality results are ready."
          : event.payload.error ?? "The test encountered an error.";
        new Notification(title, { body });
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  // Request notification permission once
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default" && !notifiedRef.current) {
      notifiedRef.current = true;
      Notification.requestPermission();
    }
  }, []);

  const clearLastComplete = useCallback(() => setLastCompleteEvent(null), []);

  return (
    <TestRunContext.Provider value={{
      isTestRunning,
      setIsTestRunning,
      progress,
      setProgress,
      lastCompleteEvent,
      clearLastComplete,
    }}>
      {children}
    </TestRunContext.Provider>
  );
}

export function useTestRunContext() {
  const ctx = useContext(TestRunContext);
  if (!ctx) throw new Error("useTestRunContext must be used within TestRunProvider");
  return ctx;
}
