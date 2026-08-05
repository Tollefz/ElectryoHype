/**
 * Fetch ~20 products and verify storefront polish (specs filter + description).
 * Run: npx tsx scripts/_verify-product-pages-live.ts
 */
import { PrismaClient } from "@prisma/client";
import { toCustomerSpecs } from "../lib/products/customer-specs";
import {
  buildStorefrontDescription,
  isGenericDescription,
} from "../lib/products/storefront-description";

const prisma = new PrismaClient();

const BLOCKED_VISIBLE = [
  "Packaging Key",
  "Customs Name",
  "Category ID",
  "Listed Count",
  "Free Shipping Flag",
  "Material (ZH)",
  "Supplier ID",
  "Supplier Name",
];

async function main() {
  const products = await prisma.product.findMany({
    where: { isActive: true, storeId: { not: "demo-store" } },
    select: {
      id: true,
      name: true,
      slug: true,
      category: true,
      shortDescription: true,
      description: true,
      specs: true,
      variants: { where: { isActive: true }, select: { id: true, name: true, attributes: true } },
    },
    take: 24,
    orderBy: { updatedAt: "desc" },
  });

  console.log(`Checking ${products.length} products…`);
  let failures = 0;

  for (const p of products) {
    const raw =
      p.specs && typeof p.specs === "object" && !Array.isArray(p.specs)
        ? (p.specs as Record<string, string>)
        : {};
    const customer = toCustomerSpecs(raw);
    const copy = buildStorefrontDescription({
      title: p.name,
      category: p.category,
      shortDescription: p.shortDescription,
      description: p.description,
      specs: raw,
    });

    const visibleKeys = customer.map((c) => c.key).join(" | ");
    const leaked = BLOCKED_VISIBLE.filter(
      (b) =>
        customer.some((c) => c.key === b) ||
        copy.html.includes(b) ||
        copy.shortText.includes(b)
    );

    const genericLeft =
      isGenericDescription(copy.shortText) &&
      /praktisk produkt|tilpasset daglig bruk|god verdi for pengene/i.test(copy.shortText);

    if (leaked.length || genericLeft) {
      failures++;
      console.log(`FAIL ${p.slug}`);
      if (leaked.length) console.log("  leaked:", leaked.join(", "));
      if (genericLeft) console.log("  generic:", copy.shortText.slice(0, 120));
    } else {
      console.log(
        `OK ${p.slug} | specs=${customer.length} | variants=${p.variants.length} | ${copy.shortText.slice(0, 70)}…`
      );
      if (process.env.VERBOSE) console.log("  keys:", visibleKeys);
    }
  }

  // HTTP smoke: hit a few product pages
  const base = process.env.BASE_URL || "http://localhost:3000";
  let httpFails = 0;
  for (const p of products.slice(0, 8)) {
    try {
      const res = await fetch(`${base}/products/${p.slug}`);
      const html = await res.text();
      if (!res.ok) {
        console.log(`HTTP ${res.status} ${p.slug}`);
        httpFails++;
        continue;
      }
      const hit = BLOCKED_VISIBLE.filter((b) => html.includes(b));
      // Only fail on visible body copy / meta description filler — not unrelated strings
      const metaMatch = html.match(/name="description" content="([^"]*)"/i);
      const meta = metaMatch?.[1] || "";
      const badMeta = /praktisk produkt|tilpasset daglig bruk/i.test(meta);
      if (hit.length) {
        console.log(`HTTP LEAK ${p.slug}:`, hit.join(", "));
        httpFails++;
      } else if (badMeta) {
        console.log(`HTTP BAD META ${p.slug}: ${meta.slice(0, 100)}`);
        httpFails++;
      } else {
        console.log(`HTTP 200 ${p.slug}`);
      }
    } catch (e) {
      console.log(`HTTP ERR ${p.slug}:`, e instanceof Error ? e.message : e);
      httpFails++;
    }
  }

  console.log(`\nDone. Spec failures=${failures} HTTP failures=${httpFails}`);
  if (failures || httpFails) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
