import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthOptions } from "./options";
import { getAuthBaseUrl, getAuthSecret, getTrustedOrigins, isRegistrationEnabled } from "./environment";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("AUTH_TEST_MODE", "");
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@postgres-test:5432/makhzan_test");
  vi.stubEnv("BETTER_AUTH_URL", "https://auth.example.test");
  vi.stubEnv("AUTH_TRUSTED_ORIGINS", "https://auth.example.test");
  vi.stubEnv("BETTER_AUTH_SECRET", "synthetic-unit-test-secret-at-least-32-characters");
});
afterEach(() => vi.unstubAllEnvs());

describe("production authentication configuration", () => {
  it.each([
    "",
    "too-short",
    "local-development-only-auth-secret-change-me",
    "replace-with-a-unique-random-secret-at-least-32-characters",
  ])("rejects a missing, short, or documented placeholder secret (%s)", (secret) => {
    vi.stubEnv("BETTER_AUTH_SECRET", secret);
    expect(getAuthSecret).toThrow(/BETTER_AUTH_SECRET/);
  });

  it.each(["", "not-a-url", "http://localhost:3000", "javascript:alert(1)"])(
    "rejects an unsafe production base URL (%s)", (url) => {
      vi.stubEnv("BETTER_AUTH_URL", url);
      expect(getAuthBaseUrl).toThrow(/BETTER_AUTH_URL/);
    },
  );

  it("rejects an insecure trusted origin", () => {
    vi.stubEnv("AUTH_TRUSTED_ORIGINS", "https://auth.example.test,http://localhost:3000");
    expect(getTrustedOrigins).toThrow(/AUTH_TRUSTED_ORIGINS/);
  });

  it("disables registration and keeps session caching and CSRF bypasses off", () => {
    const options = createAuthOptions();
    expect(options.disabledPaths).toContain("/sign-up/email");
    expect(options.session?.cookieCache?.enabled).not.toBe(true);
    expect(options.advanced?.disableCSRFCheck).toBe(false);
    expect(options.advanced?.disableOriginCheck).toBe(false);
    expect(options.rateLimit).toMatchObject({ enabled: true, storage: "database" });
  });

  it.each([
    "postgresql://test:test@postgres:5432/makhzan",
    "postgresql://test:test@remote.example:5432/makhzan_test",
    "not-a-url",
  ])("refuses the test-only exception outside an isolated database (%s)", (url) => {
    vi.stubEnv("AUTH_TEST_MODE", "true");
    vi.stubEnv("DATABASE_URL", url);
    vi.stubEnv("BETTER_AUTH_URL", "http://127.0.0.1:3000");
    expect(isRegistrationEnabled()).toBe(false);
    expect(getAuthBaseUrl).toThrow(/https/);
  });
});
