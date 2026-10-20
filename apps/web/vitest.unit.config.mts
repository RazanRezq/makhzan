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
    name: "unit",
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    passWithNoTests: false,
    restoreMocks: true,
  },
});
