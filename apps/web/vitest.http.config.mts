import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "http",
    environment: "node",
    include: ["tests/http/**/*.test.ts"],
    passWithNoTests: false,
    fileParallelism: false,
    maxWorkers: 1,
    hookTimeout: 240_000,
    testTimeout: 30_000,
  },
});
