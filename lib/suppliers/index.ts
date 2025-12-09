import { Supplier, SupplierAdapter } from "./types";
import { getDropshippingConfig } from "@/config/dropshipping";
import { getAliExpressAdapter } from "./aliexpressSupplier";
import { getCjAdapter } from "./cjSupplier";
import { getTemuAdapter } from "./temuSupplier";

const registry: Record<Supplier, () => Promise<SupplierAdapter>> = {
  alibaba: async () => getAliExpressAdapter(), // placeholder
  aliexpress: async () => getAliExpressAdapter(),
  ebay: async () => getAliExpressAdapter(), // placeholder reuse
  temu: async () => getTemuAdapter(),
  cj: async () => getCjAdapter(),
};

export async function getSupplierAdapter(): Promise<SupplierAdapter> {
  const cfg = getDropshippingConfig();
  if (!cfg.supplierName) {
    throw new Error("Supplier not configured");
  }
  const factory = registry[cfg.supplierName];
  if (!factory) {
    throw new Error(`Unsupported supplier: ${cfg.supplierName}`);
  }
  return factory();
}

