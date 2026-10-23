import { z } from "zod";

export const SKU_MAX_LENGTH = 64;
export const CATEGORY_CODE_MAX_LENGTH = 64;
export const UNIT_CODE_MAX_LENGTH = 32;

export const CANONICAL_SKU_PATTERN = /^[\x21-\x7e]+(?: [\x21-\x7e]+)*$/;
export const CATALOG_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._/-]*$/;

const canonicalSkuSchema = z
  .string()
  .min(1)
  .max(SKU_MAX_LENGTH)
  .regex(CANONICAL_SKU_PATTERN);

const canonicalCategoryCodeSchema = z
  .string()
  .min(1)
  .max(CATEGORY_CODE_MAX_LENGTH)
  .regex(CATALOG_CODE_PATTERN);

const canonicalUnitCodeSchema = z
  .string()
  .min(1)
  .max(UNIT_CODE_MAX_LENGTH)
  .regex(CATALOG_CODE_PATTERN);

function normalizeUnicodeIdentifier(value: string) {
  return value.normalize("NFKC").trim().toUpperCase();
}

export function normalizeSku(value: string) {
  const normalized = normalizeUnicodeIdentifier(value).replace(/\s+/gu, " ");
  return canonicalSkuSchema.parse(normalized);
}

export function normalizeCategoryCode(value: string) {
  return canonicalCategoryCodeSchema.parse(normalizeUnicodeIdentifier(value));
}

export function normalizeUnitCode(value: string) {
  return canonicalUnitCodeSchema.parse(normalizeUnicodeIdentifier(value));
}

export const skuInputSchema = z.string().transform(normalizeSku);
export const categoryCodeInputSchema = z.string().transform(normalizeCategoryCode);
export const unitCodeInputSchema = z.string().transform(normalizeUnitCode);
