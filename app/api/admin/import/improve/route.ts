import "server-only";

import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { improveProductWithAI } from "@/lib/import/improve-product";
import type { ImportEditableField } from "@/lib/import/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_FIELDS = new Set<ImportEditableField>([
  "name",
  "description",
  "shortDescription",
  "suggestedPrice",
  "compareAtPrice",
  "category",
  "tags",
  "slug",
  "metaTitle",
  "metaDescription",
]);

/**
 * Re-improve product content with AI.
 * POST /api/admin/import/improve
 */
export async function POST(req: Request) {
  const session = await getAuthSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { product, preserveFields = [] } = body;

    if (!product || typeof product !== "object") {
      return NextResponse.json({ error: "Produktdata er påkrevd" }, { status: 400 });
    }

    const validPreserve = (Array.isArray(preserveFields) ? preserveFields : []).filter(
      (field: string): field is ImportEditableField =>
        VALID_FIELDS.has(field as ImportEditableField)
    );

    const result = await improveProductWithAI(
      {
        originalName: String(product.originalName || ""),
        originalDescription: String(product.originalDescription || ""),
        originalPrice: Number(product.originalPrice || 0),
        name: String(product.name || ""),
        description: String(product.description || ""),
        shortDescription: String(product.shortDescription || ""),
        category: String(product.category || "Hjem & Fritid"),
        tags: Array.isArray(product.tags) ? product.tags : [],
        slug: String(product.slug || ""),
        metaTitle: String(product.metaTitle || ""),
        metaDescription: String(product.metaDescription || ""),
        suggestedPrice: Number(product.suggestedPrice || 0),
        compareAtPrice: Number(product.compareAtPrice || 0),
        specs: (product.specs as Record<string, string>) || {},
        highlightedFeatures: Array.isArray(product.highlightedFeatures)
          ? product.highlightedFeatures
          : undefined,
      },
      validPreserve
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("[Import Improve] Exception:", error);
    const message = error instanceof Error ? error.message : "Ukjent feil ved AI-forbedring";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
