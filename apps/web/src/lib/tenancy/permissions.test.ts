import { describe, expect, it } from "vitest";
import { hasPermission, PERMISSION_MATRIX, TENANT_ROLES } from "./permissions";
import { onboardingInputSchema } from "./validation";

describe("tenant permission policy", () => {
  it("grants OWNER all defined permissions", () => {
    for (const permission of Object.keys(
      PERMISSION_MATRIX,
    ) as (keyof typeof PERMISSION_MATRIX)[]) {
      expect(hasPermission("OWNER", permission)).toBe(true);
    }
  });
  it.each(["MANAGER", "STAFF", "VIEWER"] as const)(
    "keeps %s out of company, member, and billing administration",
    (role) => {
      for (const permission of [
        "members.manage",
        "tenantSettings.update",
        "billing.manage",
      ] as const) {
        expect(hasPermission(role, permission)).toBe(false);
      }
    },
  );
  it("allows STAFF operational tasks but not catalog maintenance or reports", () => {
    expect(hasPermission("STAFF", "inventory.adjust")).toBe(true);
    expect(hasPermission("STAFF", "purchaseOrders.receive")).toBe(true);
    expect(hasPermission("STAFF", "products.write")).toBe(false);
    expect(hasPermission("STAFF", "reports.read")).toBe(false);
  });
  it("keeps VIEWER read-only", () => {
    for (const permission of Object.keys(
      PERMISSION_MATRIX,
    ) as (keyof typeof PERMISSION_MATRIX)[]) {
      if (!permission.endsWith(".read"))
        expect(hasPermission("VIEWER", permission)).toBe(false);
    }
    for (const role of TENANT_ROLES)
      expect(hasPermission(role, "demoProducts.read")).toBe(true);
  });
});

describe("onboarding input", () => {
  const input = {
    name: "  Acme  ",
    baseCurrency: "aed",
    timezone: "Asia/Dubai",
    operationId: "2c657541-f0a5-4b22-85d2-e42506a0f534",
  };
  it("normalizes company input without accepting client ownership", () => {
    expect(onboardingInputSchema.parse(input)).toMatchObject({
      name: "Acme",
      baseCurrency: "AED",
    });
    expect(
      onboardingInputSchema.safeParse({ ...input, role: "OWNER" }).success,
    ).toBe(false);
    expect(
      onboardingInputSchema.safeParse({ ...input, tenantId: input.operationId })
        .success,
    ).toBe(false);
  });
  it.each([{ baseCurrency: "ZZZ" }, { timezone: "Mars/Base" }, { name: " " }])(
    "rejects unsupported company details (%j)",
    (change) => {
      expect(
        onboardingInputSchema.safeParse({ ...input, ...change }).success,
      ).toBe(false);
    },
  );
});
