import { defineConfig } from "vitest/config";
import { BaseSequencer } from "vitest/node";
import path from "path";

// Vitest's default BaseSequencer sorts larger files first (to minimize variance in parallel
// runs). With fileParallelism: false (serial execution), this backfires: small hook/lib/simple
// component tests end up last, when system memory is most depleted after ~30 files of jsdom +
// TipTap initialization. Each worker thread takes ~52s to start (vitest's hardcoded START_TIMEOUT
// is 60s), so late-running workers fail intermittently.
//
// Fix: with vmThreads + maxWorkers:1, all files share one module registry. Two issues:
// 1. RulesTab.test, CorrectionsTab.test, and StyleMemorySection.test each mock @/lib/tauri-commands
//    with different factory shapes. Other files (useTabs, useDocument, SettingsPage) also mock the
//    same module. With a shared registry, whichever partial factory runs first wins, breaking the
//    others. Fix: "mustRunFirst" bucket for those three files so they all run before any other
//    @/lib/tauri-commands mock can contaminate the registry.
// 2. Several files timeout on worker startup when run after Reader.test depletes memory.
//    Fix: "early" bucket for those files — all run before the heavy editor tests.
// Lightweight tests (hooks, lib, settings/*, style-memory/*, layout/Sidebar, DiffNavChip,
// search) run in "small". Heavy editor tests (HighlightThread, TabBar, etc.) run in "rest".
// Uses explicit push-based bucketing — every file ends up in exactly one bucket so nothing is dropped.
class HookFirstSequencer extends BaseSequencer {
  async sort(files: Parameters<BaseSequencer["sort"]>[0]) {
    const sorted = await super.sort(files);
    // mustRunFirst: these three files mock @/lib/tauri-commands with different factory shapes
    // and must all run before other files that also mock it (useTabs, useDocument, SettingsPage).
    // Within this bucket, StyleMemorySection must run FIRST: its findByRole(5000ms timeout) is
    // blocked if CorrectionsTab or RulesTab run before it and leave stale userEvent callbacks.
    // The global afterEach 3-drain cycles clear StyleMemorySection's callbacks fast enough for
    // CorrectionsTab/RulesTab to pass, but not vice-versa — so StyleMemorySection goes first
    // via unshift(), regardless of duration-sort order.
    const mustRunFirst: typeof sorted = [];
    const early: typeof sorted = [];
    const small: typeof sorted = [];
    const rest: typeof sorted = [];
    for (const f of sorted) {
      const rel = (f.moduleId ?? "").replace(/\\/g, "/");
      if (rel.includes("StyleMemorySection.test")) {
        mustRunFirst.unshift(f); // force before CorrectionsTab/RulesTab regardless of duration
      } else if (
        rel.includes("RulesTab.test") ||
        rel.includes("CorrectionsTab.test")
      ) {
        mustRunFirst.push(f);
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
        !rel ||
        rel.includes("Reader.test") ||
        rel.includes("apply-accepted-correction.test") ||
        rel.includes("browser-stubs.test") ||
        rel.includes("FloatingToolbar.test") ||
        rel.includes("useFileWatcher.test") ||
        rel.includes("ToggleSwitch.test") ||
        rel.includes("ExportAnnotationsPopover.test") ||
        rel.includes("export-annotations-footer.test") ||
        // TabBar.test and ReadingSection.test hang when run after heavier tests
        // deplete VM worker resources — same pattern as FloatingToolbar/ToggleSwitch.
        rel.includes("TabBar.test") ||
        rel.includes("ReadingSection.test") ||
        // SettingsPage.test hangs when run late in the suite — accumulated stale async
        // work from prior files causes React 19's act() to spin-wait indefinitely.
        // Must run FIRST in early bucket (unshift) so fake-timer tests in early
        // (useFileWatcher, FloatingToolbar, ExportAnnotationsPopover) can't contaminate
        // React 19's scheduler before it runs.
        rel.includes("SettingsPage.test")
      ) {
        rel.includes("SettingsPage.test") ? early.unshift(f) : early.push(f);
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
    // Safety net: catch any file not in any bucket (should be impossible).
    const bucketed = new Set([...mustRunFirst, ...early, ...small, ...rest]);
    const unclassified = files.filter((f) => !bucketed.has(f));
    return [...mustRunFirst, ...early, ...small, ...rest, ...unclassified];
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
