export type SkuRecord = Readonly<{
  sku: string;
}>;

/**
 * Returns each duplicated SKU once, in the order its duplicate is encountered.
 * SKU comparison ignores surrounding whitespace and letter case. Returned
 * values use the same trimmed, uppercase canonical form used for comparison.
 */
export function findDuplicateSkus(products: readonly SkuRecord[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const product of products) {
    const normalizedSku = product.sku.trim().toUpperCase();

    if (seen.has(normalizedSku)) {
      duplicates.add(normalizedSku);
    } else {
      seen.add(normalizedSku);
    }
  }

  return [...duplicates];
}
