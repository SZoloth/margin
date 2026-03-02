import { useState, useEffect } from "react";
import { checkMcpConnection } from "@/lib/mcp-bridge";

const POLL_INTERVAL_MS = 30_000;

export function useMcpStatus(): { connected: boolean } {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function poll(): Promise<void> {
      const ok = await checkMcpConnection();
      if (!cancelled) setConnected(ok);
    }

    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return { connected };
}
