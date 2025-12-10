import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthSession } from "@/lib/auth";
import slugify from "slugify";
import { improveTitle } from "@/lib/utils/improve-product-title";
import { safeQuery } from "@/lib/safeQuery";
import { logError } from "@/lib/utils/logger";
import { DEFAULT_STORE_ID } from "@/lib/store";

export async function GET(req: Request) {
  const session = await getAuthSession();
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.min(100, parseInt(searchParams.get("limit") || "50"));
    const search = searchParams.get("search") || undefined;
    const category = searchParams.get("category") || undefined;
    const skip = (page - 1) * limit;

    // CRITICAL: Don't filter by storeId or isActive in admin - show ALL products
    // Admin needs to see everything to manage the catalog
    const where: any = {};
    if (search) {
      where.name = { contains: search, mode: "insensitive" };
    }
    if (category) {
      where.category = category;
    }
    // NOTE: We intentionally don't filter by storeId or isActive here
    // Admin should see all products regardless of storeId or active status

    const [products, total] = await Promise.all([
      safeQuery(
        () =>
          prisma.product.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip,
            take: limit,
          }),
        [],
        "admin:products:list"
      ),
      safeQuery(
        () => prisma.product.count({ where }),
        0,
        "admin:products:count"
      ),
    ]);

    const formattedProducts = products.map((product) => ({
      id: product.id,
      name: product.name,
      slug: product.slug,
      price: Number(product.price),
      compareAtPrice: product.compareAtPrice ? Number(product.compareAtPrice) : null,
      category: product.category,
      isActive: product.isActive,
      images: product.images,
      supplierUrl: product.supplierUrl,
      supplierName: product.supplierName,
      stock: product.stock,
      createdAt: product.createdAt,
    }));

    return NextResponse.json({
      ok: true,
      data: formattedProducts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
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
  const session = await getAuthSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
      isActive = true,
    } = body;

    // Valider påkrevde felt
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

    // Forbedre produkt-tittel automatisk
    const improvedName = improveTitle(name);

    // Generer slug hvis ikke oppgitt (basert på forbedret tittel)
    const productSlug =
      slug ||
      slugify(improvedName, {
        lower: true,
        strict: true,
        locale: "nb",
      });

    // Sjekk om slug allerede eksisterer
    const existingProduct = await safeQuery(
      () =>
        prisma.product.findUnique({
          where: { slug: productSlug },
        }),
      null,
      "admin:existing-product"
    );

    if (existingProduct) {
      // Legg til timestamp hvis slug eksisterer
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

    // Opprett produkt
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
        storeId: storeId,
        isActive: isActive !== undefined ? isActive : true,
      },
    });

    return NextResponse.json({ ok: true, data: product }, { status: 201 });
  } catch (error) {
    logError(error, "[api/admin/products] POST");
    const message =
      error instanceof Error ? error.message : "Feil ved oppretting av produkt";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
