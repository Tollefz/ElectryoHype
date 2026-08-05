/**
 * Fulfillment adapters (order placement / tracking) — SEPARATE from catalog SupplierProvider.
 *
 * Catalog imports: lib/suppliers/provider.ts + registry.ts + cj/
 * Order fulfillment: *Supplier.ts files registered via lib/suppliers/index.ts
 *
 * Do not mix these. A future CJ fulfillment adapter may call cj/api.ts,
 * but catalog search/import must never go through these stubs.
 */
export {};
