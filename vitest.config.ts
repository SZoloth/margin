import { defineConfig } from "vitest/config";
import { BaseSequencer } from "vitest/node";
import path from "path";

// Vitest's default BaseSequencer sorts larger files first (to minimize variance in parallel
// runs). With fileParallelism: false (serial execution), this backfires: tiny files end up
// last, when system memory is most depleted after 37 workers, causing worker spawn timeouts.
//
// Fix: pin hook/lib tests first (smallest, most resource-constrained), then run all remaining
// files in smallest-first order so no small file ever lands at the tail of a depleted queue.
class HookFirstSequencer extends BaseSequencer {
  async sort(files: Parameters<BaseSequencer["sort"]>[0]) {
    const sorted = await super.sort(files); // largest-first (vitest default)
    // Pin pure hook/lib tests to the front — these are the smallest files and must not land
    // last after heavy jsdom/TipTap workers have exhausted system resources.
    const pinned = sorted.filter((f) => {
      const rel = f.moduleId.replace(/\\/g, "/");
      return rel.includes("/hooks/__tests__/") || rel.includes("/lib/__tests__/");
    });
    // Reverse the remaining files: vitest's large-first order becomes small-first, so no
    // small component test can end up at the very end of the queue when memory is depleted.
    const rest = sorted
      .filter((f) => {
        const rel = f.moduleId.replace(/\\/g, "/");
        return !rel.includes("/hooks/__tests__/") && !rel.includes("/lib/__tests__/");
      })
      .reverse();
    return [...pinned, ...rest];
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
