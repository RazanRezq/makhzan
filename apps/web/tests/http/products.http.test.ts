import { spawn } from "node:child_process";
import { once } from "node:events";
import { rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ChildProcess } from "node:child_process";

type RunningServer = {
  baseUrl: string;
  process: ChildProcess;
  output: () => string;
};

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(testDirectory, "../..");
const distDirectoryName = `.next-http-${process.pid}`;
const distDirectory = path.join(webRoot, distDirectoryName);
const testTsconfigName = `tsconfig.http-${process.pid}.json`;
const testTsconfigPath = path.join(webRoot, testTsconfigName);
const nextCli = createRequire(import.meta.url).resolve("next/dist/bin/next");

let enabledServer: RunningServer | undefined;
let disabledServer: RunningServer | undefined;

function nextEnvironment(demoApiEnabled: boolean): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: "production",
    NEXT_DIST_DIR: distDirectoryName,
    NEXT_TSCONFIG: testTsconfigName,
    NEXT_TELEMETRY_DISABLED: "1",
    ENABLE_DEMO_PRODUCTS_API: demoApiEnabled ? "true" : "false",
  };
}

async function runProductionBuild() {
  const child = spawn(process.execPath, [nextCli, "build"], {
    cwd: webRoot,
    env: nextEnvironment(false),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });

  const [exitCode] = (await once(child, "exit")) as [number | null];
  if (exitCode !== 0) {
    throw new Error(`Next.js test build failed with exit code ${exitCode}.\n${output}`);
  }
}

async function reserveAvailablePort(): Promise<number> {
  const server = createServer();
  server.unref();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Unable to reserve a TCP port for the HTTP test server.");
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
}

async function startProductionServer(demoApiEnabled: boolean): Promise<RunningServer> {
  const port = await reserveAvailablePort();
  const child = spawn(
    process.execPath,
    [
      nextCli,
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: webRoot,
      env: nextEnvironment(demoApiEnabled),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js server exited before readiness.\n${output}`);
    }
    try {
      await fetch(`${baseUrl}/api/products`);
      return { baseUrl, process: child, output: () => output };
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  child.kill("SIGKILL");
  throw new Error(`Next.js server readiness timed out.\n${output}`);
}

async function stopServer(server: RunningServer | undefined) {
  if (!server || server.process.exitCode !== null) return;
  const exited = once(server.process, "exit");
  server.process.kill("SIGTERM");
  const timedOut = new Promise<"timeout">((resolve) => {
    setTimeout(() => resolve("timeout"), 5_000).unref();
  });
  if ((await Promise.race([exited, timedOut])) === "timeout") {
    if (server.process.exitCode === null) server.process.kill("SIGKILL");
    await exited;
  }
}

beforeAll(async () => {
  if (
    path.dirname(distDirectory) !== webRoot ||
    !path.basename(distDirectory).startsWith(".next-http-")
  ) {
    throw new Error("Refusing to use an unsafe HTTP test build directory.");
  }

  await rm(distDirectory, { recursive: true, force: true });
  await writeFile(
    testTsconfigPath,
    `${JSON.stringify(
      {
        extends: "./tsconfig.json",
        include: [
          "next-env.d.ts",
          "**/*.mts",
          "**/*.ts",
          "**/*.tsx",
          `${distDirectoryName}/types/**/*.ts`,
          `${distDirectoryName}/dev/types/**/*.ts`,
        ],
        exclude: ["node_modules"],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await runProductionBuild();
  enabledServer = await startProductionServer(true);
  disabledServer = await startProductionServer(false);
});

afterAll(async () => {
  await Promise.all([stopServer(enabledServer), stopServer(disabledServer)]);
  await rm(distDirectory, { recursive: true, force: true });
  await rm(testTsconfigPath, { force: true });
});

describe("products HTTP contracts", () => {
  it("serves the deterministic synthetic catalog when explicitly enabled", async () => {
    const response = await fetch(`${enabledServer?.baseUrl}/api/products`);
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body).toMatchObject({
      meta: { count: 42, source: "synthetic-demo" },
    });

    if (
      typeof body !== "object" ||
      body === null ||
      !("data" in body) ||
      !Array.isArray(body.data)
    ) {
      throw new Error("Products response did not contain a data array.");
    }
    expect(body.data).toHaveLength(42);
    const ids = body.data.map((product: unknown) => {
      if (typeof product !== "object" || product === null || !("id" in product)) {
        throw new Error("Product response item did not contain an id.");
      }
      return product.id;
    });
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("rejects unsupported methods through the running Next.js server", async () => {
    const response = await fetch(`${enabledServer?.baseUrl}/api/products`, {
      method: "POST",
    });

    expect(response.status).toBe(405);
  });

  it("keeps the demo API disabled in production without explicit access", async () => {
    const response = await fetch(`${disabledServer?.baseUrl}/api/products`);
    const body: unknown = await response.json();

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body).toEqual({
      error: {
        code: "DEMO_API_DISABLED",
        message: "The synthetic products API is disabled.",
      },
    });
  });
});

describe("localized product routes", () => {
  it.each([
    { locale: "en", direction: "ltr", title: "Products" },
    { locale: "ar", direction: "rtl", title: "المنتجات" },
  ])("serves /$locale/products as $direction HTML", async ({ locale, direction, title }) => {
    const response = await fetch(`${disabledServer?.baseUrl}/${locale}/products`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(html).toContain(`<html lang="${locale}" dir="${direction}"`);
    expect(html).toContain(title);
    expect(html).toContain("BEV-WAT-001");
  });
});
