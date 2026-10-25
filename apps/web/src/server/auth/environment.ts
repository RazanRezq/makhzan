const LOCAL_TEST_HOSTS = new Set(["127.0.0.1", "localhost", "postgres-test"]);
const INSECURE_EXAMPLE_SECRETS = new Set([
  "local-development-only-auth-secret-change-me",
  "replace-with-a-unique-random-secret-at-least-32-characters",
]);

function parseHttpUrl(value: string, variableName: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variableName} must be a valid absolute URL.`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${variableName} must use http or https.`);
  }

  return url;
}

function isIsolatedAuthTestEnvironment() {
  if (process.env.AUTH_TEST_MODE !== "true") return false;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return false;

  try {
    const url = new URL(databaseUrl);
    return (
      (url.protocol === "postgres:" || url.protocol === "postgresql:") &&
      decodeURIComponent(url.pathname.slice(1)) === "makhzan_test" &&
      LOCAL_TEST_HOSTS.has(url.hostname)
    );
  } catch {
    return false;
  }
}

export function getAuthBaseUrl() {
  const value = process.env.BETTER_AUTH_URL;
  if (!value) {
    if (process.env.NODE_ENV !== "production") return "http://localhost:3000";
    throw new Error("BETTER_AUTH_URL is required in production.");
  }

  const url = parseHttpUrl(value, "BETTER_AUTH_URL");
  if (
    process.env.NODE_ENV === "production" &&
    url.protocol !== "https:" &&
    !isIsolatedAuthTestEnvironment()
  ) {
    throw new Error("BETTER_AUTH_URL must use https in production.");
  }

  return url.origin;
}

export function getAuthSecret() {
  const value = process.env.BETTER_AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters.");
  }
  if (
    process.env.NODE_ENV === "production" &&
    INSECURE_EXAMPLE_SECRETS.has(value)
  ) {
    throw new Error("BETTER_AUTH_SECRET must not use a documented example value.");
  }
  return value;
}

export function getTrustedOrigins() {
  const origins = new Set([getAuthBaseUrl()]);
  const configuredOrigins = process.env.AUTH_TRUSTED_ORIGINS?.split(",") ?? [];

  for (const configuredOrigin of configuredOrigins) {
    const value = configuredOrigin.trim();
    if (value) {
      const url = parseHttpUrl(value, "AUTH_TRUSTED_ORIGINS");
      if (
        process.env.NODE_ENV === "production" &&
        url.protocol !== "https:" &&
        !isIsolatedAuthTestEnvironment()
      ) {
        throw new Error("AUTH_TRUSTED_ORIGINS must use https in production.");
      }
      origins.add(url.origin);
    }
  }

  return [...origins];
}

export function isRegistrationEnabled() {
  if (process.env.NODE_ENV !== "production") return true;
  return isIsolatedAuthTestEnvironment();
}
