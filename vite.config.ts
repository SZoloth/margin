import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const host = process.env.TAURI_DEV_HOST;
const isTauriBuild = !!process.env.TAURI_ENV_PLATFORM;

export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      ...(!isTauriBuild
        ? {
            "@tauri-apps/api/core": path.resolve(__dirname, "src/lib/browser-stubs/core.ts"),
            "@tauri-apps/api/event": path.resolve(__dirname, "src/lib/browser-stubs/event.ts"),
            "@tauri-apps/api/window": path.resolve(__dirname, "src/lib/browser-stubs/window.ts"),
            "@tauri-apps/api/path": path.resolve(__dirname, "src/lib/browser-stubs/path.ts"),
            "@tauri-apps/plugin-clipboard-manager": path.resolve(__dirname, "src/lib/browser-stubs/clipboard.ts"),
            "@tauri-apps/plugin-fs": path.resolve(__dirname, "src/lib/browser-stubs/fs.ts"),
            "@tauri-apps/plugin-updater": path.resolve(__dirname, "src/lib/browser-stubs/updater.ts"),
            "@tauri-apps/plugin-process": path.resolve(__dirname, "src/lib/browser-stubs/process.ts"),
            "@tauri-apps/plugin-dialog": path.resolve(__dirname, "src/lib/browser-stubs/dialog.ts"),
          }
        : {}),
    },
  },
  define: {
    __MCP_DEV_PATH__: JSON.stringify(path.resolve(__dirname, "mcp/dist/index.js")),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          tiptap: [
            "@tiptap/core",
            "@tiptap/react",
            "@tiptap/starter-kit",
            "@tiptap/extension-highlight",
            "@tiptap/extension-typography",
            "tiptap-markdown",
          ],
        },
      },
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
