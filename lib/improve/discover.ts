/**
 * Discover daily improvements + retirement proposals from scored catalog.
 */

import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeProductQuality } from "@/lib/improve/quality";
import { getOrCreateStoreObjectives } from "@/lib/improve/objectives";
import type { ImproveRunStats } from "@/lib/improve/types";

function parseImages(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return p.map(String).filter(Boolean);
    } catch {
      return raw ? [raw] : [];
    }
  }
  return [];
}

function specCount(specs: unknown): number {
  if (!specs) return 0;
  if (Array.isArray(specs)) return specs.length;
  if (typeof specs === "object") return Object.keys(specs as object).length;
  return 0;
}

export async function scoreAllProducts(opts?: {
  storeId?: string | null;
  limit?: number;
}) {
  const products = await prisma.product.findMany({
    where: opts?.storeId ? { storeId: opts.storeId } : undefined,
    take: opts?.limit || 2000,
    select: {
      id: true,
      name: true,
      images: true,
      metaTitle: true,
      metaDescription: true,
      description: true,
      shortDescription: true,
      specs: true,
      supplierSpecs: true,
      category: true,
      price: true,
      supplierPrice: true,
      supplierStatus: true,
      stock: true,
      supplierInventory: true,
      aiCategoryConfidence: true,
      isActive: true,
      tags: true,
    },
  });

  let sum = 0;
  for (const p of products) {
    const breakdown = computeProductQuality(p);
    sum += breakdown.total;
    await prisma.product.update({
      where: { id: p.id },
      data: {
        qualityScore: breakdown.total,
        qualityBreakdown: breakdown as unknown as Prisma.InputJsonValue,
        qualityScoredAt: new Date(),
      },
    });
  }

  return {
    productsScored: products.length,
    avgQuality: products.length ? Math.round((sum / products.length) * 10) / 10 : null,
    products,
  };
}

