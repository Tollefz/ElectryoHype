/**
 * Final Head of Merchandising report from live catalog after RC1 pass.
 * npx tsx -r dotenv/config scripts/_merch-hom-final-report.ts
 */
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { parseImages } from "../lib/merchandiser/full-catalog-pass";

const prisma = new PrismaClient();

function parseTags(raw: string): string[] {
  try {
    const j = JSON.parse(raw || "[]");
    if (Array.isArray(j)) return j.map(String);
  } catch {
    /* ignore */
  }
  return [];
}

function gradeOf(tags: string): "A" | "B" | "C" | "D" | "?" {
  const g = parseTags(tags).find((t) => /^merch:[ABCD]$/i.test(t));
  return g ? (g.split(":")[1]!.toUpperCase() as "A" | "B" | "C" | "D") : "?";
}

async function main() {
  const active = await prisma.product.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      category: true,
      subcategory: true,
      price: true,
      compareAtPrice: true,
      images: true,
      tags: true,
      qualityScore: true,
      shortDescription: true,
      metaTitle: true,
      buyerLifecycle: true,
      updatedAt: true,
    },
    orderBy: [{ qualityScore: "desc" }, { price: "asc" }],
  });

  const recentlyHidden = await prisma.product.findMany({
    where: {
      isActive: false,
      OR: [
        { tags: { contains: "merch:D" } },
        { buyerLifecycle: { in: ["declining", "discontinued"] } },
      ],
    },
    select: { id: true, name: true, category: true, tags: true, buyerLifecycle: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 400,
  });

  const grades = { A: 0, B: 0, C: 0, D: 0, "?": 0 };
  const byCat: Record<string, number> = {};
  const byGradeCat: Record<string, Record<string, number>> = {};

  for (const p of active) {
    const g = gradeOf(p.tags);
    grades[g] += 1;
    const c = p.category || "Ukjent";
    byCat[c] = (byCat[c] || 0) + 1;
    if (!byGradeCat[c]) byGradeCat[c] = { A: 0, B: 0, C: 0, D: 0 };
    if (g === "A" || g === "B" || g === "C" || g === "D") byGradeCat[c][g] += 1;
  }

  const A = active.filter((p) => gradeOf(p.tags) === "A");
  const B = active.filter((p) => gradeOf(p.tags) === "B");
  const C = active.filter((p) => gradeOf(p.tags) === "C");
  const AB = [...A, ...B].sort(
    (a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0) || a.price - b.price
  );

  const diversify = (list: typeof AB, n: number, avoid?: RegExp) => {
    const out: typeof AB = [];
    const usedBase = new Set<string>();
    for (const p of list) {
      if (avoid && avoid.test(p.name)) continue;
      const base = p.name.toLowerCase().replace(/\s+\d+$/, "").slice(0, 24);
      if (usedBase.has(base) && out.length >= n / 2) continue;
      usedBase.add(base);
      out.push(p);
      if (out.length >= n) break;
    }
    for (const p of list) {
      if (out.length >= n) break;
      if (!out.includes(p)) out.push(p);
    }
    return out.slice(0, n);
  };

  const topMarket = diversify(AB, 25);
  const topFront = diversify(AB, 25, /musematte/i);
  const topShop = diversify(
    AB.filter((p) => parseImages(p.images).length >= 3 && p.price >= 149),
    25
  );
  const topMeta = diversify(
    AB.filter((p) =>
      /gaming|mus|tastatur|headset|lader|powerbank|hub|øre|webkamera|dokking|høyttaler|mikrofon/i.test(
        p.name
      )
    ),
    25
  );

  const badShort = active.filter((p) => {
    const n = p.name.toLowerCase();
    const s = (p.shortDescription || "").toLowerCase();
    return (
      (/musematte/.test(n) && /musen\b|dpi/.test(s)) ||
      (/tastatur/.test(n) && /gjør musen/.test(s)) ||
      (/høyttaler/.test(n) && /chargers?/.test(s)) ||
      (/ruter|wifi/.test(n) && /iphone/.test(s))
    );
  });

  const numbered = active.filter((p) => /\b\d{3,5}\b/.test(p.name));

  const report = {
    generatedAt: new Date().toISOString(),
    active: active.length,
    inactiveTaggedD: recentlyHidden.filter((p) => gradeOf(p.tags) === "D").length,
    grades,
    byCat,
    byGradeCat,
    improvedNote:
      "Titler, beskrivelser, bilde-rekkefølge, SEO, kategori og merch-tags oppdatert i Hom RC1-pass",
    hiddenSample: recentlyHidden.slice(0, 40).map((p) => ({
      name: p.name,
      category: p.category,
      grade: gradeOf(p.tags),
      lifecycle: p.buyerLifecycle,
    })),
    best: A.slice(0, 30).map((p) => ({
      name: p.name,
      category: p.category,
      price: p.price,
      q: p.qualityScore,
    })),
    weakestKept: C.slice(0, 25).map((p) => ({
      name: p.name,
      category: p.category,
      price: p.price,
      q: p.qualityScore,
    })),
    strongCategories: Object.entries(byCat)
      .filter(([, n]) => n >= 40)
      .sort((a, b) => b[1] - a[1])
      .map(([c, n]) => ({ category: c, count: n })),
    thinCategories: Object.entries(byCat)
      .filter(([, n]) => n < 30)
      .sort((a, b) => a[1] - b[1])
      .map(([c, n]) => ({ category: c, count: n, need: "Flere sterke produkter" })),
    top25Market: topMarket.map((p) => `${p.name} — ${p.price} kr`),
    top25Frontpage: topFront.map((p) => `${p.name} — ${p.price} kr`),
    top25Shopping: topShop.map((p) => `${p.name} — ${p.price} kr`),
    top25Meta: topMeta.map((p) => `${p.name} — ${p.price} kr`),
    remainingIssues: {
      numberedTitles: numbered.length,
      numberedSample: numbered.slice(0, 15).map((p) => p.name),
      badShort: badShort.length,
      badShortSample: badShort.slice(0, 15).map((p) => ({
        name: p.name,
        short: p.shortDescription?.slice(0, 80),
      })),
    },
  };

  const out = path.join(process.cwd(), "tmp", "merch-hom-rc1-final.json");
  fs.writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
  console.log(
    JSON.stringify(
      {
        out,
        active: report.active,
        grades: report.grades,
        byCat: report.byCat,
        remainingIssues: report.remainingIssues,
        top5Market: report.top25Market.slice(0, 5),
        top5Front: report.top25Frontpage.slice(0, 5),
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
