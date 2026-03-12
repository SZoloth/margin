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
    // pool: "vmForks" uses Node VM contexts instead of child_process.fork per file — no per-file
    // OS process spawning. Eliminates the 60s START_TIMEOUT failures ("Timeout waiting for worker
    // to respond") that hit the last ~3 files after a long sequential run.
    // poolOptions was removed in Vitest 4 (singleFork/singleThread are no longer valid).
    // fileParallelism: false keeps files serial (maxWorkers=1).
    pool: "vmForks",
    fileParallelism: false,
  },
});
