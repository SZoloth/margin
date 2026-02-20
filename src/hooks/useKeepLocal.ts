import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { KeepLocalItem, KeepLocalListResult } from "@/types/keep-local";

const HEALTH_INTERVAL_MS = 30_000;

export function useKeepLocal() {
  const [items, setItems] = useState<KeepLocalItem[]>([]);
  const [isOnline, setIsOnline] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [query, setQuery] = useState("");
  const healthIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wasOnlineRef = useRef(false);

  const checkHealth = useCallback(async () => {
    try {
      const result = await invoke<{ ok: boolean; now: number }>("keep_local_health");
      setIsOnline(result.ok);
      return result.ok;
    } catch {
      setIsOnline(false);
      return false;
    }
  }, []);

  const loadItems = useCallback(async (q?: string) => {
    setIsLoading(true);
    try {
      const result = await invoke<KeepLocalListResult>("keep_local_list_items", {
        limit: 50,
        offset: 0,
        query: q || null,
        status: null,
      });
      setItems(result.items);
    } catch {
      setIsOnline(false);
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getContent = useCallback(async (itemId: string): Promise<string> => {
    return invoke<string>("keep_local_get_content", { itemId });
  }, []);

  const search = useCallback(
    (q: string) => {
      setQuery(q);
      loadItems(q);
    },
    [loadItems]
  );

  // Health check on mount + interval
  useEffect(() => {
    checkHealth();
    healthIntervalRef.current = setInterval(checkHealth, HEALTH_INTERVAL_MS);

    return () => {
      if (healthIntervalRef.current) {
        clearInterval(healthIntervalRef.current);
      }
    };
  }, [checkHealth]);

  // Auto-load items when transitioning to online
  useEffect(() => {
    if (isOnline && !wasOnlineRef.current) {
      loadItems(query || undefined);
    }
    wasOnlineRef.current = isOnline;
  }, [isOnline, loadItems, query]);

  return { items, isOnline, isLoading, query, search, getContent, checkHealth };
}
