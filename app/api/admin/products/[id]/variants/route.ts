import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthSession } from "@/lib/auth";
import { validateVariantAttributes } from "@/lib/validation/color-validation";

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;

    const variants = await prisma.productVariant.findMany({
      where: { productId: id },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ variants });
  } catch (error) {
    console.error("Error fetching variants:", error);
    const message = error instanceof Error ? error.message : "Feil ved henting av varianter";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const variantData = await req.json();

    // Valider påkrevde felt
    if (!variantData.name || variantData.price === undefined) {
      return NextResponse.json(
        { error: "Navn og pris er påkrevd for variant" },
        { status: 400 }
      );
    }

    // Validate and normalize color attributes (ElectroHypeX policy: only black)
    let validatedAttributes = variantData.attributes || {};
    try {
      validatedAttributes = validateVariantAttributes(validatedAttributes);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Ugyldig farge" },
        { status: 400 }
      );
    }

    // Opprett variant
    const variant = await prisma.productVariant.create({
      data: {
        productId: id,
        name: variantData.name,
        price: Number(variantData.price) || 0,
        compareAtPrice: variantData.compareAtPrice ? Number(variantData.compareAtPrice) : null,
        supplierPrice: variantData.supplierPrice ? Number(variantData.supplierPrice) : null,
        image: variantData.image || null,
        attributes: validatedAttributes,
        stock: variantData.stock || 10,
        isActive: variantData.isActive !== undefined ? variantData.isActive : true,
      },
    });

    return NextResponse.json(variant, { status: 201 });
  } catch (error) {
    console.error("Error creating variant:", error);
    const message = error instanceof Error ? error.message : "Feil ved oppretting av variant";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const { variants } = await req.json();

    if (!Array.isArray(variants)) {
      return NextResponse.json({ error: "Variants må være en array" }, { status: 400 });
    }

    // Slett alle eksisterende varianter
    await prisma.productVariant.deleteMany({
      where: { productId: id },
    });

    // Validate all variants before creating
    const validatedVariants = variants.map((variant: any) => {
      let validatedAttributes = variant.attributes || {};
      try {
        validatedAttributes = validateVariantAttributes(validatedAttributes);
      } catch (error) {
        throw new Error(
          `Variant "${variant.name}": ${error instanceof Error ? error.message : "Ugyldig farge"}`
        );
      }
      return {
        ...variant,
        attributes: validatedAttributes,
      };
    });

    // Opprett nye varianter
    const createdVariants = await Promise.all(
      validatedVariants.map((variant: any) =>
        prisma.productVariant.create({
          data: {
            productId: id,
            name: variant.name,
            price: Number(variant.price) || 0,
            compareAtPrice: variant.compareAtPrice ? Number(variant.compareAtPrice) : null,
            supplierPrice: variant.supplierPrice ? Number(variant.supplierPrice) : null,
            image: variant.image || null,
            attributes: variant.attributes || {},
            stock: variant.stock || 0,
            isActive: variant.isActive !== undefined ? variant.isActive : true,
          },
        })
      )
    );

    return NextResponse.json({ variants: createdVariants });
  } catch (error) {
    console.error("Error updating variants:", error);
    const message = error instanceof Error ? error.message : "Feil ved oppdatering av varianter";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

