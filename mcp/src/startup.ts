type ErrnoError = Error & { code?: string };

export type ExportBridgeLike = {
  start: (port?: number) => Promise<void>;
  getPort: () => number | null;
};

export async function startExportBridge(opts: {
  bridge: ExportBridgeLike;
  enabled: boolean;
  preferredPort: number;
  log?: (...args: unknown[]) => void;
}): Promise<{ started: boolean; port: number | null }> {
  const log = opts.log ?? (() => {});
  if (!opts.enabled) return { started: false, port: null };

  const preferredPort = Number.isFinite(opts.preferredPort) ? opts.preferredPort : 24784;

  try {
    await opts.bridge.start(preferredPort);
    return { started: true, port: opts.bridge.getPort() };
  } catch (err) {
    const code = (err as ErrnoError).code;
    if (code === "EADDRINUSE") {
      try {
        await opts.bridge.start(0);
        return { started: true, port: opts.bridge.getPort() };
      } catch (retryErr) {
        log("Export bridge failed to start (port in use, retry failed).", retryErr);
        return { started: false, port: null };
      }
    }

    log("Export bridge failed to start; continuing without it.", err);
    return { started: false, port: null };
  }
}

