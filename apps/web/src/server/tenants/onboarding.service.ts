import "server-only";

import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  onboardingRequests,
  sessionTenantContext,
  tenantCreationRateLimits,
  tenantMemberships,
  tenants,
  user,
} from "@/server/db/schema";
import {
  CREATION_ATTEMPT_LIMIT,
  CREATION_WINDOW_SECONDS,
  onboardingInputSchema,
} from "@/lib/tenancy/validation";
import {
  authenticatedSession,
  lockSession,
  TenancyError,
  verifyMutationOrigin,
} from "./security";

export async function createFirstCompany(headers: Headers, input: unknown) {
  const identity = await authenticatedSession(headers);
  verifyMutationOrigin(headers);
  const parsed = onboardingInputSchema.safeParse(input);
  if (!parsed.success) throw new TenancyError("INVALID_INPUT");
  const { operationId, ...company } = parsed.data;
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(company))
    .digest("hex");

  const result = await db.transaction(async (tx) => {
    // Serialize first-company creation across ALL this user's sessions. NO KEY
    // UPDATE remains compatible with foreign-key KEY SHARE locks.
    await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, identity.userId))
      .for("no key update");
    await lockSession(tx, identity, true);
    const requestKey = and(
      eq(onboardingRequests.userId, identity.userId),
      eq(onboardingRequests.operationId, operationId),
    );
    const [receipt] = await tx
      .select()
      .from(onboardingRequests)
      .where(requestKey);
    if (receipt) {
      if (receipt.fingerprint !== fingerprint)
        throw new TenancyError("IDEMPOTENCY_CONFLICT");
      const [membership] = await tx
        .select()
        .from(tenantMemberships)
        .innerJoin(tenants, eq(tenantMemberships.tenantId, tenants.id))
        .where(
          and(
            eq(tenantMemberships.tenantId, receipt.tenantId),
            eq(tenantMemberships.userId, identity.userId),
            eq(tenantMemberships.status, "ACTIVE"),
            eq(tenants.status, "ACTIVE"),
          ),
        );
      if (!membership) throw new TenancyError("FORBIDDEN");
      // Never reset another tab's newer selection when replaying a receipt.
      return { tenantId: receipt.tenantId };
    }

    // ANY membership, including inactive membership, blocks new first-company
    // creation. A prior receipt also blocks recreation after manual removal.
    const [existingMembership] = await tx
      .select({ tenantId: tenantMemberships.tenantId })
      .from(tenantMemberships)
      .where(eq(tenantMemberships.userId, identity.userId))
      .limit(1);
    const [previousCreation] = await tx
      .select({ tenantId: onboardingRequests.tenantId })
      .from(onboardingRequests)
      .where(eq(onboardingRequests.userId, identity.userId))
      .limit(1);
    if (existingMembership || previousCreation)
      throw new TenancyError("ALREADY_MEMBER");

    const [attempt] = await tx
      .select()
      .from(tenantCreationRateLimits)
      .where(
        and(
          eq(tenantCreationRateLimits.userId, identity.userId),
          eq(tenantCreationRateLimits.operationId, operationId),
        ),
      );
    if (attempt && attempt.fingerprint !== fingerprint)
      throw new TenancyError("IDEMPOTENCY_CONFLICT");
    if (!attempt) {
      const [budget] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(tenantCreationRateLimits)
        .where(
          and(
            eq(tenantCreationRateLimits.userId, identity.userId),
            sql`${tenantCreationRateLimits.createdAt} > clock_timestamp() - ${CREATION_WINDOW_SECONDS} * interval '1 second'`,
          ),
        );
      if (budget!.count >= CREATION_ATTEMPT_LIMIT)
        throw new TenancyError("RATE_LIMITED");
      await tx
        .insert(tenantCreationRateLimits)
        .values({
          userId: identity.userId,
          operationId,
          fingerprint,
          createdAt: sql`clock_timestamp()`,
        });
    }

    try {
      // Savepoint: failed creation rolls back every company write, while the
      // outer transaction retains the unique attempt so retries remain free.
      return await tx.transaction(async (creation) => {
        const [tenant] = await creation
          .insert(tenants)
          .values(company)
          .returning({ id: tenants.id });
        await creation
          .insert(tenantMemberships)
          .values({
            tenantId: tenant!.id,
            userId: identity.userId,
            role: "OWNER",
          });
        await creation
          .insert(sessionTenantContext)
          .values({ sessionId: identity.id, tenantId: tenant!.id })
          .onConflictDoUpdate({
            target: sessionTenantContext.sessionId,
            set: { tenantId: tenant!.id },
          });
        await creation
          .insert(onboardingRequests)
          .values({
            userId: identity.userId,
            operationId,
            fingerprint,
            tenantId: tenant!.id,
          });
        return { tenantId: tenant!.id };
      });
    } catch {
      return { failed: true } as const;
    }
  });
  if ("failed" in result) throw new TenancyError("UNAVAILABLE");
  return result;
}
