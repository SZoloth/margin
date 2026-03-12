import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    __MCP_DEV_PATH__: JSON.stringify(path.resolve(__dirname, "mcp/dist/index.js")),
  },
  test: {
    // All test files use jsdom (components, hooks, and pure-logic libs all run fine in jsdom).
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/__tests__/**/*.test.{ts,tsx}"],
    testTimeout: 30000,
    hookTimeout: 30000,
    // pool: "threads" uses worker_threads instead of child_process.fork — avoids the per-file
    // OS process spawn overhead that causes START_TIMEOUT failures with "forks" pool.
    // Worker threads start in ~100ms vs ~2s for forks, eliminating timeout risk.
    // isolate: true (default) is preserved so vi.mock() works correctly per-file.
    // fileParallelism: false keeps files serial (maxWorkers=1) to avoid resource exhaustion.
    // poolOptions was removed in Vitest 4 — singleFork/singleThread no longer exist.
    pool: "threads",
    fileParallelism: false,
  },
});
