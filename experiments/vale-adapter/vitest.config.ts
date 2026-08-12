import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["experiments/vale-adapter/tests/**/*.test.ts"],
    testTimeout: 10_000,
  },
});
