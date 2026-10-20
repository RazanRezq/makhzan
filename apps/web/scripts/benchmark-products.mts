import { cpus, platform, release } from "node:os";
import { findDuplicateSkus } from "../src/lib/products/find-duplicate-skus.ts";
import type { Product } from "../src/lib/products/product.types.ts";

type Measurement = {
  medianMilliseconds: number;
  p95Milliseconds: number;
};

const sizes = [100, 1_000, 10_000] as const;

function createProducts(count: number): Product[] {
  const uniqueSkuCount = Math.ceil(count * 0.95);

  return Array.from({ length: count }, (_, index) => ({
    id: `product-${index.toString().padStart(5, "0")}`,
    sku: `SKU-${(index % uniqueSkuCount).toString().padStart(5, "0")}`,
    name: `Synthetic Product ${index.toString().padStart(5, "0")}`,
    category: index % 2 === 0 ? "FOOD" : "BEVERAGES",
    unit: index % 3 === 0 ? "PIECE" : "BOX",
    status: index % 5 === 0 ? "INACTIVE" : "ACTIVE",
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
  }));
}

function measure(operation: () => unknown, samples: number): Measurement {
  for (let index = 0; index < 20; index += 1) operation();

  const timings = Array.from({ length: samples }, () => {
    const start = performance.now();
    operation();
    return performance.now() - start;
  }).sort((left, right) => left - right);

  const median = timings[Math.floor(timings.length / 2)] ?? 0;
  const p95 = timings[Math.ceil(timings.length * 0.95) - 1] ?? median;
  return {
    medianMilliseconds: Number(median.toFixed(3)),
    p95Milliseconds: Number(p95.toFixed(3)),
  };
}

function format(measurement: Measurement) {
  return `${measurement.medianMilliseconds.toFixed(3)} ms median / ${measurement.p95Milliseconds.toFixed(3)} ms p95`;
}

process.stdout.write(
  [
    `Runtime: Node ${process.version}; ${platform()} ${release()}; ${cpus()[0]?.model ?? "unknown CPU"}`,
    "Warm-up: 20 runs per operation; measurements use deterministic in-memory data.",
    "",
    "size\tsearch+filter\tsort\tpagination\tselection\tduplicate detection",
  ].join("\n"),
);

for (const size of sizes) {
  const products = createProducts(size);
  const samples = size === 10_000 ? 30 : size === 1_000 ? 75 : 150;
  const selectedIds = new Set(products.filter((_, index) => index % 10 === 0).map(({ id }) => id));
  const search = "product 000";

  const operations = {
    searchAndFilter: measure(
      () =>
        products.filter(
          (product) =>
            product.status === "ACTIVE" &&
            product.category === "FOOD" &&
            (product.name.toLowerCase().includes(search) ||
              product.sku.toLowerCase().includes(search)),
        ),
      samples,
    ),
    sort: measure(
      () =>
        [...products].sort(
          (left, right) =>
            left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
        ),
      samples,
    ),
    pagination: measure(() => products.slice(50, 100), samples),
    selection: measure(
      () => products.filter((product) => selectedIds.has(product.id)),
      samples,
    ),
    duplicates: measure(() => findDuplicateSkus(products), samples),
  };

  process.stdout.write(
    `\n${size}\t${format(operations.searchAndFilter)}\t${format(operations.sort)}\t${format(operations.pagination)}\t${format(operations.selection)}\t${format(operations.duplicates)}`,
  );
}

process.stdout.write("\n");
