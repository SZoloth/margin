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
// exhaust system resources. Reader.test and DiffBanner.test run first of all (unshift) because
// they time out if system resources are depleted after 30+ other files. Reader.test has the
// heaviest TipTap editor setup; DiffBanner.test is lightweight but its worker startup times out
// when it lands late in the 40-file run.
// Lightweight tests (hooks, lib, settings/*, style-memory/*, layout/Sidebar, layout/TabBar,
// DiffNavChip, FloatingToolbar, search) run in the "small" bucket. Heavy editor tests
// (HighlightThread, ExportAnnotationsPopover, etc.) run in "rest".
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
        // DiffBanner.test is lightweight but its worker times out when it lands
        // late in a 40-file serial run — unshift it here too.
        rel.includes("Reader.test") ||
        rel.includes("DiffBanner.test") ||
        // front-matter.test imports Reader (heavy TipTap setup) — same timeout risk
        // as Reader.test when it lands late in a 40+ file serial run.
        rel.includes("front-matter.test")
      ) {
        small.unshift(f);
      } else if (
        rel.includes("/hooks/__tests__/") ||
        rel.includes("/lib/__tests__/") ||
        rel.includes("/settings/__tests__/") ||
        rel.includes("DiffNavChip.test") ||
        rel.includes("FloatingToolbar.test") ||
        rel.includes("Sidebar.test") ||
        rel.includes("StyleMemorySection.test") ||
        rel.includes("RulesTab.test") ||
        rel.includes("CorrectionsTab.test") ||
        rel.includes("TabBar.test") ||
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
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/__tests__/**/*.test.{ts,tsx}"],
    testTimeout: 30000,
    hookTimeout: 30000,
    // pool: "threads" + fileParallelism: false + maxWorkers: 1 runs files serially to avoid
    // memory exhaustion from concurrent TipTap/jsdom worker threads.
    // HookFirstSequencer ensures lightweight tests run first while the system is fresh —
    // prevents resource exhaustion from pushing fast tests past the 60s START_TIMEOUT.
    pool: "threads",
    fileParallelism: false,
    maxWorkers: 1,
    sequence: {
      sequencer: HookFirstSequencer,
    },
  },
});
