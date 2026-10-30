import { z } from "zod";
import { contextVersionSchema } from "@/lib/tenancy/validation";
import {
  normalizeCategoryCode,
  normalizeSku,
  normalizeUnitCode,
} from "./product-codes";

function normalizedIdentifier(normalize: (value: string) => string) {
  return z
    .string()
    .max(512)
    .transform((value, context) => {
      try {
        return normalize(value);
      } catch {
        context.addIssue({
          code: "custom",
          message: "Invalid product identifier",
        });
        return z.NEVER;
      }
    });
}

export const productFieldsSchema = z
  .object({
    sku: normalizedIdentifier(normalizeSku),
    name: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/^[^\p{Cc}]+$/u),
    categoryCode: normalizedIdentifier(normalizeCategoryCode),
    unitCode: normalizedIdentifier(normalizeUnitCode),
  })
  .strict();
const expectedVersion = contextVersionSchema.refine((value) => value > 0);
export const productCreateSchema = productFieldsSchema.extend({
  expectedVersion,
});
export const productUpdateSchema = productCreateSchema.extend({ id: z.uuid() });
export const productStatusSchema = z
  .object({ id: z.uuid(), expectedVersion })
  .strict();
export const productIdSchema = z.object({ id: z.uuid() }).strict();

const positiveInteger = z
  .union([
    z.number().int(),
    z
      .string()
      .regex(/^[1-9]\d{0,6}$/)
      .transform(Number),
  ])
  .pipe(z.number().int().min(1).max(1_000_000));
export const PRODUCT_PAGE_SIZES = [10, 25, 50, 100] as const;
export const productQuerySchema = z
  .object({
    search: z
      .string()
      .trim()
      .max(160)
      .regex(/^[^\p{Cc}]*$/u)
      .default(""),
    category: z
      .string()
      .max(512)
      .transform((value, context) => {
        if (!value.trim()) return "";
        try {
          return normalizeCategoryCode(value);
        } catch {
          context.addIssue({
            code: "custom",
            message: "Invalid category code",
          });
          return z.NEVER;
        }
      })
      .default(""),
    status: z.enum(["ALL", "ACTIVE", "INACTIVE"]).default("ALL"),
    sort: z.enum(["sku", "name", "createdAt"]).default("createdAt"),
    direction: z.enum(["asc", "desc"]).default("desc"),
    page: positiveInteger.default(1),
    pageSize: positiveInteger
      .refine((value) =>
        (PRODUCT_PAGE_SIZES as readonly number[]).includes(value),
      )
      .default(25),
  })
  .strict();
export function parseProductQuery(input: unknown = {}) {
  return productQuerySchema.parse(input);
}
// Repeated URL values stay arrays so strict validation rejects ambiguous input.
export function productQueryFromSearchParams(params: URLSearchParams) {
  const values = new Map<string, string | string[]>();
  for (const key of new Set(params.keys())) {
    const all = params.getAll(key);
    values.set(key, all.length === 1 ? all[0]! : all);
  }
  return Object.fromEntries(values);
}
