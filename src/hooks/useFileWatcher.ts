import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export function useFileWatcher(
  filePath: string | null,
  onFileChanged: (path: string) => void
) {
  const onFileChangedRef = useRef(onFileChanged);
  onFileChangedRef.current = onFileChanged;

  useEffect(() => {
    if (!filePath) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    // Listen FIRST so no events are lost during watcher setup
    const unlistenPromise = listen<{ path: string }>("file-changed", (event) => {
      if (cancelled) return;

      // Debounce: coalesce rapid multi-event bursts from a single save
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        onFileChangedRef.current(event.payload.path);
      }, 150);
    });

    // THEN start watching
    invoke("watch_file", { path: filePath }).catch(console.error);

    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      invoke("unwatch_file").catch(console.error);
      void unlistenPromise.then((fn) => fn()).catch(console.error);
    };
  }, [filePath]);
}
