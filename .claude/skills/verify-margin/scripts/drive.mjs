#!/usr/bin/env node
// Drives Margin's frontend in Chromium against the browser stubs (pnpm dev).
// Usage: node .claude/skills/verify-margin/scripts/drive.mjs <journey|doctor|list> [--theme light|dark|both] [--out DIR] [--url URL] [--keep-server]
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const command = args[0] ?? "list";
const url = flag("url", "http://localhost:1420");
const themes = flag("theme", "light") === "both" ? ["light", "dark"] : [flag("theme", "light")];
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = path.resolve(flag("out", path.join(tmpdir(), "margin-verify", `${stamp}-${command}`)));

function loadPlaywright() {
  const require = createRequire(path.join(repoRoot, "package.json"));
  try {
    return require("playwright");
  } catch {
    try {
      return createRequire(import.meta.url)("playwright");
    } catch {
      console.error("playwright not found. Cloud sessions have it preinstalled. On a Mac: npm i -g playwright && npx playwright install chromium");
      process.exit(2);
    }
  }
}

async function isUp() {
  try {
    const res = await fetch(url);
    return res.ok && (await res.text()).includes('id="root"');
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await isUp()) return null;
  const port = new URL(url).port || "1420";
  const child = spawn(path.join(repoRoot, "node_modules/.bin/vite"), ["--port", port, "--strictPort"], {
    cwd: repoRoot,
    stdio: "ignore",
    detached: true,
  });
  for (let i = 0; i < 60; i++) {
    if (await isUp()) return child;
    await new Promise((r) => setTimeout(r, 500));
  }
  process.kill(-child.pid);
  throw new Error(`vite did not answer at ${url} within 30s. Did you run pnpm install?`);
}

async function findPhrase(page, phrase) {
  const box = await page.evaluate((phrase) => {
    const editor = document.querySelector(".ProseMirror");
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const at = node.data.indexOf(phrase);
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + phrase.length);
      node.parentElement.scrollIntoView({ block: "center" });
      const r = range.getBoundingClientRect();
      return { x0: r.left + 1, x1: r.right - 1, y: r.top + r.height / 2 };
    }
    return null;
  }, phrase);
  if (!box) throw new Error(`phrase not in document: ${phrase}`);
  return box;
}

// Select with a real mouse drag, the way a reader does. Programmatic
// selection skips the mouseup handler that opens the highlight thread.
async function dragSelect(page, phrase) {
  const box = await findPhrase(page, phrase);
  await page.mouse.move(box.x0, box.y);
  await page.mouse.down();
  await page.mouse.move(box.x1, box.y, { steps: 6 });
  await page.mouse.up();
}

const journeys = {
  async "never-write-this"(ctx) {
    const phrase = "a quick call";
    await dragSelect(ctx.page, phrase);
    await ctx.page.getByRole("dialog", { name: "Highlight notes" }).waitFor();
    await ctx.shot("selected");
    await ctx.page.getByRole("button", { name: "Never write this" }).click();
    await ctx.page.getByText(`never write “${phrase}”`, { exact: false }).first().waitFor();
    await ctx.shot("rule-made");
    ctx.expectCall("create_highlight");
    ctx.expectCall("create_never_write_rule", (a) => JSON.stringify(a).includes(phrase));
  },

  async "highlight-and-note"(ctx) {
    await dragSelect(ctx.page, "real-time insight");
    const thread = ctx.page.getByRole("dialog", { name: "Highlight notes" });
    await thread.waitFor();
    await thread.getByRole("radio", { name: "Highlight green" }).click();
    await thread.getByPlaceholder("What should change here?").fill("Say what the insight is.");
    await ctx.page.keyboard.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter");
    await ctx.page.waitForTimeout(400);
    await ctx.shot("noted");
    ctx.expectCall("create_highlight");
    ctx.expectCall("update_highlight", (a) => JSON.stringify(a).includes("green"));
    ctx.expectCall("create_margin_note", (a) => JSON.stringify(a).includes("Say what the insight is."));
  },
};

async function runJourney(pw, name, theme) {
  const browser = await pw.chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: theme });
  page.setDefaultTimeout(10000);
  const consoleErrors = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  const failures = [];
  let step = 0;
  const ctx = {
    page,
    shot: async (label) => {
      const file = path.join(outDir, `${theme}-${String(++step).padStart(2, "0")}-${label}.png`);
      await page.screenshot({ path: file });
    },
    calls: () => page.evaluate(() => window.__MARGIN_STUB_CALLS__ ?? []),
    expectCall: () => {},
  };
  const expectations = [];
  ctx.expectCall = (cmd, check = () => true) => expectations.push({ cmd, check });

  try {
    await page.goto(url);
    await page.locator(".ProseMirror").waitFor();
    await page.evaluate(() => {
      window.__MARGIN_STUB_CALLS__ = [];
      // The design-playground version picker (dev-only Vite plugin) floats over toasts.
      let el = document.querySelector('[aria-label="Select UI version"]');
      while (el && getComputedStyle(el).position !== "fixed") el = el.parentElement;
      el?.remove();
    });
    await ctx.shot("start");
    await journeys[name](ctx);
  } catch (e) {
    failures.push(`journey threw: ${e.message.split("\n")[0]}`);
    await ctx.shot("failure").catch(() => {});
  }
  const calls = await ctx.calls().catch(() => []);
  for (const { cmd, check } of expectations) {
    if (!calls.some((c) => c.cmd === cmd && check(c.args))) failures.push(`expected backend call ${cmd} not sent`);
  }
  const unhandled = [...new Set(calls.filter((c) => !c.handled).map((c) => c.cmd))];
  writeFileSync(path.join(outDir, `${theme}-calls.json`), JSON.stringify(calls, null, 2));
  writeFileSync(path.join(outDir, `${theme}-console-errors.json`), JSON.stringify(consoleErrors, null, 2));
  await browser.close();
  return { theme, pass: failures.length === 0, failures, unhandled, consoleErrors: consoleErrors.length };
}

async function doctor(pw) {
  const browser = await pw.chromium.launch();
  const page = await browser.newPage();
  await page.goto(url);
  await page.locator(".ProseMirror").waitFor({ timeout: 15000 });
  const report = await page.evaluate(() => ({
    title: document.title,
    editorMounted: !!document.querySelector(".ProseMirror"),
    stubbedBackend: Array.isArray(window.__MARGIN_STUB_CALLS__),
    firstHeading: document.querySelector(".ProseMirror h1")?.textContent ?? null,
  }));
  await browser.close();
  return report;
}

async function main() {
  if (command === "list") {
    console.log(["doctor", ...Object.keys(journeys)].join("\n"));
    return 0;
  }
  if (command !== "doctor" && !journeys[command]) {
    console.error(`unknown journey ${command}. Known: ${Object.keys(journeys).join(", ")}`);
    return 2;
  }
  mkdirSync(outDir, { recursive: true });
  const pw = loadPlaywright();
  const server = await ensureServer();
  try {
    if (command === "doctor") {
      const report = await doctor(pw);
      console.log(JSON.stringify(report, null, 2));
      return report.editorMounted && report.stubbedBackend ? 0 : 1;
    }
    const results = [];
    for (const theme of themes) results.push(await runJourney(pw, command, theme));
    const summary = { journey: command, url, evidence: outDir, results };
    writeFileSync(path.join(outDir, "result.json"), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
    return results.every((r) => r.pass) ? 0 : 1;
  } finally {
    if (server && !args.includes("--keep-server")) process.kill(-server.pid);
  }
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
