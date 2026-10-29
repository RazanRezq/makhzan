import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { tenantMemberships } from "@/server/db/schema";
import { membershipInputSchema } from "@/lib/tenancy/validation";
import {
  authenticatedSession,
  lockSession,
  lockedTenantContext,
  TenancyError,
  verifyMutationOrigin,
} from "./security";

// Server-only administration primitive. No public add-member, role-management,
// or invitation endpoint is exposed in Group C.
export async function updateMembership(headers: Headers, input: unknown) {
  const identity = await authenticatedSession(headers);
  verifyMutationOrigin(headers);
  const parsed = membershipInputSchema.safeParse(input);
  if (!parsed.success) throw new TenancyError("INVALID_INPUT");
  const { targetUserId, role, status, expectedVersion } = parsed.data;
  await db.transaction(async (tx) => {
    await lockSession(tx, identity);
    const context = await lockedTenantContext(tx, identity, "members.manage", {
      expectedVersion,
      administer: true,
    });
    const targetKey = and(
      eq(tenantMemberships.tenantId, context.tenantId),
      eq(tenantMemberships.userId, targetUserId),
    );
    const [target] = await tx
      .select()
      .from(tenantMemberships)
      .where(targetKey)
      .for("update");
    if (!target) throw new TenancyError("FORBIDDEN");
    if (
      target.role === "OWNER" &&
      target.status === "ACTIVE" &&
      (role !== "OWNER" || status !== "ACTIVE")
    ) {
      const [owners] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(tenantMemberships)
        .where(
          and(
            eq(tenantMemberships.tenantId, context.tenantId),
            eq(tenantMemberships.role, "OWNER"),
            eq(tenantMemberships.status, "ACTIVE"),
          ),
        );
      if (owners!.count <= 1) throw new TenancyError("FINAL_OWNER");
    }
    await tx.update(tenantMemberships).set({ role, status }).where(targetKey);
  });
}
