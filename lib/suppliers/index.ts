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

export async function getSupplierAdapter(supplier?: Supplier): Promise<SupplierAdapter> {
  // Use provided supplier, or fall back to config
  const supplierName = supplier ?? getDropshippingConfig().supplierName;
  
  if (!supplierName) {
    throw new Error("Supplier not configured");
  }
  
  const factory = registry[supplierName];
  if (!factory) {
    throw new Error(`Unsupported supplier: ${supplierName}`);
  }
  return factory();
}

