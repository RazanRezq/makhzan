export const TENANT_ROLES = ["OWNER", "MANAGER", "STAFF", "VIEWER"] as const;
export type TenantRole = (typeof TENANT_ROLES)[number];

const everyone = TENANT_ROLES;
const administrators = ["OWNER", "MANAGER"] as const;
const operators = ["OWNER", "MANAGER", "STAFF"] as const;
const owner = ["OWNER"] as const;

// Business permissions describe future capabilities; they do not expose features.
export const PERMISSION_MATRIX = {
  "dashboard.read": everyone,
  "demoProducts.read": everyone,
  "products.read": everyone,
  "products.write": administrators,
  "warehouses.read": everyone,
  "warehouses.write": administrators,
  "inventory.read": everyone,
  "inventory.adjust": operators,
  "purchaseOrders.read": everyone,
  "purchaseOrders.create": operators,
  "purchaseOrders.receive": operators,
  "purchaseOrders.manage": administrators,
  "salesOrders.read": everyone,
  "salesOrders.create": operators,
  "salesOrders.fulfill": operators,
  "salesOrders.manage": administrators,
  "reports.read": ["OWNER", "MANAGER", "VIEWER"],
  "tenantSettings.read": owner,
  "tenantSettings.update": owner,
  "members.manage": owner,
  "billing.manage": owner,
} as const satisfies Record<string, readonly TenantRole[]>;

export type TenantPermission = keyof typeof PERMISSION_MATRIX;

export function hasPermission(role: TenantRole, permission: TenantPermission) {
  return (PERMISSION_MATRIX[permission] as readonly TenantRole[]).includes(
    role,
  );
}
