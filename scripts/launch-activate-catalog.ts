import { prisma } from "../lib/prisma";
import { getAllDbValues } from "../lib/categories";
import { DROPSHIP_VIRTUAL_STOCK } from "../lib/checkout/stock-policy";
import { improveTitle } from "../lib/utils/improve-product-title";

/**
 * Activate sellable catalog for launch:
 * - valid official category
 * - at least one image
 * - usable description
 * - sane price
 * - not obvious junk titles
 * Sets virtual dropship stock + basic SEO if missing.
 */
async function main() {
  const validCats = new Set(getAllDbValues());
  const products = await prisma.product.findMany();
  let activated = 0;
  let deactivated = 0;
  let seoFilled = 0;

  for (const p of products) {
    let images: string[] = [];
    try {
      const raw = typeof p.images === "string" ? JSON.parse(p.images) : p.images;
      images = Array.isArray(raw) ? raw.map(String).filter(Boolean) : [];
    } catch {
      images = [];
    }

    const name = (p.name || "").trim();
    const junk =
      /^(temu\s*produkt|testprodukt|test\b|untitled)/i.test(name) ||
      name.length < 8;
    const categoryOk = !!p.category && validCats.has(p.category);
    const descOk = (p.description || "").replace(/<[^>]+>/g, "").trim().length >= 80;
    const priceOk = Number(p.price) >= 49;
    const sellable = !junk && categoryOk && images.length > 0 && descOk && priceOk;

    const cleanedName = improveTitle(name) || name;
    const metaTitle =
      p.metaTitle?.trim() ||
      `${cleanedName.slice(0, 55)} | ElectroHypeX`.slice(0, 60);
    const plainDesc = (p.shortDescription || p.description || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const metaDescription =
      p.metaDescription?.trim() ||
      (plainDesc.slice(0, 155) ||
        `Kjøp ${cleanedName} hos ElectroHypeX. Trygg betaling og levering 5–12 virkedager.`);

    if (!p.metaTitle || !p.metaDescription) seoFilled++;

    await prisma.product.update({
      where: { id: p.id },
      data: {
        name: cleanedName,
        isActive: sellable,
        stock: sellable ? Math.max(p.stock || 0, DROPSHIP_VIRTUAL_STOCK) : p.stock,
        metaTitle,
        metaDescription,
      },
    });

    if (sellable) activated++;
    else deactivated++;
  }

  const active = await prisma.product.count({ where: { isActive: true } });
  console.log(
    JSON.stringify(
      { activated, keptInactive: deactivated, seoFilled, activeNow: active },
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
  .finally(async () => {
    await prisma.$disconnect();
  });
