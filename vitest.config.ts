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
// FloatingToolbar.test, ExportAnnotationsPopover.test, and export-annotations-footer.test run
// first (unshift) — all either render heavy TipTap extensions or timeout on worker startup
// when run after memory is depleted by prior tests.
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
        rel.includes("ToggleSwitch.test") ||
        // StyleMemorySection.test hangs under resource pressure when run after Reader.test
        // exhausts system memory — run it before the heavy tests on a fresh worker.
        rel.includes("StyleMemorySection.test") ||
        // ExportAnnotationsPopover.test and export-annotations-footer.test time out on
        // worker startup when run late (after heavy TipTap tests deplete memory).
        rel.includes("ExportAnnotationsPopover.test") ||
        rel.includes("export-annotations-footer.test")
      ) {
        small.unshift(f);
      } else if (
        rel.includes("/hooks/__tests__/") ||
        rel.includes("/lib/__tests__/") ||
        rel.includes("/settings/__tests__/") ||
        rel.includes("DiffNavChip.test") ||
        rel.includes("DiffBanner.test") ||
        rel.includes("Sidebar.test") ||
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
    // pool: "vmThreads" + fileParallelism: false solves both the worker startup timeout and
    // module isolation problems. With pool: "threads", vitest spawns a fresh OS-level worker
    // thread per test file — 42 files × ~80s startup = ~57 min, and late files hit the hardcoded
    // 60s START_TIMEOUT. With pool: "vmThreads", ONE worker thread starts (avoiding 42 startups),
    // and each file runs in a lightweight Node.js VM context within that thread. VM contexts
    // provide full module isolation (vi.mock() scoping works correctly) without requiring a new
    // OS thread per file. fileParallelism: false keeps files serial; maxWorkers: 1 is explicit
    // that only one worker thread runs.
    //
    // HookFirstSequencer is retained: running Reader/apply-accepted-correction first ensures
    // TipTap extensions are warm-loaded early in the session.
    pool: "vmThreads",
    fileParallelism: false,
    maxWorkers: 1,
    sequence: {
      sequencer: HookFirstSequencer,
    },
  },
});
