import "server-only";

import { and, eq, gt, sql } from "drizzle-orm";
import { auth } from "@/server/auth/auth";
import type { AuthSession } from "@/server/auth/auth";
import { getTrustedOrigins } from "@/server/auth/environment";
import { db } from "@/server/db";
import {
  session,
  sessionTenantContext,
  tenantMemberships,
  tenants,
} from "@/server/db/schema";
import { hasPermission } from "@/lib/tenancy/permissions";
import type { TenantPermission } from "@/lib/tenancy/permissions";
import type { TenancyErrorCode } from "@/lib/tenancy/validation";

export class TenancyError extends Error {
  constructor(public readonly code: TenancyErrorCode) {
    super(code);
    this.name = "TenancyError";
  }
}

export type TenantTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];
export type SessionIdentity = AuthSession["session"];

export async function authenticatedSession(headers: Headers) {
  const authenticated = await auth.api.getSession({ headers });
  if (!authenticated) throw new TenancyError("UNAUTHENTICATED");
  return authenticated.session;
}

export function verifyMutationOrigin(headers: Headers) {
  const origin = headers.get("origin");
  if (!origin || !getTrustedOrigins().includes(origin)) {
    throw new TenancyError("FORBIDDEN");
  }
}

export async function lockSession(
  tx: TenantTransaction,
  identity: SessionIdentity,
  exclusive = false,
) {
  const [current] = await tx
    .select({ id: session.id })
    .from(session)
    .where(
      and(
        eq(session.id, identity.id),
        eq(session.userId, identity.userId),
        gt(session.expiresAt, sql`clock_timestamp()`),
      ),
    )
    .for(exclusive ? "update" : "share");
  if (!current) throw new TenancyError("UNAUTHENTICATED");
}

// Lock order: session -> context -> tenant -> membership. Administration locks
// the tenant exclusively before reading roles or counting owners. No authz
// decision is kept in a cross-request/shared cache.
export async function lockedTenantContext(
  tx: TenantTransaction,
  identity: SessionIdentity,
  permission: TenantPermission,
  options: { expectedVersion?: number; administer?: boolean } = {},
) {
  const [context] = await tx
    .select()
    .from(sessionTenantContext)
    .where(eq(sessionTenantContext.sessionId, identity.id))
    .for("share");
  if (!context) throw new TenancyError("NO_TENANT");
  if (
    options.expectedVersion !== undefined &&
    context.version !== options.expectedVersion
  ) {
    throw new TenancyError("STALE_CONTEXT");
  }
  const [tenant] = await tx
    .select()
    .from(tenants)
    .where(eq(tenants.id, context.tenantId))
    .for(options.administer ? "update" : "share");
  const [membership] = await tx
    .select()
    .from(tenantMemberships)
    .where(
      and(
        eq(tenantMemberships.tenantId, context.tenantId),
        eq(tenantMemberships.userId, identity.userId),
      ),
    )
    .for("share");
  if (
    !tenant ||
    tenant.status !== "ACTIVE" ||
    !membership ||
    membership.status !== "ACTIVE"
  ) {
    throw new TenancyError("FORBIDDEN");
  }
  if (!hasPermission(membership.role, permission))
    throw new TenancyError("FORBIDDEN");
  return {
    tenantId: tenant.id,
    name: tenant.name,
    baseCurrency: tenant.baseCurrency,
    timezone: tenant.timezone,
    role: membership.role,
    version: context.version,
  };
}

export async function authorizeTenant(
  headers: Headers,
  permission: TenantPermission,
) {
  const identity = await authenticatedSession(headers);
  return db.transaction(async (tx) => {
    await lockSession(tx, identity);
    return lockedTenantContext(tx, identity, permission);
  });
}
