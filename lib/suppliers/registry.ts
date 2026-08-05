/**
 * Catalog Supplier Engine — registry and provider factories.
 * App code outside a supplier plugin must only use this registry + SupplierProvider.
 */

import "server-only";

import type { CatalogSupplierId, SupplierProvider } from "@/lib/suppliers/provider";
import { createCjCatalogProvider } from "@/lib/suppliers/cj/provider";
import { createCsvCatalogProvider } from "@/lib/suppliers/csv/provider";

export type CatalogSupplierStatus = "active" | "coming" | "legacy";

export type CatalogSupplierMeta = {
  id: CatalogSupplierId;
  displayName: string;
  status: CatalogSupplierStatus;
  /** Relative admin path when status is active */
  href: string;
  description: string;
};

/** Planned catalog suppliers — only `active` ones have a factory. */
export const CATALOG_SUPPLIERS: CatalogSupplierMeta[] = [
  {
    id: "cj",
    displayName: "CJdropshipping",
    status: "active",
    href: "/admin/suppliers/cj",
    description: "Søk, importer og synkroniser produkter via offisiell API.",
  },
  {
    id: "csv",
    displayName: "CSV / egen API",
    status: "active",
    href: "/admin/suppliers/csv",
    description: "Importer fra egen katalogfil (referanseleverandør).",
  },
  {
    id: "aliexpress",
    displayName: "AliExpress",
    status: "coming",
    href: "/admin/suppliers/aliexpress",
    description: "Planlagt — ikke aktivert ennå.",
  },
  {
    id: "alibaba",
    displayName: "Alibaba",
    status: "coming",
    href: "/admin/suppliers/alibaba",
    description: "Planlagt — ikke aktivert ennå.",
  },
  {
    id: "onesixeight",
    displayName: "1688",
    status: "coming",
    href: "/admin/suppliers/onesixeight",
    description: "Planlagt — ikke aktivert ennå.",
  },
  {
    id: "banggood",
    displayName: "Banggood",
    status: "coming",
    href: "/admin/suppliers/banggood",
    description: "Planlagt — ikke aktivert ennå.",
  },
  {
    id: "temu",
    displayName: "Temu (legacy)",
    status: "legacy",
    href: "/admin/products/temu-import",
    description: "Gammel URL-import — kun for vedlikehold av eksisterende produkter.",
  },
];

const factories: Partial<Record<CatalogSupplierId, () => SupplierProvider>> = {
  cj: () => createCjCatalogProvider(),
  csv: () => createCsvCatalogProvider(),
};

export function listCatalogSuppliers(opts?: {
  includeComing?: boolean;
  includeLegacy?: boolean;
}): CatalogSupplierMeta[] {
  return CATALOG_SUPPLIERS.filter((s) => {
    if (s.status === "active") return true;
    if (s.status === "coming") return opts?.includeComing !== false;
    if (s.status === "legacy") return Boolean(opts?.includeLegacy);
    return false;
  });
}

export function listActiveCatalogSupplierIds(): CatalogSupplierId[] {
  return CATALOG_SUPPLIERS.filter((s) => s.status === "active").map((s) => s.id);
}

export function isActiveCatalogSupplier(id: string): id is CatalogSupplierId {
  return CATALOG_SUPPLIERS.some((s) => s.id === id && s.status === "active");
}

export function getCatalogSupplierMeta(id: string): CatalogSupplierMeta | null {
  return CATALOG_SUPPLIERS.find((s) => s.id === id) ?? null;
}

export function getCatalogProvider(id: CatalogSupplierId): SupplierProvider {
  const factory = factories[id];
  if (!factory) {
    throw new Error(`Catalog supplier not registered: ${id}`);
  }
  return factory();
}

export async function getConfiguredCatalogProviders(): Promise<SupplierProvider[]> {
  const providers: SupplierProvider[] = [];
  for (const meta of CATALOG_SUPPLIERS.filter((s) => s.status === "active")) {
    const provider = getCatalogProvider(meta.id);
    if (await provider.isConfigured()) {
      providers.push(provider);
    }
  }
  return providers;
}
