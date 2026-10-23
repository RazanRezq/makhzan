import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.join(rootDirectory, "src"),
      "server-only": path.join(rootDirectory, "tests/support/server-only.ts"),
    },
  },
  test: {
    name: "database",
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    passWithNoTests: false,
    fileParallelism: false,
    maxWorkers: 1,
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
