import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/server/db";
import * as schema from "@/server/db/schema";
import { createAuthOptions } from "./options";

export const auth = betterAuth({
  ...createAuthOptions(),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
});

export type AuthSession = typeof auth.$Infer.Session;
