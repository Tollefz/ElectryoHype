import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthSession } from "@/lib/auth";
import { validateVariantAttributes } from "@/lib/validation/color-validation";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string; variantId: string }> }
) {
  const session = await getAuthSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { variantId } = await context.params;
    const body = await req.json();

    // Check if variant exists
    const variant = await prisma.productVariant.findUnique({
      where: { id: variantId },
    });

    if (!variant) {
      return NextResponse.json({ error: "Variant ikke funnet" }, { status: 404 });
    }

    // Validate and normalize color attributes (ElectroHypeX policy: only black)
    let validatedAttributes = variant.attributes as Record<string, any>;
    if (body.attributes !== undefined) {
      try {
        validatedAttributes = validateVariantAttributes(body.attributes);
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : "Ugyldig farge" },
          { status: 400 }
        );
      }
    }
    
    // Update variant
    const updatedVariant = await prisma.productVariant.update({
      where: { id: variantId },
      data: {
        image: body.image !== undefined ? body.image : variant.image,
        name: body.name !== undefined ? body.name : variant.name,
        price: body.price !== undefined ? Number(body.price) : variant.price,
        attributes: validatedAttributes,
      },
    });

    return NextResponse.json(updatedVariant);
  } catch (error) {
    console.error("Error updating variant:", error);
    const message = error instanceof Error ? error.message : "Feil ved oppdatering av variant";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ id: string; variantId: string }> }
) {
  const session = await getAuthSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { variantId } = await context.params;

    // Check if variant exists
    const variant = await prisma.productVariant.findUnique({
      where: { id: variantId },
    });

    if (!variant) {
      return NextResponse.json({ error: "Variant ikke funnet" }, { status: 404 });
    }

    // Delete variant
    await prisma.productVariant.delete({
      where: { id: variantId },
    });

    return NextResponse.json({ success: true, message: "Variant slettet" });
  } catch (error) {
    console.error("Error deleting variant:", error);
    const message = error instanceof Error ? error.message : "Feil ved sletting av variant";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

