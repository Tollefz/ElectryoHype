/**
 * SupplierAccount layer — multi-account connections per supplier type.
 */

import "server-only";

import {
  SupplierName,
  SyncFieldPolicy,
  type Prisma,
  type SupplierAccount,
  type SyncPolicy,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { CatalogSupplierId } from "@/lib/suppliers/provider";

export type SupplierAccountWithPolicy = SupplierAccount & { syncPolicy: SyncPolicy | null };

const DEFAULT_POLICY: Omit<
  Prisma.SyncPolicyCreateWithoutSupplierAccountInput,
  never
> = {
  stock: SyncFieldPolicy.auto,
  supplierPrice: SyncFieldPolicy.auto,
  retailPrice: SyncFieldPolicy.manual,
  seo: SyncFieldPolicy.never,
  ai: SyncFieldPolicy.regenerate_if_changed,
  images: SyncFieldPolicy.auto_if_new,
  videos: SyncFieldPolicy.auto,
  specs: SyncFieldPolicy.auto,
  attributes: SyncFieldPolicy.auto,
  variants: SyncFieldPolicy.manual,
};

export function catalogIdToSupplierName(id: CatalogSupplierId): SupplierName {
  const map: Record<CatalogSupplierId, SupplierName> = {
    cj: SupplierName.cj,
    temu: SupplierName.temu,
    alibaba: SupplierName.alibaba,
    aliexpress: SupplierName.aliexpress,
    banggood: SupplierName.banggood,
    onesixeight: SupplierName.onesixeight,
    csv: SupplierName.csv,
  };
  return map[id];
}

export function credentialsRefFor(type: SupplierName): string | null {
  switch (type) {
    case SupplierName.cj:
      return "CJ_API_KEY";
    case SupplierName.csv:
      return "CSV_CATALOG_PATH";
    default:
      return null;
  }
}

/** Ensure a default account + SyncPolicy exists for a supplier type. */
export async function ensureDefaultSupplierAccount(
  type: CatalogSupplierId | SupplierName,
  accountName = "default"
): Promise<SupplierAccountWithPolicy> {
  const supplierType = (Object.values(SupplierName) as string[]).includes(String(type))
    ? (type as SupplierName)
    : catalogIdToSupplierName(type as CatalogSupplierId);

  const existing = await prisma.supplierAccount.findUnique({
    where: {
      supplierType_accountName: { supplierType, accountName },
    },
    include: { syncPolicy: true },
  });
  if (existing) {
    if (!existing.syncPolicy) {
      await prisma.syncPolicy.create({
        data: { supplierAccountId: existing.id, ...DEFAULT_POLICY },
      });
      return prisma.supplierAccount.findUniqueOrThrow({
        where: { id: existing.id },
        include: { syncPolicy: true },
      });
    }
    return existing;
  }

  return prisma.supplierAccount.create({
    data: {
      supplierType,
      accountName,
      apiCredentialsReference: credentialsRefFor(supplierType),
      enabled: true,
      defaultCurrency: supplierType === SupplierName.cj ? "USD" : "USD",
      syncSettings: {
        intervalHours: 6,
        batchSize: 200,
      },
      syncPolicy: { create: { ...DEFAULT_POLICY } },
    },
    include: { syncPolicy: true },
  });
}

export async function getSupplierAccount(
  id: string
): Promise<SupplierAccountWithPolicy | null> {
  return prisma.supplierAccount.findUnique({
    where: { id },
    include: { syncPolicy: true },
  });
}

export async function listEnabledSupplierAccounts(
  supplierType?: SupplierName
): Promise<SupplierAccountWithPolicy[]> {
  return prisma.supplierAccount.findMany({
    where: {
      enabled: true,
      ...(supplierType ? { supplierType } : {}),
    },
    include: { syncPolicy: true },
    orderBy: [{ supplierType: "asc" }, { accountName: "asc" }],
  });
}

export async function updateSyncPolicy(
  supplierAccountId: string,
  patch: Partial<{
    stock: SyncFieldPolicy;
    supplierPrice: SyncFieldPolicy;
    retailPrice: SyncFieldPolicy;
    seo: SyncFieldPolicy;
    ai: SyncFieldPolicy;
    images: SyncFieldPolicy;
    videos: SyncFieldPolicy;
    specs: SyncFieldPolicy;
    attributes: SyncFieldPolicy;
    variants: SyncFieldPolicy;
  }>
) {
  return prisma.syncPolicy.upsert({
    where: { supplierAccountId },
    create: { supplierAccountId, ...DEFAULT_POLICY, ...patch },
    update: patch,
  });
}
