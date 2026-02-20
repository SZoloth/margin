import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export function useFileWatcher(
  filePath: string | null,
  onFileChanged: (path: string) => void
) {
  useEffect(() => {
    if (!filePath) return;

    invoke("watch_file", { path: filePath }).catch(console.error);

    const unlisten = listen<{ path: string }>("file-changed", (event) => {
      onFileChanged(event.payload.path);
    });

    return () => {
      invoke("unwatch_file").catch(console.error);
      unlisten.then((fn) => fn());
    };
  }, [filePath, onFileChanged]);
}
