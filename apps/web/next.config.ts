import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin();

const nextConfig: NextConfig = {
  // Support the loopback IP as well as localhost during development.
  allowedDevOrigins: ["127.0.0.1"],
  cacheComponents: true,
  partialPrefetching: true,
  // Poll in Docker to support bind mounts on macOS, Windows, and Linux.
  // Native local development retains Next.js' default file watching.
  watchOptions:
    process.env.DOCKER_WATCH_POLLING === "1"
      ? { pollIntervalMs: 1000 }
      : undefined,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
