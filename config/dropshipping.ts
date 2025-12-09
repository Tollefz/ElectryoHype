import { Supplier } from "@/lib/suppliers/types";

export type DropshippingMode = "email" | "api";

export interface DropshippingConfig {
  mode: DropshippingMode;
  supplierName: Supplier | null;
  supplierOrderEmail?: string;
  apiBaseUrl?: string;
  apiKey?: string;
  sendAnywayOnHighRisk?: boolean;
}

export function getDropshippingConfig(): DropshippingConfig {
  const modeEnv = process.env.DROPSHIPPING_MODE?.toLowerCase() as DropshippingMode | undefined;
  const supplierName = process.env.DROPSHIPPING_SUPPLIER?.toLowerCase() as Supplier | undefined;

  return {
    mode: modeEnv === "api" ? "api" : "email",
    supplierName: supplierName ?? null,
    supplierOrderEmail: process.env.DROPSHIPPING_SUPPLIER_EMAIL,
    apiBaseUrl: process.env.DROPSHIPPING_API_BASE_URL,
    apiKey: process.env.DROPSHIPPING_API_KEY,
    sendAnywayOnHighRisk: process.env.SEND_ANYWAY_ON_HIGH_RISK === "true",
  };
}

