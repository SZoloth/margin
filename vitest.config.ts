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
    // fileParallelism: false is the vitest 4 way to run files serially (replaces singleFork).
    // Avoids "Timeout waiting for worker to respond" from concurrent TipTap + jsdom workers.
    fileParallelism: false,
  },
});
