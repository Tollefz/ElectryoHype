import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthSession } from "@/lib/auth";
import slugify from "slugify";
import { improveTitle } from "@/lib/utils/improve-product-title";
import { safeQuery } from "@/lib/safeQuery";

export async function GET() {
  const session = await getAuthSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const products = await safeQuery(
      () =>
        prisma.product.findMany({
          orderBy: { createdAt: "desc" },
        }),
      [],
      "admin:products"
    );

    const formattedProducts = products.map((product) => ({
      id: product.id,
      name: product.name,
      price: Number(product.price),
      category: product.category,
      isActive: product.isActive,
      images: product.images,
      supplierUrl: product.supplierUrl,
      supplierName: product.supplierName,
    }));

    return NextResponse.json(formattedProducts);
  } catch (error) {
    console.error("Error fetching products:", error);
    return NextResponse.json(
      { error: "Feil ved henting av produkter" },
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
        { error: "Navn og pris er påkrevd" },
        { status: 400 }
      );
    }

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
        isActive: isActive !== undefined ? isActive : true,
      },
    });

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    console.error("Error creating product:", error);
    const message =
      error instanceof Error ? error.message : "Feil ved oppretting av produkt";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
