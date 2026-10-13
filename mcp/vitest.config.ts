import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/__tests__/**/*.test.ts", "scripts/regression/rewrite-eval/__tests__/**/*.test.ts"],
  },
});
