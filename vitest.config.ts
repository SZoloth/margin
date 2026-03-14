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
    // Setting this globally instead of per-file prevents 30 separate fork workers from spawning.
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/__tests__/**/*.test.{ts,tsx}"],
    testTimeout: 30000,
    hookTimeout: 30000,
    // fileParallelism: false runs files serially. maxWorkers: 1 limits the thread pool to a
    // single worker — vitest 4 defaults to numCPUs-1 workers (up to 12) which pre-spawns idle
    // threads that exhaust memory and cause "Timeout waiting for worker to respond" after ~30
    // sequential test files. isolate: true (default) is preserved: module registry is cleared
    // between files so vi.mock() works correctly per-file.
    // Note: poolOptions.threads.singleThread was removed in vitest 4; maxWorkers is top-level.
    fileParallelism: false,
    pool: "threads",
    maxWorkers: 1,
  },
});
