import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Dynamic import for Inngest to avoid build-time errors
let serveHandler: { GET: any; POST: any; PUT: any } | null = null;

async function getInngestHandler() {
  if (serveHandler) return serveHandler;

  try {
    const { serve } = await import("inngest/next");
    const { inngest } = await import("@/inngest/client");
    const { inngestFunctions } = await import("@/inngest/functions");

    serveHandler = serve({
      client: inngest,
      functions: inngestFunctions,
    });
    return serveHandler;
  } catch (error) {
    console.error("Failed to initialize Inngest:", error);
    return null;
  }
}

// Fallback handlers when Inngest is not available
const fallbackHandler = async (req: NextRequest) => {
  return NextResponse.json(
    { error: "Inngest is not configured or unavailable" },
    { status: 503 }
  );
};

export async function GET(req: NextRequest) {
  const handler = await getInngestHandler();
  if (!handler) return fallbackHandler(req);
  return handler.GET(req);
}

export async function POST(req: NextRequest) {
  const handler = await getInngestHandler();
  if (!handler) return fallbackHandler(req);
  return handler.POST(req);
}

export async function PUT(req: NextRequest) {
  const handler = await getInngestHandler();
  if (!handler) return fallbackHandler(req);
  return handler.PUT(req);
}
