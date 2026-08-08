import { prisma } from "@/lib/prisma";
import { isStoreDnaBlocked } from "@/lib/buyer/store-dna-policy";

/**
 * Soft-remove live products that violate absolute Store DNA.
 * Safe to run repeatedly (idempotent for already inactive rows).
 */
export async function unpublishStoreDnaViolations(options?: {
  limit?: number;
  dryRun?: boolean;
}): Promise<{ scanned: number; unpublished: number; sample: string[] }> {
  const limit = Math.min(Math.max(options?.limit ?? 400, 1), 2000);
  const dryRun = Boolean(options?.dryRun);

  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      category: true,
      tags: true,
      shortDescription: true,
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  const violators = products.filter((p) =>
    isStoreDnaBlocked(
      [p.name, p.category, p.tags, p.shortDescription].filter(Boolean).join(" ")
    )
  );

  if (!dryRun && violators.length > 0) {
    await prisma.product.updateMany({
      where: { id: { in: violators.map((v) => v.id) } },
      data: { isActive: false },
    });
  }

  return {
    scanned: products.length,
    unpublished: violators.length,
    sample: violators.slice(0, 8).map((v) => v.name),
  };
}
