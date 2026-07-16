import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["experiments/post-training/tests/**/*.test.ts"],
    testTimeout: 10_000,
  },
});
