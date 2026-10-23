export const TENANT_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export const RESOURCE_STATUSES = ["ACTIVE", "INACTIVE"] as const;

export type TenantStatus = (typeof TENANT_STATUSES)[number];
export type ResourceStatus = (typeof RESOURCE_STATUSES)[number];
