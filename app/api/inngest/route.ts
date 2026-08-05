import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Dynamic import for Inngest to avoid build-time errors
type InngestRouteHandler = (req: NextRequest) => Promise<Response> | Response;
let serveHandler: { GET: InngestRouteHandler; POST: InngestRouteHandler; PUT: InngestRouteHandler } | null = null;

async function getInngestHandler() {
  if (serveHandler) return serveHandler;

  try {
    const { serve } = await import("inngest/next");
    const { inngest } = await import("@/inngest/client");
    const { inngestFunctions } = await import("@/inngest/functions");

    serveHandler = serve({
      client: inngest,
      functions: inngestFunctions,
    }) as unknown as { GET: InngestRouteHandler; POST: InngestRouteHandler; PUT: InngestRouteHandler };
    return serveHandler;
  } catch (error) {
    console.error("Failed to initialize Inngest:", error);
    return null;
  }
}

// Fallback handlers when Inngest is not available
const fallbackHandler = async () => {
  return NextResponse.json(
    { error: "Inngest is not configured or unavailable" },
    { status: 503 }
  );
};

export async function GET(req: NextRequest) {
  const handler = await getInngestHandler();
  if (!handler) return fallbackHandler();
  return handler.GET(req);
}

export async function POST(req: NextRequest) {
  const handler = await getInngestHandler();
  if (!handler) return fallbackHandler();
  return handler.POST(req);
}

export async function PUT(req: NextRequest) {
  const handler = await getInngestHandler();
  if (!handler) return fallbackHandler();
  return handler.PUT(req);
}
