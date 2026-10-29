import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  onboardingRequests,
  sessionTenantContext,
  tenantMemberships,
  tenants,
} from "@/server/db/schema";
import { selectionInputSchema } from "@/lib/tenancy/validation";
import {
  authenticatedSession,
  lockSession,
  TenancyError,
  verifyMutationOrigin,
} from "./security";

export async function getCompanyAccess(headers: Headers) {
  const identity = await authenticatedSession(headers);
  return db.transaction(async (tx) => {
    await lockSession(tx, identity);
    // Bootstrap discovery is intentionally scoped to session.userId, before a
    // tenant exists. Ordinary business queries never use this exception.
    const companies = await tx
      .select({
        tenantId: tenants.id,
        name: tenants.name,
        role: tenantMemberships.role,
      })
      .from(tenantMemberships)
      .innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
      .where(
        and(
          eq(tenantMemberships.userId, identity.userId),
          eq(tenantMemberships.status, "ACTIVE"),
          eq(tenants.status, "ACTIVE"),
        ),
      )
      .orderBy(tenants.name, tenants.id);
    const [membership] = await tx
      .select({ tenantId: tenantMemberships.tenantId })
      .from(tenantMemberships)
      .where(eq(tenantMemberships.userId, identity.userId))
      .limit(1);
    const [receipt] = await tx
      .select({ operationId: onboardingRequests.operationId })
      .from(onboardingRequests)
      .where(eq(onboardingRequests.userId, identity.userId))
      .limit(1);
    const [context] = await tx
      .select()
      .from(sessionTenantContext)
      .where(eq(sessionTenantContext.sessionId, identity.id));
    return {
      companies,
      canOnboard: !membership && !receipt,
      contextVersion: context?.version ?? 0,
      activeTenantId:
        companies.find(({ tenantId }) => tenantId === context?.tenantId)
          ?.tenantId ?? null,
    };
  });
}

export async function selectCompany(headers: Headers, input: unknown) {
  const identity = await authenticatedSession(headers);
  verifyMutationOrigin(headers);
  const parsed = selectionInputSchema.safeParse(input);
  if (!parsed.success) throw new TenancyError("INVALID_INPUT");
  const { tenantId, expectedVersion } = parsed.data;
  return db.transaction(async (tx) => {
    // Exclusive session lock also serializes concurrent first context inserts.
    await lockSession(tx, identity, true);
    const [context] = await tx
      .select()
      .from(sessionTenantContext)
      .where(eq(sessionTenantContext.sessionId, identity.id));
    if ((context?.version ?? 0) !== expectedVersion)
      throw new TenancyError("STALE_CONTEXT");
    const [tenant] = await tx
      .select({ id: tenants.id })
      .from(tenants)
      .where(and(eq(tenants.id, tenantId), eq(tenants.status, "ACTIVE")))
      .for("share");
    const [membership] = await tx
      .select({ userId: tenantMemberships.userId })
      .from(tenantMemberships)
      .where(
        and(
          eq(tenantMemberships.tenantId, tenantId),
          eq(tenantMemberships.userId, identity.userId),
          eq(tenantMemberships.status, "ACTIVE"),
        ),
      )
      .for("share");
    if (!tenant || !membership) throw new TenancyError("FORBIDDEN");
    const [selected] = await tx
      .insert(sessionTenantContext)
      .values({ sessionId: identity.id, tenantId })
      .onConflictDoUpdate({
        target: sessionTenantContext.sessionId,
        set: { tenantId },
      })
      .returning({ version: sessionTenantContext.version });
    return { version: selected!.version };
  });
}
