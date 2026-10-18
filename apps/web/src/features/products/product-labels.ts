import type {
  ProductCategory,
  ProductStatus,
  ProductUnit,
} from "@/lib/products/product.types";

export const categoryTranslationKeys = {
  BEVERAGES: "categories.beverages",
  FOOD: "categories.food",
  CLEANING: "categories.cleaning",
  PACKAGING: "categories.packaging",
  OFFICE_SUPPLIES: "categories.officeSupplies",
  PERSONAL_CARE: "categories.personalCare",
} as const satisfies Record<ProductCategory, string>;

export const statusTranslationKeys = {
  ACTIVE: "statuses.active",
  INACTIVE: "statuses.inactive",
} as const satisfies Record<ProductStatus, string>;

export const unitTranslationKeys = {
  PIECE: "units.piece",
  BOX: "units.box",
  BOTTLE: "units.bottle",
  PACK: "units.pack",
  KILOGRAM: "units.kilogram",
  LITER: "units.liter",
  PAIR: "units.pair",
} as const satisfies Record<ProductUnit, string>;

export function createProductDateFormatter(locale: string) {
  return new Intl.DateTimeFormat(
    locale === "ar" ? "ar-AE-u-nu-latn" : "en-GB-u-nu-latn",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone: "Asia/Dubai",
    },
  );
}

export function createProductNumberFormatter(locale: string) {
  return new Intl.NumberFormat(locale === "ar" ? "ar-AE-u-nu-latn" : "en-GB-u-nu-latn", {
    numberingSystem: "latn",
  });
}
