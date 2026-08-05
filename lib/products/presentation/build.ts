/**
 * Global Product Presentation Layer — builder.
 *
 * Converts raw Product (any supplier) → ProductPresentation for the storefront template.
 * Importers never control layout; this layer does.
 */

import { cleanProductName } from "@/lib/utils/url-decode";
import { getAvailability } from "@/lib/products/availability";
import { toCustomerSpecs } from "@/lib/products/customer-specs";
import { buildStorefrontDescription } from "@/lib/products/storefront-description";
import {
  getVariantDisplayLabel,
  getVariantTypeLabel,
} from "@/lib/products/variant-label";
import type {
  ProductPresentation,
  ProductPresentationInput,
  PresentationMedia,
  PresentationTrustBadge,
  PresentationVariant,
} from "@/lib/products/presentation/types";
import {
  filterPlayableVideoUrls,
  sortProductImageUrls,
} from "@/lib/products/media-sort";

function parseStringArray(raw: unknown): string[] {
  try {
    if (!raw) return [];
    if (Array.isArray(raw)) {
      return raw.filter((x): x is string => typeof x === "string" && x.length > 0);
    }
    if (typeof raw === "string") {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((x): x is string => typeof x === "string" && x.length > 0);
      }
      if (raw.startsWith("http")) return [raw];
    }
  } catch {
    /* ignore */
  }
  return [];
}

function parseSpecs(raw: unknown): Record<string, string> {
  try {
    if (!raw) return {};
    if (typeof raw === "object" && !Array.isArray(raw)) {
      return Object.fromEntries(
        Object.entries(raw as Record<string, unknown>)
          .filter(([, v]) => v != null)
          .map(([k, v]) => [k, String(v)])
      );
    }
    if (typeof raw === "string") {
      return JSON.parse(raw) as Record<string, string>;
    }
  } catch {
    /* ignore */
  }
  return {};
}

function parseVideos(raw: unknown): PresentationMedia["videos"] {
  const out: PresentationMedia["videos"] = [];
  try {
    const list = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(list)) return out;
    const urls = filterPlayableVideoUrls(
      list as Array<{ url?: string; videoUrl?: string }>
    );
    for (const url of urls) {
      const item = list.find(
        (x: unknown) =>
          x &&
          typeof x === "object" &&
          ((x as { url?: string }).url === url ||
            (x as { videoUrl?: string }).videoUrl === url)
      ) as { name?: string; type?: string } | undefined;
      out.push({
        url,
        name: typeof item?.name === "string" ? item.name : undefined,
        type: typeof item?.type === "string" ? item.type : undefined,
      });
    }
  } catch {
    /* ignore */
  }
  return out;
}

function getColorCode(colorName: string): string {
  const colorMap: Record<string, string> = {
    svart: "#1f2937",
    sort: "#1f2937",
    hvit: "#f9fafb",
    grå: "#6b7280",
    rød: "#ef4444",
    blå: "#3b82f6",
    grønn: "#10b981",
    gul: "#fbbf24",
    rosa: "#ec4899",
    lilla: "#a855f7",
    oransje: "#f97316",
    brun: "#92400e",
    black: "#1f2937",
    white: "#f9fafb",
    gray: "#6b7280",
    grey: "#6b7280",
    red: "#ef4444",
    blue: "#3b82f6",
    green: "#10b981",
    yellow: "#fbbf24",
    pink: "#ec4899",
    purple: "#a855f7",
    orange: "#f97316",
    brown: "#92400e",
  };
  const normalized = colorName.toLowerCase().trim();
  for (const [key, code] of Object.entries(colorMap)) {
    if (normalized.includes(key)) return code;
  }
  return "#94a3b8";
}

function slugifyPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function isValidImage(url: string | null | undefined): url is string {
  return Boolean(
    url &&
      typeof url === "string" &&
      url.startsWith("http") &&
      !url.includes("placeholder") &&
      !url.includes("placehold.co")
  );
}

