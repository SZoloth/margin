import { defineConfig } from "vitest/config";
import { BaseSequencer } from "vitest/node";
import path from "path";

// Vitest's default BaseSequencer sorts larger files first (to minimize variance in parallel
// runs). With fileParallelism: false (serial execution), this backfires: small hook/lib/simple
// component tests end up last, when system memory is most depleted after ~30 files of jsdom +
// TipTap initialization. Each worker thread takes ~52s to start (vitest's hardcoded START_TIMEOUT
// is 60s), so late-running workers fail intermittently.
//
// Fix: run hook, lib, and lightweight component tests first, before heavy TipTap editor tests
// exhaust system resources. Reader.test, apply-accepted-correction.test, browser-stubs.test,
// and FloatingToolbar.test run first (unshift) — all either render heavy TipTap extensions or
// load large CJS bundles that trigger worker START_TIMEOUT when run late.
// Lightweight tests (hooks, lib, settings/*, style-memory/*, layout/Sidebar, DiffNavChip,
// search) run in the "small" bucket. Heavy editor tests (HighlightThread,
// ExportAnnotationsPopover, TabBar, etc.) run in "rest".
// Uses explicit push-based bucketing — every file ends up in exactly one bucket so nothing is dropped.
class HookFirstSequencer extends BaseSequencer {
  async sort(files: Parameters<BaseSequencer["sort"]>[0]) {
    const sorted = await super.sort(files);
    const small: typeof sorted = [];
    const rest: typeof sorted = [];
    for (const f of sorted) {
      const rel = (f.moduleId ?? "").replace(/\\/g, "/");
      if (!rel) {
        small.unshift(f);
      } else if (
        // Reader.test renders the heaviest TipTap editor (all extensions). Run it
        // first so it gets a fresh worker before system resources are depleted.
        // apply-accepted-correction.test also renders Reader and must run early
        // for the same reason — even though it lives in lib/__tests__/, it's heavy.
        // browser-stubs.test times out on worker startup when run after Reader.test
        // depletes system resources — must also run before the heavy tests.
        // FloatingToolbar.test loads a 41k-line CJS icon bundle that causes worker
        // START_TIMEOUT even with mocks — run it early too.
        // useFileWatcher.test uses fake timers; worker startup times out when run
        // after memory is depleted by heavy tests — run it early for a fresh worker.
        rel.includes("Reader.test") ||
        rel.includes("apply-accepted-correction.test") ||
        rel.includes("browser-stubs.test") ||
        rel.includes("FloatingToolbar.test") ||
        rel.includes("useFileWatcher.test") ||
        rel.includes("ToggleSwitch.test")
      ) {
        small.unshift(f);
      } else if (
        rel.includes("/hooks/__tests__/") ||
        rel.includes("/lib/__tests__/") ||
        rel.includes("/settings/__tests__/") ||
        rel.includes("DiffNavChip.test") ||
        rel.includes("DiffBanner.test") ||
        rel.includes("Sidebar.test") ||
        rel.includes("StyleMemorySection.test") ||
        rel.includes("/style-memory/__tests__/") ||
        rel.includes("search.test")
      ) {
        small.push(f);
      } else {
        rest.push(f);
      }
    }
    // Safety net: catch any file not in either bucket (should be impossible).
    const bucketed = new Set([...small, ...rest]);
    const unclassified = files.filter((f) => !bucketed.has(f));
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
    environment: "jsdom",
    environmentOptions: {
      jsdom: {
        url: "http://localhost",
      },
    },
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/__tests__/**/*.test.{ts,tsx}"],
    testTimeout: 30000,
    hookTimeout: 30000,
    // isolate: false + pool: "threads" + fileParallelism: false runs all files in ONE worker
    // thread instead of spawning a new worker per file. Each new thread startup requires jsdom +
    // TipTap to initialize (~60-80s), so 42 files × ~80s = ~57 min. With isolate: false, the
    // worker is reused across all files — startup happens once and transform/import caches are
    // shared. vi.mock() calls still work per-file (vitest restores them after each file).
    //
    // HookFirstSequencer is retained for safety: running Reader/apply-accepted-correction first
    // ensures TipTap extensions are loaded once during the "warm" period and stay cached.
    isolate: false,
    pool: "threads",
    fileParallelism: false,
    maxWorkers: 1,
    sequence: {
      sequencer: HookFirstSequencer,
    },
  },
});
