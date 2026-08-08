/**
 * Merchandising Auditor — inactive products after Merch RC1 (read-only).
 * npx tsx -r dotenv/config scripts/_merch-auditor-hidden.ts
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
    return raw ? [raw] : [];
  }
  return [];
}

function gradeOf(tags: string[]): "A" | "B" | "C" | "D" | "?" {
  const g = tags.find((t) => /^merch:[ABCD]$/i.test(t));
  return g ? (g.split(":")[1]!.toUpperCase() as "A" | "B" | "C" | "D") : "?";
}

function baseName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/\s+\d{3,5}\b/g, "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/[^a-z0-9\s+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferReason(p: {
  name: string;
  category: string | null;
  subcategory: string | null;
  shortDescription: string | null;
  tags: string[];
  buyerLifecycle: string | null;
}): string {
  const hay = `${p.name} ${p.shortDescription || ""} ${p.category || ""} ${p.subcategory || ""}`;
  if (/opening\s*repair|screwdriver|repair\s*tools?\s*kit/i.test(hay))
    return "Verktøysett / reparasjonskit — utenfor butikkidentitet";
  if (/green\s*skin|pro11\s*flat|rechargeable\s*removable|10\.2\s*inch/i.test(hay))
    return "Uklar gadget / lav tillit";
  if (/mushroom|pair\s*box|tws\s*pair|multifunctional|five-in-one|clip-on|infrared|sensing|magic|maiduo|phablet|stretch\s*gamepad|binaural|splitter\s*one/i.test(hay))
    return "Engelsk leverandørtittel / AliExpress-språk";
  if (
    (
      hay.match(
        /\b(with|and|for|small|pair|box|night|audio|suitable|compatible|portable|adjustable|universal|removable|rechargeable|emitting|indicator|electronic|sports|streaming|docking)\b/gi
      ) || []
    ).length >= 3
  ) {
    return "Engelsk leverandørtittel / AliExpress-språk";
  }
  if (/kids|children|piano|midi|jump\s*start|pet\s|cat\s*toy|dog\s/i.test(hay))
    return "Store DNA / off-assortment";
  if (/\b\d{3,5}\b/.test(p.name) || /\(\s*\d+\s*g\s*\)/i.test(p.name))
    return "Nær-duplikat i produktfamilie (Merch RC1 cull)";
  // numbered gone but generic family names
  if (
    /^(gaming-mus|tradlos mus|rgb musematte|powerbank|hoyttaler|tastatur|tradlost tastatur)/i.test(
      baseName(p.name)
    )
  ) {
    return "Nær-duplikat i produktfamilie (Merch RC1 cull)";
  }
  if (p.buyerLifecycle === "discontinued") return "Discontinued / DNA-unpublish";
  if (p.buyerLifecycle === "declining" && gradeOf(p.tags) === "D")
    return "Merch RC1 — D / lav tillit eller duplikat";
  if (gradeOf(p.tags) === "D") return "Merch RC1 — merch:D";
  return "Skjult før/uten klar Merch RC1-tag (sjekk manuelt)";
}

function reactivationCandidate(p: {
  name: string;
  qualityScore: number | null;
  reason: string;
  imgs: number;
  price: number;
  category: string | null;
}): {
  flag: "likely_keep" | "high_quality_hidden" | "can_reactivate" | null;
  note: string;
} {
  const q = p.qualityScore ?? 0;
  const enJunk = /Engelsk leverandør|AliExpress|Verktøysett|Uklar gadget|Store DNA/.test(
    p.reason
  );
  const cleanNo =
    !/\b(with|and|for|suitable|compatible|multifunctional|infrared|magic|mushroom|phablet)\b/i.test(
      p.name
    ) &&
    p.name.length >= 6 &&
    p.name.length <= 55;

  if (enJunk) return { flag: null, note: "" };

  if (q >= 85 && p.imgs >= 4 && cleanNo && p.price >= 149 && p.price <= 1999) {
    return {
      flag: "high_quality_hidden",
      note: "Høy qualityScore + bilder — sannsynlig duplikat-cull; vurder å beholde én i familien",
    };
  }
  if (q >= 78 && p.imgs >= 3 && cleanNo && /Nær-duplikat/.test(p.reason)) {
    return {
      flag: "can_reactivate",
      note: "Sterk SKU i overfylt familie — kan aktiveres hvis sortimentet tåler mer dybde",
    };
  }
  if (
    q >= 70 &&
    cleanNo &&
    /Nær-duplikat|Merch RC1 — D/.test(p.reason) &&
    ["Gaming", "Mobil & Tilbehør", "Data & IT", "TV, Lyd & Bilde"].includes(
      p.category || ""
    )
  ) {
    return {
      flag: "likely_keep",
      note: "Ser ut som legitim elektronikk — skjult mest pga. volum/duplikat, ikke DNA",
    };
  }
  return { flag: null, note: "" };
}

async function main() {
  const hidden = await prisma.product.findMany({
    where: { isActive: false },
    select: {
      id: true,
      name: true,
      category: true,
      subcategory: true,
      tags: true,
      qualityScore: true,
      buyerLifecycle: true,
      price: true,
      images: true,
      shortDescription: true,
      updatedAt: true,
      createdAt: true,
    },
    orderBy: [{ qualityScore: "desc" }, { updatedAt: "desc" }],
  });

  const rows = hidden.map((p) => {
    const tags = parseTags(p.tags);
    const grade = gradeOf(tags);
    const reason = inferReason({ ...p, tags });
    const imgs = parseImages(p.images).length;
    const react = reactivationCandidate({
      name: p.name,
      qualityScore: p.qualityScore,
      reason,
      imgs,
      price: p.price,
      category: p.category,
    });
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      subcategory: p.subcategory,
      reason,
      grade,
      qualityScore: p.qualityScore,
      price: p.price,
      imgs,
      buyerLifecycle: p.buyerLifecycle,
      updatedAt: p.updatedAt.toISOString(),
      flag: react.flag,
      flagNote: react.note,
      merchRc1Likely:
        grade === "D" ||
        p.buyerLifecycle === "declining" ||
        /Nær-duplikat|Merch RC1|Engelsk leverandør|Verktøysett|Uklar gadget/.test(
          reason
        ),
    };
  });

  const merchRc1 = rows.filter((r) => r.merchRc1Likely || r.grade === "D");
  const otherInactive = rows.filter((r) => !r.merchRc1Likely && r.grade !== "D");

  const byReason: Record<string, number> = {};
  for (const r of merchRc1) {
    byReason[r.reason] = (byReason[r.reason] || 0) + 1;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    totalInactive: hidden.length,
    merchRc1Hidden: merchRc1.length,
    otherInactive: otherInactive.length,
    byReason: Object.entries(byReason)
      .sort((a, b) => b[1] - a[1])
      .map(([reason, n]) => ({ reason, n })),
    byGrade: {
      A: merchRc1.filter((r) => r.grade === "A").length,
      B: merchRc1.filter((r) => r.grade === "B").length,
      C: merchRc1.filter((r) => r.grade === "C").length,
      D: merchRc1.filter((r) => r.grade === "D").length,
      "?": merchRc1.filter((r) => r.grade === "?").length,
    },
    highQualityHidden: merchRc1.filter((r) => r.flag === "high_quality_hidden"),
    canReactivate: merchRc1.filter((r) => r.flag === "can_reactivate"),
    likelyKeep: merchRc1.filter((r) => r.flag === "likely_keep"),
    allMerchRc1: merchRc1,
    otherInactiveSample: otherInactive.slice(0, 40),
  };

  const out = path.join(process.cwd(), "tmp", "merch-auditor-hidden.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2), "utf8");
  console.log(
    JSON.stringify(
      {
        out,
        totalInactive: report.totalInactive,
        merchRc1Hidden: report.merchRc1Hidden,
        otherInactive: report.otherInactive,
        byReason: report.byReason,
        byGrade: report.byGrade,
        highQualityHidden: report.highQualityHidden.length,
        canReactivate: report.canReactivate.length,
        likelyKeep: report.likelyKeep.length,
        topHq: report.highQualityHidden.slice(0, 15).map((r) => ({
          name: r.name,
          q: r.qualityScore,
          reason: r.reason,
          cat: r.category,
        })),
        topReactivate: report.canReactivate.slice(0, 15).map((r) => ({
          name: r.name,
          q: r.qualityScore,
          reason: r.reason,
        })),
      },
      null,
      2
    )
  );
}

main().finally(() => prisma.$disconnect());