/** Create pending improvement / retirement proposals (idempotent soft — skips open dupes). */
export async function discoverImprovements(opts?: {
  storeId?: string | null;
  runId?: string | null;
  maxProposals?: number;
}): Promise<ImproveRunStats> {
  const objectives = await getOrCreateStoreObjectives(opts?.storeId);
  const maxProposals = opts?.maxProposals || 40;
  const scored = await scoreAllProducts({ storeId: opts?.storeId });

  let improvementsCreated = 0;
  let retirementProposed = 0;

  const openKeys = new Set(
    (
      await prisma.storeImprovement.findMany({
        where: { status: "pending" },
        select: { productId: true, kind: true },
        take: 500,
      })
    ).map((r) => `${r.productId}:${r.kind}`)
  );

  async function propose(input: {
    productId: string;
    kind: string;
    title: string;
    detail: string;
    why: string[];
    risks?: string[];
    confidence: number;
    before: Record<string, unknown>;
    proposed: Record<string, unknown>;
  }) {
    if (improvementsCreated + retirementProposed >= maxProposals) return;
    const key = `${input.productId}:${input.kind}`;
    if (openKeys.has(key)) return;
    openKeys.add(key);

    await prisma.storeImprovement.create({
      data: {
        storeId: opts?.storeId || null,
        runId: opts?.runId || null,
        productId: input.productId,
        kind: input.kind,
        title: input.title,
        detail: input.detail,
        why: input.why,
        risks: input.risks || [],
        confidence: input.confidence,
        before: input.before as Prisma.InputJsonValue,
        proposed: input.proposed as Prisma.InputJsonValue,
        status: "pending",
      },
    });

    if (input.kind.startsWith("retire_") || input.kind === "switch_supplier") {
      retirementProposed += 1;
    } else {
      improvementsCreated += 1;
    }
  }

  for (const p of scored.products) {
    if (improvementsCreated + retirementProposed >= maxProposals) break;
    const q = computeProductQuality(p);
    const imgs = parseImages(p.images);
    const name = p.name || "Produkt";

    if (objectives.targets.increaseSeo > 0.05 && q.seo < 70) {
      await propose({
        productId: p.id,
        kind: "seo",
        title: `Forbedre SEO: ${name.slice(0, 50)}`,
        detail: "Mangler eller svak meta-tittel/beskrivelse.",
        why: [
          `SEO-score ${q.seo}/100`,
          !p.metaTitle ? "Mangler metaTitle" : "metaTitle for kort/svak",
          !p.metaDescription ? "Mangler metaDescription" : "metaDescription for kort",
        ],
        confidence: 88,
        before: {
          metaTitle: p.metaTitle,
          metaDescription: p.metaDescription,
          seoScore: q.seo,
        },
        proposed: {
          metaTitle: `${name.slice(0, 55)} | ElectroHypeX`,
          metaDescription: `Kjøp ${name.slice(0, 80)} hos ElectroHypeX. Rask levering og god support.`,
        },
      });
    }

    if (objectives.targets.increaseQuality > 0.05 && q.description < 55) {
      await propose({
        productId: p.id,
        kind: "description",
        title: `Bedre beskrivelse: ${name.slice(0, 50)}`,
        detail: "Produkttekst er for kort eller mangler.",
        why: [`Beskrivelses-score ${q.description}/100`],
        confidence: 82,
        before: {
          description: (p.description || "").slice(0, 200),
          descriptionScore: q.description,
        },
        proposed: {
          shortDescription: `Profesjonell ${name} tilpasset norsk marked.`,
          note: "Godkjenn for å la AI/import-pipeline skrive full norsk tekst ved neste enrich.",
        },
      });
    }

    if (objectives.targets.increaseQuality > 0.05 && imgs.length < 3) {
      await propose({
        productId: p.id,
        kind: "images",
        title: `Flere bilder: ${name.slice(0, 50)}`,
        detail: `Kun ${imgs.length} bilde(r). Anbefalt minst 3.`,
        why: [`Bilde-score ${q.images}/100`, `${imgs.length} bilder`],
        risks: ["Krever leverandør-resync eller manuell bildeopplasting"],
        confidence: 75,
        before: { imageCount: imgs.length, imagesScore: q.images },
        proposed: { minImages: 3, action: "request_supplier_resync" },
      });
    }

    if (
      objectives.targets.reduceMissingSpecs > 0.05 &&
      specCount(p.specs) + specCount(p.supplierSpecs) < 2
    ) {
      await propose({
        productId: p.id,
        kind: "specs",
        title: `Spesifikasjoner: ${name.slice(0, 50)}`,
        detail: "Manglende spesifikasjoner svekker katalogkvalitet.",
        why: [`Specs-score ${q.specs}/100`],
        confidence: 80,
        before: { specsScore: q.specs },
        proposed: { action: "pull_supplier_specs" },
      });
    }

    if (
      objectives.targets.increaseMargin > 0.05 &&
      q.margin < 50 &&
      p.supplierPrice &&
      p.supplierPrice > 0
    ) {
      const target = Math.round(p.supplierPrice / 0.65);
      if (target > p.price) {
        await propose({
          productId: p.id,
          kind: "price",
          title: `Prisjustering: ${name.slice(0, 50)}`,
          detail: `Foreslått pris ${target} NOK for ~35% margin.`,
          why: [
            `Margin-score ${q.margin}/100`,
            `Nåværende ${p.price} / inn ${p.supplierPrice}`,
          ],
          risks: ["Kan påvirke konvertering"],
          confidence: 78,
          before: { price: p.price, supplierPrice: p.supplierPrice, marginScore: q.margin },
          proposed: { price: target },
        });
      }
    }

    if (
      (!p.category || p.category === "Ukategorisert") &&
      objectives.targets.increaseCatalogQuality > 0.05
    ) {
      await propose({
        productId: p.id,
        kind: "category",
        title: `Kategori: ${name.slice(0, 50)}`,
        detail: "Mangler butikkategori.",
        why: [`Kategori-score ${q.category}/100`],
        confidence: p.aiCategoryConfidence ?? 70,
        before: { category: p.category },
        proposed: {
          category: "Data & IT",
          note: "Placeholder — bekreft eller endre ved godkjenning",
        },
      });
    }

    // Retirement
    if (
      objectives.targets.reduceLowQuality > 0.05 &&
      p.isActive &&
      q.total < 35
    ) {
      await propose({
        productId: p.id,
        kind: "retire_unpublish",
        title: `Avpubliser lav kvalitet: ${name.slice(0, 50)}`,
        detail: `Total kvalitet ${q.total}/100.`,
        why: [
          `Lav totalskår ${q.total}`,
          `Bilder ${q.images}, SEO ${q.seo}, Specs ${q.specs}`,
        ],
        risks: ["Produkt fjernes midlertidig fra storefront"],
        confidence: 85,
        before: { isActive: true, qualityScore: q.total },
        proposed: { isActive: false },
      });
    }

    if (
      objectives.targets.reduceOutOfStock > 0.05 &&
      p.isActive &&
      (p.supplierStatus === "unavailable" ||
        p.supplierStatus === "out_of_stock")
    ) {
      await propose({
        productId: p.id,
        kind: "retire_archive",
        title: `Arkiver utsolgt/utilgjengelig: ${name.slice(0, 50)}`,
        detail: `Leverandørstatus: ${p.supplierStatus}`,
        why: [`supplierStatus=${p.supplierStatus}`, `Lager-score ${q.stock}`],
        confidence: 90,
        before: { isActive: true, supplierStatus: p.supplierStatus },
        proposed: { isActive: false, buyerLifecycle: "discontinued" },
      });
    }

    if (q.total < 45 && p.isActive && objectives.targets.reduceLowQuality > 0.05) {
      await propose({
        productId: p.id,
        kind: "retire_replace",
        title: `Erstatt produkt: ${name.slice(0, 50)}`,
        detail: "Lav kvalitet — Digital Buyer bør finne erstatning.",
        why: [`Kvalitet ${q.total}/100`],
        confidence: 72,
        before: { qualityScore: q.total },
        proposed: { action: "seek_replacement", buyerLifecycle: "replace_candidate" },
      });
    }
  }

  const pendingApprovals = await prisma.storeImprovement.count({
    where: { status: "pending" },
  });

  return {
    productsScored: scored.productsScored,
    improvementsCreated,
    retirementProposed,
    avgQualityBefore: scored.avgQuality,
    avgQualityAfter: scored.avgQuality,
    pendingApprovals,
  };
}
