import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth";

export const getServerSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});

export async function requireServerSession(locale: string) {
  const session = await getServerSession();
  if (!session) redirect(`/${locale}/sign-in`);
  return session;
}
