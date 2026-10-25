import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.join(rootDirectory, "src"),
    },
  },
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
