/**
 * Tighten merch grades for Marketing Brain — fewer true flagships.
 * npx tsx -r dotenv/config scripts/_merch-regrade-tight.ts
 */
import { PrismaClient } from "@prisma/client";
import { parseImages } from "../lib/merchandiser/full-catalog-pass";

const prisma = new PrismaClient();

function parseTags(raw: string): string[] {
  try {
    const j = JSON.parse(raw || "[]");
    if (Array.isArray(j)) return j.map(String);
  } catch {
    return [];
  }
  return [];
}

function setGrade(tags: string[], g: string) {
  return JSON.stringify([...new Set([...tags.filter((t) => !/^merch:[ABCD]$/i.test(t)), `merch:${g}`])]);
}

async function main() {
  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      category: true,
      price: true,
      images: true,
      tags: true,
      qualityScore: true,
    },
  });

  // Diversify A: max 2 per base name family
  const byBase = new Map<string, typeof products>();
  for (const p of products) {
    const b = p.name.toLowerCase().replace(/\s+/g, " ").trim();
    if (!byBase.has(b)) byBase.set(b, []);
    byBase.get(b)!.push(p);
  }

  const counts = { A: 0, B: 0, C: 0 };
  const aIds = new Set<string>();
  const bIds = new Set<string>();

  const ranked = [...products].sort(
    (a, b) =>
      (b.qualityScore ?? 0) - (a.qualityScore ?? 0) ||
      parseImages(b.images).length - parseImages(a.images).length
  );

  const familyA = new Map<string, number>();

  for (const p of ranked) {
    const imgs = parseImages(p.images).length;
    const q = p.qualityScore ?? 50;
    const base = p.name.toLowerCase().replace(/\s+/g, " ").trim();
    const core = ["Gaming", "Mobil & Tilbehør", "Data & IT", "TV, Lyd & Bilde"].includes(
      p.category || ""
    );
    let grade: "A" | "B" | "C" = "C";

    const canA =
      q >= 90 &&
      imgs >= 5 &&
      core &&
      p.price >= 199 &&
      p.price <= 1499 &&
      !/musematte/i.test(p.name) &&
      (familyA.get(base) || 0) < 1 &&
      aIds.size < 40;

    const canB =
      !canA &&
      q >= 80 &&
      imgs >= 3 &&
      p.price >= 129 &&
      p.price <= 1999 &&
      bIds.size < 120;

    if (canA) {
      grade = "A";
      aIds.add(p.id);
      familyA.set(base, (familyA.get(base) || 0) + 1);
    } else if (canB) {
      grade = "B";
      bIds.add(p.id);
    } else {
      grade = "C";
    }

    counts[grade] += 1;
    await prisma.product.update({
      where: { id: p.id },
      data: {
        tags: setGrade(parseTags(p.tags), grade),
        qualityScore:
          grade === "A"
            ? Math.max(p.qualityScore ?? 0, 93)
            : grade === "B"
              ? Math.min(Math.max(p.qualityScore ?? 0, 80), 89)
              : Math.min(p.qualityScore ?? 60, 72),
      },
    });
  }

  console.log(
    JSON.stringify(
      { total: products.length, counts, flagships: aIds.size, strong: bIds.size },
      null,
      2
    )
  );
}

main().finally(() => prisma.$disconnect());
