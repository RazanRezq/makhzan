import type { BetterAuthOptions } from "better-auth";
import { APIError } from "better-auth/api";
import { registrationProfileSchema } from "@/lib/auth/validation";
import {
  getAuthBaseUrl,
  getAuthSecret,
  getTrustedOrigins,
  isRegistrationEnabled,
} from "./environment";

export function createAuthOptions(): BetterAuthOptions {
  return {
    appName: "Makhzan",
    baseURL: getAuthBaseUrl(),
    secret: getAuthSecret(),
    trustedOrigins: getTrustedOrigins(),
    emailAndPassword: {
      enabled: true,
      autoSignIn: false,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-up/email": { window: 60, max: 5 },
        "/sign-in/email": { window: 60, max: 5 },
      },
    },
    disabledPaths: isRegistrationEnabled() ? [] : ["/sign-up/email"],
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            const profile = registrationProfileSchema.safeParse(user);
            if (!profile.success) {
              throw new APIError("BAD_REQUEST", {
                message: "Invalid registration data.",
              });
            }
            return {
              data: {
                ...user,
                name: profile.data.name,
                email: profile.data.email,
              },
            };
          },
        },
      },
    },
    telemetry: { enabled: false },
    advanced: {
      cookiePrefix: "makhzan",
      // Better Auth otherwise skips origin checks under NODE_ENV=test.
      // Exercise the same security boundary in tests and the running app.
      disableOriginCheck: false,
      disableCSRFCheck: false,
    },
  };
}
