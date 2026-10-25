import { betterAuth } from "better-auth";
import { createAuthOptions } from "./src/server/auth/options";

export const auth = betterAuth(createAuthOptions());
