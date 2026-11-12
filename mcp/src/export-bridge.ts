import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

interface Waiter {
  resolve: (prompt: string) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const PORT_FILE = join(homedir(), ".margin", "mcp-port");

export class ExportBridge {
  private exportQueue: string[] = [];
  private waiterQueue: Waiter[] = [];
  private server: Server | null = null;
  private port: number | null = null;
  private _latestExport: string | null = null;
  private _onExport: ((prompt: string) => void) | null = null;

  /** Register a callback fired every time an export arrives. */
  onExport(cb: (prompt: string) => void): void {
    this._onExport = cb;
  }

  /** The most recent export payload, if any. */
  get latestExport(): string | null {
    return this._latestExport;
  }

  enqueue(prompt: string): void {
    this._latestExport = prompt;

    // Direct handoff to a waiting consumer if available
    const waiter = this.waiterQueue.shift();
    if (waiter) {
      clearTimeout(waiter.timer);
      waiter.resolve(prompt);
    } else {
      this.exportQueue.push(prompt);
    }

    // Notify listener (MCP server push notifications)
    this._onExport?.(prompt);
  }

  waitForExport(timeoutMs = 300_000): Promise<string> {
    // Drain from queue if available
    const queued = this.exportQueue.shift();
    if (queued !== undefined) {
      return Promise.resolve(queued);
    }

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiterQueue.findIndex((w) => w.resolve === resolve);
        if (idx !== -1) this.waiterQueue.splice(idx, 1);
        reject(new Error("Timed out waiting for export"));
      }, timeoutMs);

      this.waiterQueue.push({ resolve, reject, timer });
    });
  }

  async start(port = 24784): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.server = createServer((req, res) => this.handleRequest(req, res));
      const onError = (err: Error) => reject(err);
      this.server.on("error", onError);
      // Bind to localhost only; this endpoint accepts arbitrary prompt bodies.
      this.server.listen(port, "127.0.0.1", () => {
        this.server!.removeListener("error", onError);
        const addr = this.server!.address();
        this.port = typeof addr === "object" && addr ? addr.port : port;
        this.writePortFile();
        resolve();
      });
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    this.removePortFile();
    // Reject any pending waiters
    for (const waiter of this.waiterQueue) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error("Bridge shutting down"));
    }
    this.waiterQueue = [];
    this.exportQueue = [];
    this.port = null;
  }

  getPort(): number | null {
    return this.port;
  }

  get pendingExports(): number {
    return this.exportQueue.length;
  }

  get pendingWaiters(): number {
    return this.waiterQueue.length;
  }

  private writePortFile(): void {
    try {
      writeFileSync(PORT_FILE, String(this.port), "utf-8");
    } catch {
      // Non-fatal — ~/.margin may not exist yet
    }
  }

  private removePortFile(): void {
    try {
      unlinkSync(PORT_FILE);
    } catch {
      // File may not exist
    }
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    // CORS headers on all responses
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = req.url ?? "/";

    if (url === "/status" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        port: this.port,
        pendingExports: this.exportQueue.length,
        pendingWaiters: this.waiterQueue.length,
      }));
      return;
    }

    if (url === "/export") {
      if (req.method !== "POST") {
        res.writeHead(405, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Method not allowed" }));
        return;
      }

      const MAX_BODY = 1024 * 1024; // 1 MB
      let body = "";
      let aborted = false;
      req.on("data", (chunk: Buffer) => {
        if (aborted) return;
        body += chunk.toString();
        if (body.length > MAX_BODY) {
          aborted = true;
          res.writeHead(413, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Payload too large" }));
          req.destroy();
        }
      });
      req.on("end", () => {
        if (aborted) return;
        let prompt: string;

        // Support both plain text and JSON { prompt } bodies
        const contentType = req.headers["content-type"] ?? "";
        if (contentType.includes("application/json")) {
          try {
            const parsed = JSON.parse(body);
            prompt = typeof parsed.prompt === "string" ? parsed.prompt : "";
          } catch {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid JSON" }));
            return;
          }
        } else {
          prompt = body;
        }

        if (!prompt || prompt.trim().length === 0) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Empty body" }));
          return;
        }

        this.enqueue(prompt);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }

    // Unknown path
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }
}
