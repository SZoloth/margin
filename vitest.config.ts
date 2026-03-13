import { defineConfig } from "vitest/config";
import { BaseSequencer } from "vitest/node";
import path from "path";

// Vitest's default BaseSequencer sorts larger files first (to minimize variance in parallel
// runs). With fileParallelism: false (serial execution), this backfires: tiny files end up
// last, when system memory is most depleted after 37 workers, causing worker spawn timeouts.
//
// Fix: run the smallest hook tests first, before the heavy jsdom/TipTap component tests
// have exhausted system resources. The rest still runs in vitest's default large-first order.
class HookFirstSequencer extends BaseSequencer {
  async sort(files: Parameters<BaseSequencer["sort"]>[0]) {
    const sorted = await super.sort(files);
    // Pin pure hook tests (≤6 KB) to the front — these are the files that otherwise land
    // last due to their small size and fail with "Timeout waiting for worker to respond".
    const small = sorted.filter((f) => {
      const rel = f.moduleId.replace(/\\/g, "/");
      return rel.includes("/hooks/__tests__/") || rel.includes("/lib/__tests__/");
    });
    const rest = sorted.filter((f) => {
      const rel = f.moduleId.replace(/\\/g, "/");
      return !rel.includes("/hooks/__tests__/") && !rel.includes("/lib/__tests__/");
    });
    return [...small, ...rest];
  }
}

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
    sequence: {
      sequencer: HookFirstSequencer,
    },
  },
});