function buildTrustBadges(availability: ReturnType<typeof getAvailability>): PresentationTrustBadge[] {
  const lead =
    availability.purchasable && availability.leadTimeDays
      ? `${availability.leadTimeDays.min}–${availability.leadTimeDays.max} virkedager`
      : "5–12 virkedager";

  return [
    {
      id: "free_shipping",
      title: "Fri frakt",
      subtitle: "Over 500,-",
    },
    {
      id: "delivery",
      title: "Levering",
      subtitle: lead,
    },
    {
      id: "open_purchase",
      title: "30 dagers retur",
      subtitle: "Åpent kjøp",
    },
    {
      id: "warranty",
      title: "2 års garanti",
      subtitle: "Reklamasjonsrett",
    },
    {
      id: "secure_payment",
      title: "Trygg betaling",
      subtitle: "Kort via Stripe",
    },
    {
      id: "support",
      title: "Norsk kundeservice",
      subtitle: "Man–Fre 09–18",
    },
  ];
}

/**
 * Build the global storefront presentation for one product.
 */
export function buildProductPresentation(
  input: ProductPresentationInput
): ProductPresentation {
  const title = cleanProductName(input.name);
  const category = input.category?.trim() || "Elektronikk";

  let images = sortProductImageUrls(
    parseStringArray(input.images).filter(isValidImage)
  );
  const videos = parseVideos(input.videos);
  const tags = parseStringArray(input.tags);
  const rawSpecs = parseSpecs(input.specs);

  const rawVariants = (input.variants || []).filter(
    (v) => v.isActive !== false
  );

  // Collect variant images into gallery
  const variantImages = rawVariants
    .map((v) => v.image)
    .filter(isValidImage)
    .filter((img, idx, arr) => arr.indexOf(img) === idx);

  const imagesSet = new Set<string>();
  [...variantImages, ...images].forEach((img) => imagesSet.add(img));
  images = [
    ...variantImages,
    ...Array.from(imagesSet).filter((img) => !variantImages.includes(img)),
  ];

  const presentationVariants: PresentationVariant[] = rawVariants.map((v, index) => {
    const attrs =
      v.attributes && typeof v.attributes === "object" && !Array.isArray(v.attributes)
        ? (v.attributes as Record<string, string>)
        : {};
    const color =
      attrs.color || attrs.Colour || attrs.Color || attrs.farge || attrs.colour || "";
    const model =
      attrs.model ||
      attrs.Model ||
      attrs.modell ||
      attrs.size ||
      attrs.Size ||
      "";

    let variantImage = isValidImage(v.image) ? v.image : null;
    if (!variantImage && images[index]) variantImage = images[index];
    if (!variantImage && images[0]) variantImage = images[0];

    const slugParts = [color, model]
      .filter(Boolean)
      .map((p) => slugifyPart(p));
    const uniqueSlug =
      slugParts.filter(Boolean).join("-") || `v-${index + 1}` || v.id.slice(0, 8);

    return {
      id: v.id,
      name: v.name,
      price: Number(v.price),
      compareAtPrice: v.compareAtPrice != null ? Number(v.compareAtPrice) : null,
      image: variantImage,
      attributes: attrs,
      stock: v.stock ?? 0,
      colorCode: getColorCode(color || v.name),
      slug: uniqueSlug,
      labelPrimary: "",
      labelSecondary: undefined,
    };
  });

  // Unique slugs
  const slugCounts = new Map<string, number>();
  for (const v of presentationVariants) {
    const n = (slugCounts.get(v.slug) || 0) + 1;
    slugCounts.set(v.slug, n);
    if (n > 1) v.slug = `${v.slug}-${n}`;
  }

  // Norwegian labels
  for (const v of presentationVariants) {
    const label = getVariantDisplayLabel(v, title, presentationVariants);
    v.labelPrimary = label.primary;
    v.labelSecondary = label.secondary;
  }

  const activeVariantSlug =
    input.activeVariantParam ||
    presentationVariants[0]?.slug ||
    undefined;
  const activeVariant =
    presentationVariants.find((v) => v.slug === activeVariantSlug) ||
    presentationVariants[0];

  // Reorder gallery: active variant image first, then hero→detail→lifestyle
  let galleryImages = sortProductImageUrls([...images]);
  if (activeVariant?.image && isValidImage(activeVariant.image)) {
    const idx = galleryImages.indexOf(activeVariant.image);
    if (idx > 0) {
      galleryImages = [
        activeVariant.image,
        ...galleryImages.filter((_, i) => i !== idx),
      ];
    } else if (idx === -1) {
      galleryImages = [activeVariant.image, ...galleryImages];
    }
  }
  if (galleryImages.length === 0) {
    galleryImages = ["https://placehold.co/600x600/f5f5f5/666666?text=Produkt"];
  }

  const availability = getAvailability({
    stock: input.stock || 0,
    variants: presentationVariants.map((v) => ({ stock: v.stock })),
    isActive: input.isActive !== false,
  });

  const deliveryLabel = availability.leadTimeDays
    ? `${availability.leadTimeDays.min}–${availability.leadTimeDays.max} virkedager`
    : "5–12 virkedager";

  const customerSpecs = toCustomerSpecs(rawSpecs, {
    Kategori: category,
    Leveringstid: deliveryLabel,
    Garanti: "2 år",
    ...(input.sku ? { SKU: input.sku } : {}),
  });

  const copy = buildStorefrontDescription({
    title,
    category,
    shortDescription: input.shortDescription || input.metaDescription,
    description: input.description,
    specs: rawSpecs,
  });

  const price = Number(input.price);
  const compareAtPrice =
    input.compareAtPrice != null ? Number(input.compareAtPrice) : null;
  const hasDiscount = compareAtPrice != null && compareAtPrice > price;
  const discountPercent = hasDiscount
    ? Math.round((1 - price / compareAtPrice!) * 100)
    : 0;

  const defaultImage = galleryImages[0];

  const breadcrumbs = [
    { name: "Hjem", href: "/" },
    { name: "Produkter", href: "/products" },
  ];
  if (input.category) {
    breadcrumbs.push({
      name: category,
      href: `/products?category=${encodeURIComponent(category)}`,
    });
  }
  breadcrumbs.push({ name: title, href: `/products/${input.slug}` });

  const related = (input.related || []).map((p) => ({
    id: p.id,
    name: cleanProductName(p.name),
    slug: p.slug,
    price: Number(p.price),
    compareAtPrice: p.compareAtPrice != null ? Number(p.compareAtPrice) : null,
    images: parseStringArray(p.images).filter(isValidImage),
    category: p.category ?? null,
  }));

  const seoDescription = copy.shortText.slice(0, 155);

  return {
    id: input.id,
    slug: input.slug,
    sku: input.sku ?? null,
    title,
    category,
    categoryHref: input.category
      ? `/products?category=${encodeURIComponent(category)}`
      : null,
    price,
    compareAtPrice,
    hasDiscount,
    discountPercent,
    shortIntro: copy.shortText,
    descriptionHtml: copy.html,
    media: {
      images: galleryImages,
      videos,
      spinFrames: [],
    },
    defaultImage,
    variants: presentationVariants,
    variantTypeLabel: getVariantTypeLabel(presentationVariants),
    activeVariantSlug,
    specs: customerSpecs,
    availability,
    trustBadges: buildTrustBadges(availability),
    breadcrumbs,
    related,
    seo: {
      title: cleanProductName(input.metaTitle || title),
      description: seoDescription,
    },
    jsonLd: {
      description: copy.shortText || title,
    },
    cartProduct: {
      id: input.id,
      name: title,
      slug: input.slug,
      price,
      compareAtPrice,
      image: defaultImage,
    },
  };
}
