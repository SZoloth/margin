import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ExportBridge } from "../export-bridge.js";
import { EventEmitter } from "node:events";

describe("ExportBridge queue rendezvous", () => {
  let bridge: ExportBridge;

  beforeEach(() => {
    bridge = new ExportBridge();
  });

  it("waiter arrives first → export resolves it", async () => {
    const promise = bridge.waitForExport(5000);
    bridge.enqueue("hello");
    expect(await promise).toBe("hello");
  });

  it("export queued first → waiter drains immediately", async () => {
    bridge.enqueue("queued");
    const result = await bridge.waitForExport(5000);
    expect(result).toBe("queued");
  });

  it("FIFO with multiple exports", async () => {
    bridge.enqueue("first");
    bridge.enqueue("second");
    expect(await bridge.waitForExport(5000)).toBe("first");
    expect(await bridge.waitForExport(5000)).toBe("second");
  });

  it("multiple waiters resolved in order", async () => {
    const p1 = bridge.waitForExport(5000);
    const p2 = bridge.waitForExport(5000);
    bridge.enqueue("a");
    bridge.enqueue("b");
    expect(await p1).toBe("a");
    expect(await p2).toBe("b");
  });

  it("timeout rejects waiter", async () => {
    await expect(bridge.waitForExport(50)).rejects.toThrow("Timed out");
  });

  it("timeout doesn't poison subsequent ops", async () => {
    await expect(bridge.waitForExport(50)).rejects.toThrow("Timed out");
    bridge.enqueue("after-timeout");
    expect(await bridge.waitForExport(5000)).toBe("after-timeout");
  });
});

class MockReq extends EventEmitter {
  method: string;
  url: string;
  headers: Record<string, string>;
  destroyed = false;

  constructor(opts: { method: string; url: string; headers?: Record<string, string> }) {
    super();
    this.method = opts.method;
    this.url = opts.url;
    this.headers = Object.fromEntries(
      Object.entries(opts.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
    );
  }

  destroy() {
    this.destroyed = true;
  }
}

class MockRes {
  headers = new Map<string, string>();
  statusCode: number | null = null;
  body: string | null = null;

  setHeader(name: string, value: string) {
    this.headers.set(name.toLowerCase(), value);
  }

  writeHead(statusCode: number, headers?: Record<string, string>) {
    this.statusCode = statusCode;
    if (headers) {
      for (const [k, v] of Object.entries(headers)) {
        this.setHeader(k, v);
      }
    }
  }

  end(body?: string) {
    if (body !== undefined) this.body = body;
  }
}

function invokeRequest(
  bridge: ExportBridge,
  opts: { method: string; url: string; headers?: Record<string, string>; body?: string },
) {
  const req = new MockReq({ method: opts.method, url: opts.url, headers: opts.headers });
  const res = new MockRes();

  // handleRequest is intentionally not part of the public API,
  // but we unit-test it directly to avoid opening sockets in CI/sandbox.
  (bridge as unknown as { handleRequest: (r: unknown, s: unknown) => void }).handleRequest(req, res);

  if (opts.body !== undefined) {
    req.emit("data", Buffer.from(opts.body, "utf8"));
  }
  req.emit("end");

  return { req, res };
}

describe("ExportBridge HTTP handler", () => {
  let bridge: ExportBridge;

  beforeEach(() => {
    bridge = new ExportBridge();
  });

  afterEach(() => {
    bridge.stop();
  });

  it("POST /export text body → delivers to waiter (200)", async () => {
    const waiter = bridge.waitForExport(5000);
    const { res } = invokeRequest(bridge, {
      method: "POST",
      url: "/export",
      body: "annotation markdown",
    });
    expect(res.statusCode).toBe(200);
    expect(await waiter).toBe("annotation markdown");
  });

  it("POST /export JSON { prompt } body → delivers to waiter (200)", async () => {
    const waiter = bridge.waitForExport(5000);
    const { res } = invokeRequest(bridge, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      url: "/export",
      body: JSON.stringify({ prompt: "json prompt" }),
    });
    expect(res.statusCode).toBe(200);
    expect(await waiter).toBe("json prompt");
  });

  it("POST /export JSON { prompt } non-string → 400 (no crash)", async () => {
    const { res } = invokeRequest(bridge, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      url: "/export",
      body: JSON.stringify({ prompt: 123 }),
    });
    expect(res.statusCode).toBe(400);
  });

  it("GET /export → 405", async () => {
    const { res } = invokeRequest(bridge, { method: "GET", url: "/export" });
    expect(res.statusCode).toBe(405);
  });

  it("unknown path → 404", async () => {
    const { res } = invokeRequest(bridge, { method: "GET", url: "/unknown" });
    expect(res.statusCode).toBe(404);
  });

  it("OPTIONS /export → 204 with CORS headers", async () => {
    const { res } = invokeRequest(bridge, { method: "OPTIONS", url: "/export" });
    expect(res.statusCode).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("empty body → 400", async () => {
    const { res } = invokeRequest(bridge, {
      method: "POST",
      url: "/export",
      body: "",
    });
    expect(res.statusCode).toBe(400);
  });

  it("GET /status → queue state JSON", async () => {
    bridge.enqueue("pending-export");
    const { res } = invokeRequest(bridge, { method: "GET", url: "/status" });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body ?? "{}");
    expect(data.pendingExports).toBe(1);
    expect(data.pendingWaiters).toBe(0);
  });
});
