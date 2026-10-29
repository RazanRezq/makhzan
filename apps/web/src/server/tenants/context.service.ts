import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import {
  onboardingRequests,
  sessionTenantContext,
  tenantMemberships,
  tenants,
  user,
} from "@/server/db/schema";
import { selectionInputSchema } from "@/lib/tenancy/validation";
import {
  authenticatedSession,
  lockSession,
  lockedTenantContext,
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
    const activeTenantId =
      companies.find(({ tenantId }) => tenantId === context?.tenantId)?.tenantId ??
      null;
    return {
      companies,
      canOnboard: !membership && !receipt,
      contextVersion: context?.version ?? 0,
      activeTenantId,
      selectionUnavailable: Boolean(context && !activeTenantId),
      needsAutoSelection: !context && companies.length === 1,
    };
  });
}

// POST-only entry resolution. No client tenant/role input and no render-time writes.
export async function resolveCompanyEntry(headers: Headers) {
  const identity = await authenticatedSession(headers);
  verifyMutationOrigin(headers);
  return db.transaction(async (tx) => {
    // Same user-before-session ordering as onboarding. UPDATE also blocks new
    // membership FK inserts while deciding whether there is exactly one company.
    await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, identity.userId))
      .for("update");
    await lockSession(tx, identity, true);
    const [context] = await tx
      .select()
      .from(sessionTenantContext)
      .where(eq(sessionTenantContext.sessionId, identity.id));
    if (context) {
      try {
        await lockedTenantContext(tx, identity, "dashboard.read");
        return { destination: "/" as const };
      } catch (error) {
        if (!(error instanceof TenancyError) || error.code !== "FORBIDDEN")
          throw error;
        // Retain invalid contexts: recovering from revocation must be explicit.
      }
    }
    // Lock tenants before memberships, including inactive ones: status changes
    // cannot race the eligibility count. Discovery is authenticated-user scoped.
    const relatedTenants = await tx
      .select({ id: tenants.id, status: tenants.status })
      .from(tenants)
      .innerJoin(tenantMemberships, eq(tenantMemberships.tenantId, tenants.id))
      .where(eq(tenantMemberships.userId, identity.userId))
      .orderBy(tenants.id)
      .for("share", { of: tenants });
    const memberships = await tx
      .select()
      .from(tenantMemberships)
      .where(eq(tenantMemberships.userId, identity.userId))
      .orderBy(tenantMemberships.tenantId)
      .for("share");
    const eligible = memberships.filter(
      (membership) =>
        membership.status === "ACTIVE" &&
        relatedTenants.some(
          (tenant) => tenant.id === membership.tenantId && tenant.status === "ACTIVE",
        ),
    );
    if (!eligible.length) return { destination: "/onboarding" as const };
    if (context || eligible.length !== 1)
      return { destination: "/select-company" as const };
    await tx.insert(sessionTenantContext).values({
      sessionId: identity.id,
      tenantId: eligible[0]!.tenantId,
    });
    return { destination: "/" as const };
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
