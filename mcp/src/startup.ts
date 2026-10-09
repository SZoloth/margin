import { existsSync } from "fs";
import { dirname, join } from "path";

/**
 * The `margin` CLI to run for exports. Inside Margin.app the server binary
 * (margin-mcp) sits next to the bundled margin-cli; elsewhere, use PATH.
 */
export function marginCliCommand(execPath: string = process.execPath): string {
  const bundled = join(dirname(execPath), "margin-cli");
  return existsSync(bundled) ? bundled : "margin";
}

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

