/**
 * Autonomy task discovery — proactive ops queue.
 */

import "server-only";

import { prisma } from "@/lib/prisma";

export type DiscoveredTask = {
  kind: string;
  title: string;
  detail: string;
  count: number;
  href: string;
  severity: "critical" | "high" | "medium" | "low";
  confidence: number;
  why: string[];
};

export async function discoverAutonomyTasks(
  storeId?: string | null
): Promise<DiscoveredTask[]> {
  const productWhere = storeId ? { storeId } : {};

  const [
    weakSeo,
    missingImages,
    importReview,
    approvedReady,
    stockChanges,
    priceChanges,
    merchSuggested,
    failedImports,
  ] = await Promise.all([
    prisma.product.count({
      where: {
        ...productWhere,
        isActive: true,
        OR: [{ metaTitle: null }, { metaDescription: null }, { metaTitle: "" }],
      },
    }),
    prisma.product.count({
      where: {
        ...productWhere,
        isActive: true,
        OR: [{ images: "" }, { images: "[]" }],
      },
    }),
    prisma.importQueueItem.count({ where: { status: "review" } }),
    prisma.importQueueItem.count({ where: { status: "approved" } }),
    prisma.supplierChangeEvent.count({
      where: { applied: false, dismissed: false, changeType: "stock" },
    }),
    prisma.supplierChangeEvent.count({
      where: { applied: false, dismissed: false, changeType: "price" },
    }),
    prisma.merchandiserRecommendation.count({
      where: { status: { in: ["suggested", "accepted"] } },
    }),
    prisma.importQueueItem.count({ where: { status: "failed" } }),
  ]);

  const tasks: DiscoveredTask[] = [];

  if (approvedReady > 0) {
    tasks.push({
      kind: "ready_to_publish",
      title: "Klare for publisering",
      detail: "Godkjente importkø-elementer venter på din beslutning",
      count: approvedReady,
      href: "/admin/suppliers/import-queue?status=approved",
      severity: "high",
      confidence: 98,
      why: [
        "Pipeline + Quality Gate er ferdig",
        "Aldri auto-publisert — krever eiergodkjenning",
      ],
    });
  }

  if (importReview > 0) {
    tasks.push({
      kind: "needs_review",
      title: "Trenger review",
      detail: "Importer under terskel for auto-godkjenning",
      count: importReview,
      href: "/admin/suppliers/import-queue?status=review",
      severity: "high",
      confidence: 95,
      why: ["Completeness eller QC krever manuell vurdering"],
    });
  }

  if (stockChanges > 0) {
    tasks.push({
      kind: "stock_changed",
      title: "Lager endret hos leverandør",
      detail: "Uleste lager-endringer",
      count: stockChanges,
      href: "/admin/suppliers/health",
      severity: "high",
      confidence: 92,
      why: ["Supplier sync detekterte stock-endring"],
    });
  }

  if (priceChanges > 0) {
    tasks.push({
      kind: "price_changed",
      title: "Leverandørpris endret",
      detail: "Prisendringer venter på vurdering",
      count: priceChanges,
      href: "/admin/suppliers/health",
      severity: "high",
      confidence: 93,
      why: ["Supplier sync detekterte price-endring", "Retailpris endres ikke automatisk"],
    });
  }

  if (weakSeo > 0) {
    tasks.push({
      kind: "weak_seo",
      title: "Svak SEO",
      detail: "Aktive produkter mangler meta-tittel/beskrivelse",
      count: weakSeo,
      href: "/admin/products?filter=no_seo",
      severity: weakSeo > 20 ? "high" : "medium",
      confidence: 90,
      why: ["Tom metaTitle eller metaDescription"],
    });
  }

  if (missingImages > 0) {
    tasks.push({
      kind: "bad_images",
      title: "Mangler bilder",
      detail: "Aktive produkter uten bilder",
      count: missingImages,
      href: "/admin/products?filter=missing_images",
      severity: "high",
      confidence: 97,
      why: ["Tomt image-felt"],
    });
  }

  if (merchSuggested > 0) {
    tasks.push({
      kind: "merchandiser_pending",
      title: "AI Merchandiser-forslag",
      detail: "Scorede kandidater venter",
      count: merchSuggested,
      href: "/admin/suppliers/merchandiser",
      severity: "medium",
      confidence: 88,
      why: ["Anbefalinger ikke behandlet"],
    });
  }

  if (failedImports > 0) {
    tasks.push({
      kind: "import_failed",
      title: "Import feilet",
      detail: "Køelementer i failed-status",
      count: failedImports,
      href: "/admin/suppliers/import-queue?status=failed",
      severity: "critical",
      confidence: 99,
      why: ["Pipeline feilet — krever feilsøking"],
    });
  }

  return tasks;
}

export async function syncAutonomyTasks(
  tasks: DiscoveredTask[],
  storeId?: string | null
): Promise<number> {
  let opened = 0;
  for (const t of tasks) {
    const existing = await prisma.autonomyTask.findFirst({
      where: {
        kind: t.kind,
        status: "open",
        ...(storeId ? { storeId } : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    if (existing) {
      await prisma.autonomyTask.update({
        where: { id: existing.id },
        data: {
          title: t.title,
          detail: t.detail,
          count: t.count,
          href: t.href,
          severity: t.severity,
          confidence: t.confidence,
          why: t.why,
        },
      });
    } else {
      await prisma.autonomyTask.create({
        data: {
          storeId: storeId || null,
          kind: t.kind,
          title: t.title,
          detail: t.detail,
          count: t.count,
          href: t.href,
          severity: t.severity,
          confidence: t.confidence,
          why: t.why,
          status: "open",
        },
      });
      opened += 1;
    }
  }
  return opened;
}

export async function listOpenAutonomyTasks(storeId?: string | null) {
  return prisma.autonomyTask.findMany({
    where: {
      status: "open",
      ...(storeId ? { storeId } : {}),
    },
    orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
    take: 50,
  });
}
