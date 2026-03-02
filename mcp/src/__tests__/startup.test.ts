import { describe, it, expect } from "vitest";
import { startExportBridge } from "../startup.js";

class FakeBridge {
  startedPorts: number[] = [];
  port: number | null = null;

  async start(port: number): Promise<void> {
    this.startedPorts.push(port);
    if (port === 24784) {
      const err = new Error("in use") as NodeJS.ErrnoException;
      err.code = "EADDRINUSE";
      throw err;
    }
    this.port = port === 0 ? 51234 : port;
  }

  getPort(): number | null {
    return this.port;
  }
}

describe("startExportBridge", () => {
  it("retries with an ephemeral port when default port is in use", async () => {
    const bridge = new FakeBridge();
    const result = await startExportBridge({
      bridge,
      enabled: true,
      preferredPort: 24784,
      log: () => {},
    });

    expect(bridge.startedPorts).toEqual([24784, 0]);
    expect(result.started).toBe(true);
    expect(result.port).toBe(51234);
  });
});

