import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ExportBridge } from "../export-bridge.js";

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

describe("ExportBridge HTTP sidecar", () => {
  let bridge: ExportBridge;

  beforeEach(async () => {
    bridge = new ExportBridge();
    await bridge.start(0); // random port
  });

  afterEach(() => {
    bridge.stop();
  });

  function url(path: string): string {
    return `http://localhost:${bridge.getPort()}${path}`;
  }

  it("POST /export text body → delivers to waiter (200)", async () => {
    const waiter = bridge.waitForExport(5000);
    const res = await fetch(url("/export"), {
      method: "POST",
      body: "annotation markdown",
    });
    expect(res.status).toBe(200);
    expect(await waiter).toBe("annotation markdown");
  });

  it("POST /export JSON { prompt } body → delivers to waiter (200)", async () => {
    const waiter = bridge.waitForExport(5000);
    const res = await fetch(url("/export"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "json prompt" }),
    });
    expect(res.status).toBe(200);
    expect(await waiter).toBe("json prompt");
  });

  it("POST /export JSON { prompt } non-string → 400 (no crash)", async () => {
    const res = await fetch(url("/export"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: 123 }),
    });
    expect(res.status).toBe(400);
  });

  it("GET /export → 405", async () => {
    const res = await fetch(url("/export"));
    expect(res.status).toBe(405);
  });

  it("unknown path → 404", async () => {
    const res = await fetch(url("/unknown"));
    expect(res.status).toBe(404);
  });

  it("OPTIONS /export → 204 with CORS headers", async () => {
    const res = await fetch(url("/export"), { method: "OPTIONS" });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("empty body → 400", async () => {
    const res = await fetch(url("/export"), {
      method: "POST",
      body: "",
    });
    expect(res.status).toBe(400);
  });

  it("GET /status → queue state JSON", async () => {
    bridge.enqueue("pending-export");
    const res = await fetch(url("/status"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.port).toBe(bridge.getPort());
    expect(data.pendingExports).toBe(1);
    expect(data.pendingWaiters).toBe(0);
  });
});
