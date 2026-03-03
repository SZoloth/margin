import { useEffect, useState, useCallback } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

interface UpdateState {
  available: boolean;
  version: string | null;
  installing: boolean;
  checking: boolean;
  error: string | null;
}

export function useUpdater() {
  const [state, setState] = useState<UpdateState>({
    available: false,
    version: null,
    installing: false,
    checking: false,
    error: null,
  });
  const [update, setUpdate] = useState<Update | null>(null);

  useEffect(() => {
    // Check after a short delay so the app loads first
    const timeout = window.setTimeout(async () => {
      try {
        const result = await check();
        if (result) {
          setUpdate(result);
          setState((prev) => ({
            ...prev,
            available: true,
            version: result.version,
          }));
        }
      } catch (err) {
        // Silent fail — update checks are best-effort
        console.error("Update check failed:", err);
      }
    }, 3000);

    return () => window.clearTimeout(timeout);
  }, []);

  const install = useCallback(async () => {
    if (!update) return;
    setState((prev) => ({ ...prev, installing: true, error: null }));
    try {
      await update.downloadAndInstall();
      await relaunch();
    } catch (err) {
      setState((prev) => ({
        ...prev,
        installing: false,
        error: err instanceof Error ? err.message : "Install failed",
      }));
    }
  }, [update]);

  const dismiss = useCallback(() => {
    setState((prev) => ({ ...prev, available: false }));
  }, []);

  const recheck = useCallback(async () => {
    setState((prev) => ({ ...prev, checking: true, error: null }));
    try {
      const result = await check();
      if (result) {
        setUpdate(result);
        setState((prev) => ({
          ...prev,
          checking: false,
          available: true,
          version: result.version,
        }));
      } else {
        setState((prev) => ({ ...prev, checking: false }));
      }
    } catch (err) {
      setState((prev) => ({
        ...prev,
        checking: false,
        error: err instanceof Error ? err.message : "Update check failed",
      }));
    }
  }, []);

  return { ...state, install, dismiss, recheck };
}
