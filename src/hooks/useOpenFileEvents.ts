import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { drainPendingOpenFiles } from "@/lib/tauri-commands";

interface Options {
  /** Restored tabs have loaded. Opening a file before this lets tab restore replace it. */
  isReady: boolean;
  openFilePath: (path: string) => Promise<void> | void;
  onError: (err: unknown) => void;
}

/**
 * Opens files handed to Margin by macOS ("Open With", double-click, drag to Dock).
 *
 * On a cold launch the backend queues the path until we drain it. We wait for
 * tab restore to finish, register the live listener, and only then drain:
 * draining tells the backend to emit from now on, so the listener must already
 * be in place.
 */
export function useOpenFileEvents({ isReady, openFilePath, onError }: Options) {
  const openRef = useRef(openFilePath);
  openRef.current = openFilePath;
  const errorRef = useRef(onError);
  errorRef.current = onError;
  const listeningRef = useRef<Promise<unknown> | null>(null);
  const drainedRef = useRef(false);

  // Live listener for files opened while Margin is running.
  useEffect(() => {
    const unlisten = listen<string>("open-file", (event) => {
      void openRef.current(event.payload);
    });
    listeningRef.current = unlisten;
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, []);

  // Cold-launch queue: drain once, after tab restore and after the listener is
  // registered. Never cancelled, so StrictMode's double mount can't drop a path.
  useEffect(() => {
    if (!isReady || drainedRef.current) return;
    drainedRef.current = true;
    void (listeningRef.current ?? Promise.resolve())
      .then(() => drainPendingOpenFiles())
      .then((paths) => {
        const lastPath = paths[paths.length - 1];
        if (lastPath) void openRef.current(lastPath);
      })
      .catch((err: unknown) => errorRef.current(err));
  }, [isReady]);
}
