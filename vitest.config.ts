import { defineConfig } from "vitest/config";
import { BaseSequencer } from "vitest/node";
import path from "path";

// Vitest's default BaseSequencer sorts larger files first (to minimize variance in parallel
// runs). With fileParallelism: false (serial execution), this backfires: small hook/lib files
// end up last, when system memory is most depleted, causing worker spawn timeouts.
//
// Fix: run hook and lib tests first, before heavy jsdom/TipTap component tests exhaust
// system resources. Uses explicit push-based bucketing (not .filter()) to guarantee every
// file ends up in exactly one bucket even if moduleId is undefined/unexpected.
class HookFirstSequencer extends BaseSequencer {
  async sort(files: Parameters<BaseSequencer["sort"]>[0]) {
    const sorted = await super.sort(files);
    const small: typeof sorted = [];
    const rest: typeof sorted = [];
    const unclassified: typeof sorted = [];
    for (const f of sorted) {
      // Guard against undefined/null moduleId (defensive — should not happen, but if it
      // does, an uncaught exception here would silently drop the file from the sorted list).
      const rel = (f.moduleId ?? "").replace(/\\/g, "/");
      if (!rel) {
        // Missing moduleId: run first so it doesn't get deferred to after all component tests.
        small.unshift(f);
      } else if (rel.includes("/hooks/__tests__/") || rel.includes("/lib/__tests__/")) {
        small.push(f);
      } else {
        rest.push(f);
      }
    }
    // Safety net: any file that somehow survived neither bucket (should be impossible).
    for (const f of files) {
      if (!small.includes(f) && !rest.includes(f)) {
        unclassified.push(f);
      }
    }
    return [...small, ...rest, ...unclassified];
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
