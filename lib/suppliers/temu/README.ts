/**
 * Temu catalog provider — NOT implemented.
 * Temu remains legacy URL-import only (lib/scrapers, products/temu-import).
 * Do not force Temu into SupplierProvider until an official catalog API exists.
 * Existing Temu products in DB stay readable/repairable via scrapers + pricing audit.
 */
export const TEMU_CATALOG_STATUS = "legacy-url-import" as const;
