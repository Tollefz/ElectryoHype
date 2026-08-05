import "server-only";

import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { runImportPipeline } from "@/lib/import/pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * AI-assisted import pipeline for Temu/Alibaba products.
 * POST /api/admin/import/pipeline
 * Body: { url: string, provider?: "temu" | "alibaba" }
 */
export async function POST(req: Request) {
  const session = await getAuthSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { url, provider } = await req.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json({ error: "URL er påkrevd" }, { status: 400 });
    }

    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: "Ugyldig URL format" }, { status: 400 });
    }

    const result = await runImportPipeline(url, provider);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[Import Pipeline] Exception:", error);
    const message = error instanceof Error ? error.message : "Ukjent feil ved import";
    return NextResponse.json(
      {
        error: message,
        hint: "Sjekk at URL-en er korrekt og at produktet fortsatt eksisterer.",
      },
      { status: 500 }
    );
  }
}
