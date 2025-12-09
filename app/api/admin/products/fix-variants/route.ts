import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { updateAllProducts } from "@/scripts/auto-match-variant-images";
import { fixAllProducts } from "@/scripts/fix-all-product-variants";

export const dynamic = "force-dynamic";

/**
 * API route to fix product variants and images
 * POST /api/admin/products/fix-variants
 * Body: { action: 'match-images' | 'fix-all' | 'both' }
 */
export async function POST(req: Request) {
  const session = await getAuthSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { action = 'both' } = await req.json();

    const results: any = {
      success: true,
      action,
      timestamp: new Date().toISOString(),
    };

    if (action === 'match-images' || action === 'both') {
      console.log('[Fix Variants API] Running image matching...');
      // Note: updateAllProducts logs to console, we'll capture summary
      await updateAllProducts();
      results.imageMatching = { completed: true };
    }

    if (action === 'fix-all' || action === 'both') {
      console.log('[Fix Variants API] Running full fix...');
      await fixAllProducts();
      results.fullFix = { completed: true };
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error("[Fix Variants API] Error:", error);
    const message = error instanceof Error ? error.message : "Ukjent feil";
    return NextResponse.json(
      { error: message, success: false },
      { status: 500 }
    );
  }
}
