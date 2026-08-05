import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminSession } from "@/lib/api-auth";
import slugify from "slugify";
import { improveTitle } from "@/lib/utils/improve-product-title";
import { safeQuery } from "@/lib/safeQuery";
import { logError } from "@/lib/utils/logger";
import { DEFAULT_STORE_ID } from "@/lib/store";
import { getAllDbValues } from "@/lib/categories";
import {
  extractTemuGoodsId,
  hasArchivedTag,
  isValidStoreCategory,
  parseTags,
  suggestCategoryFromText,
} from "@/lib/admin/suggest-category";
import type { Prisma } from "@prisma/client";

const VALID_CATEGORIES = getAllDbValues();

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function GET(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(250, Math.max(1, parseInt(searchParams.get("limit") || "50", 10) || 50));
    const search = (searchParams.get("search") || "").trim();
    const category = searchParams.get("category") || undefined;
    const supplier = searchParams.get("supplier") || undefined;
    const status = searchParams.get("status") || undefined; // active | inactive | archived
    const filter = searchParams.get("filter") || undefined;
    // filter: imported_today | missing_category | low_score | needs_review | no_seo | missing_images | low_margin
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {};
    const and: Prisma.ProductWhereInput[] = [];

    if (search) {
      and.push({
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { sku: { contains: search, mode: "insensitive" } },
          { slug: { contains: search, mode: "insensitive" } },
          { supplierProductId: { contains: search, mode: "insensitive" } },
          { supplierUrl: { contains: search, mode: "insensitive" } },
          // supplierName is enum – only match if search looks like a supplier
          ...(search.toLowerCase() === "temu" ||
          search.toLowerCase() === "alibaba" ||
          search.toLowerCase() === "ebay"
            ? [{ supplierName: search.toLowerCase() as "temu" | "alibaba" | "ebay" | "cj" | "aliexpress" }]
            : []),
        ],
      });
    }

    if (category && category !== "all") {
      if (category === "__none__") {
        and.push({
          OR: [{ category: null }, { category: "" }],
        });
      } else {
        and.push({ category });
      }
    }

    if (supplier && supplier !== "all") {
      if (supplier === "__none__") {
        and.push({ supplierName: null });
      } else {
        and.push({
          supplierName: supplier as "temu" | "alibaba" | "ebay" | "cj" | "aliexpress",
        });
      }
    }

    if (status === "active") {
      and.push({ isActive: true });
      and.push({ NOT: { tags: { contains: "archived" } } });
    } else if (status === "inactive") {
      and.push({ isActive: false });
    } else if (status === "archived") {
      and.push({ tags: { contains: "archived" } });
    }

    if (filter === "imported_today") {
      and.push({ createdAt: { gte: startOfToday() } });
    } else if (filter === "missing_category") {
      and.push({
        OR: [
          { category: null },
          { category: "" },
          {
            AND: [
              { category: { not: null } },
              { NOT: { category: { in: VALID_CATEGORIES } } },
            ],
          },
        ],
      });
    } else if (filter === "wrong_category") {
      // Invalid category only in SQL; AI disagreement is refined after fetch.
      and.push({
        OR: [
          { category: null },
          { category: "" },
          {
            AND: [
              { category: { not: null } },
              { NOT: { category: { in: VALID_CATEGORIES } } },
            ],
          },
          // Pending AI override suggestions (column may be missing on stale clients — guarded in fetch)
          { aiCategoryStatus: "pending" },
        ],
      });
    } else if (filter === "ai_suggested") {
      and.push({ aiCategoryStatus: "pending" });
    } else if (filter === "ai_needs_review") {
      and.push({ aiCategoryStatus: "needs_review" });
    } else if (filter === "no_seo") {
      and.push({
        OR: [
          { metaTitle: null },
          { metaTitle: "" },
          { metaDescription: null },
          { metaDescription: "" },
        ],
      });
    } else if (filter === "missing_images") {
      and.push({
        OR: [{ images: "[]" }, { images: "" }],
      });
    } else if (filter === "low_margin") {
      // Selling price not enough above supplier cost (margin < 30% of price)
      and.push({
        AND: [
          { supplierPrice: { not: null } },
          { supplierPrice: { gt: 0 } },
        ],
      });
    } else if (filter === "needs_review" || filter === "low_score") {
      // Broad review queue: missing/invalid category, missing SEO, thin content
      and.push({
        OR: [
          { category: null },
          { category: "" },
          { metaTitle: null },
          { metaTitle: "" },
          { metaDescription: null },
          { metaDescription: "" },
          { description: null },
          { description: "" },
          { name: { contains: "Temu Produkt", mode: "insensitive" } },
          {
            AND: [
              { category: { not: null } },
              { NOT: { category: { in: VALID_CATEGORIES } } },
            ],
          },
        ],
      });
    }

    if (and.length > 0) {
      where.AND = and;
    }

    const productListSelectBase = {
      id: true,
      name: true,
      slug: true,
      price: true,
      compareAtPrice: true,
      supplierPrice: true,
      category: true,
      isActive: true,
      images: true,
      supplierUrl: true,
      supplierName: true,
      supplierProductId: true,
      sku: true,
      stock: true,
      metaTitle: true,
      metaDescription: true,
      description: true,
      shortDescription: true,
      tags: true,
      specs: true,
      createdAt: true,
      updatedAt: true,
    } as const;

    type ProductListRow = {
      id: string;
      name: string;
      slug: string;
      price: number;
      compareAtPrice: number | null;
      supplierPrice: number | null;
      category: string | null;
      isActive: boolean;
      images: string;
      supplierUrl: string | null;
      supplierName: string | null;
      supplierProductId: string | null;
      sku: string | null;
      stock: number;
      metaTitle: string | null;
      metaDescription: string | null;
      description: string | null;
      shortDescription: string | null;
      tags: string;
      specs: Prisma.JsonValue | null;
      createdAt: Date;
      updatedAt: Date;
      aiCategorySuggested?: string | null;
      aiCategoryConfidence?: number | null;
      aiCategoryReason?: string | null;
      aiCategoryStatus?: string | null;
    };

    async function fetchProductList(): Promise<ProductListRow[]> {
      try {
        return (await prisma.product.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
          select: {
            ...productListSelectBase,
            aiCategorySuggested: true,
            aiCategoryConfidence: true,
            aiCategoryReason: true,
            aiCategoryStatus: true,
          },
        })) as ProductListRow[];
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        // Stale Prisma client / missing columns must not empty the catalog silently.
        console.error("❌ [admin:products:list] primary select failed:", message);
        return (await prisma.product.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip,
          take: limit,
          select: { ...productListSelectBase },
        })) as ProductListRow[];
      }
    }

    let products: ProductListRow[];
    try {
      products = await fetchProductList();
    } catch (error: unknown) {
      logError(error, "[admin:products:list]");
      const { adminErrorResponse } = await import("@/lib/admin/api-error");
      return adminErrorResponse(error, 500, "products:list");
    }

    const [total, distinctCategories] = await Promise.all([
      prisma.product.count({ where }),
      safeQuery(
        () =>
          prisma.product.findMany({
            where: { category: { not: null } },
            select: { category: true },
            distinct: ["category"],
            orderBy: { category: "asc" },
          }),
        [],
        "admin:products:categories"
      ),
    ]);

    console.log("[admin:products:list]", {
      filter: filter || "all",
      search: search || "",
      skip,
      limit,
      dbRows: products.length,
      total,
    });

    // Guard: never report a non-zero total with an empty page unless truly empty DB page.
    if (products.length === 0 && total > 0 && skip < total) {
      logError(
        new Error(`Product list empty but count=${total} skip=${skip} limit=${limit}`),
        "[admin:products:list-mismatch]"
      );
      return NextResponse.json(
        {
          ok: false,
          error: "Produktlisten feilet (tom side men count > 0). Prøv å restarte serveren.",
          pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
        },
        { status: 500 }
      );
    }

    const formattedProducts = products.map((product) => {
      const tags = parseTags(product.tags);
      const archived = hasArchivedTag(tags);
      const missingCategory = !isValidStoreCategory(product.category);
      const noSeo = !product.metaTitle?.trim() || !product.metaDescription?.trim();
      const thinDescription =
        !product.description?.trim() ||
        product.description.trim().length < 40 ||
        /del av vårt utvalg/i.test(product.description);
      const needsReview =
        missingCategory ||
        noSeo ||
        thinDescription ||
        /^temu produkt$/i.test(product.name.trim());
      const lowScore = needsReview && (missingCategory || noSeo);
      const suggestion = suggestCategoryFromText(product.name);
      const showSuggestion =
        suggestion && (missingCategory || suggestion.category !== product.category)
          ? suggestion
          : null;

      const aiSuggestion =
        product.aiCategorySuggested &&
        (product.aiCategoryStatus === "pending" ||
          product.aiCategoryStatus === "needs_review")
          ? {
              category: product.aiCategorySuggested,
              subcategory: null as string | null,
              label: product.aiCategorySuggested,
              confidence:
                (product.aiCategoryConfidence ?? 0) >= 90
                  ? ("high" as const)
                  : ("medium" as const),
              aiConfidence: product.aiCategoryConfidence,
              aiReason: product.aiCategoryReason,
              aiStatus: product.aiCategoryStatus,
            }
          : null;

      return {
        id: product.id,
        name: product.name,
        slug: product.slug,
        price: Number(product.price),
        compareAtPrice: product.compareAtPrice ? Number(product.compareAtPrice) : null,
        supplierPrice: product.supplierPrice != null ? Number(product.supplierPrice) : null,
        margin:
          product.supplierPrice != null && Number(product.supplierPrice) > 0
            ? Number(product.price) - Number(product.supplierPrice)
            : null,
        marginPct:
          product.supplierPrice != null &&
          Number(product.supplierPrice) > 0 &&
          Number(product.price) > 0
            ? ((Number(product.price) - Number(product.supplierPrice)) /
                Number(product.price)) *
              100
            : null,
        category: product.category,
        isActive: product.isActive,
        images: product.images,
        supplierUrl: product.supplierUrl,
        supplierName: product.supplierName,
        supplierProductId: product.supplierProductId,
        temuGoodsId:
          product.supplierProductId || extractTemuGoodsId(product.supplierUrl),
        sku: product.sku,
        stock: product.stock,
        metaTitle: product.metaTitle,
        metaDescription: product.metaDescription,
        tags,
        createdAt: product.createdAt,
        flags: {
          missingCategory,
          noSeo,
          needsReview,
          lowScore,
          archived,
          importedToday: product.createdAt >= startOfToday(),
          aiPending: product.aiCategoryStatus === "pending",
          aiNeedsReview: product.aiCategoryStatus === "needs_review",
        },
        categorySuggestion: aiSuggestion || showSuggestion,
        aiCategory: product.aiCategorySuggested
          ? {
              suggested: product.aiCategorySuggested,
              confidence: product.aiCategoryConfidence,
              reason: product.aiCategoryReason,
              status: product.aiCategoryStatus,
            }
          : null,
      };
    });

    // NOTE: Do not re-filter `formattedProducts` after pagination — that breaks page totals.
    // Quick filters are applied in the Prisma `where` clause above.
    // low_margin / wrong_category need computed fields — filter within the current page for ops triage.
    let data = formattedProducts;
    if (filter === "low_margin") {
      data = formattedProducts.filter((p) => p.marginPct != null && p.marginPct < 35);
    } else if (filter === "wrong_category") {
      data = formattedProducts.filter((p) => {
        if (p.flags?.missingCategory) return true;
        if (
          p.aiCategory?.status === "pending" &&
          p.aiCategory.suggested &&
          p.category &&
          p.aiCategory.suggested !== p.category
        ) {
          return true;
        }
        return false;
      });
    }

    return NextResponse.json({
      ok: true,
      data,
      categories: [
        ...VALID_CATEGORIES,
        ...distinctCategories
          .map((c) => c.category)
          .filter((c): c is string => !!c && !VALID_CATEGORIES.includes(c)),
      ],
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    logError(error, "[api/admin/products] GET");
    return NextResponse.json(
      { ok: false, error: "Feil ved henting av produkter" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json();
    const {
      name,
      slug,
      description,
      shortDescription,
      price,
      compareAtPrice,
      supplierPrice,
      images,
      category,
      tags,
      supplierUrl,
      supplierName,
      supplierProductId,
      sku,
      metaTitle,
      metaDescription,
      specs,
      skipTitleImprovement = false,
      isActive = true,
    } = body;

    if (!name || !price) {
      return NextResponse.json(
        { ok: false, error: "Navn og pris er påkrevd" },
        { status: 400 }
      );
    }

    if (typeof price !== "number" || price <= 0) {
      return NextResponse.json(
        { ok: false, error: "Pris må være et positivt tall" },
        { status: 400 }
      );
    }

    const storeId = body.storeId || DEFAULT_STORE_ID;
    const improvedName = skipTitleImprovement ? name.trim() : improveTitle(name);
    const productSlug =
      slug ||
      slugify(improvedName, {
        lower: true,
        strict: true,
        locale: "nb",
      });

    const existingProduct = await safeQuery(
      () =>
        prisma.product.findUnique({
          where: { slug: productSlug },
        }),
      null,
      "admin:existing-product"
    );

    if (existingProduct) {
      const uniqueSlug = `${productSlug}-${Date.now()}`;
      return NextResponse.json(
        {
          ok: false,
          error: "Produkt med dette navnet eksisterer allerede",
          suggestedSlug: uniqueSlug,
        },
        { status: 400 }
      );
    }

    const product = await prisma.product.create({
      data: {
        name: improvedName,
        slug: productSlug,
        description: description || null,
        shortDescription: shortDescription || null,
        price: Number(price),
        compareAtPrice: compareAtPrice ? Number(compareAtPrice) : null,
        supplierPrice: supplierPrice ? Number(supplierPrice) : null,
        images: typeof images === "string" ? images : JSON.stringify(images || []),
        category: category || null,
        tags: typeof tags === "string" ? tags : JSON.stringify(tags || []),
        supplierUrl: supplierUrl || null,
        supplierName: supplierName || null,
        supplierProductId: supplierProductId || null,
        sku: sku || null,
        metaTitle: metaTitle || null,
        metaDescription: metaDescription || null,
        specs: specs && typeof specs === "object" ? specs : undefined,
        storeId: storeId,
        isActive: isActive !== undefined ? isActive : true,
      },
    });

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    logError(error, "[api/admin/products] POST");
    const message =
      error instanceof Error ? error.message : "Feil ved oppretting av produkt";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
