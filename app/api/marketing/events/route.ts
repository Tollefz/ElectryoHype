import { NextResponse } from "next/server";
import {
  ingestMarketingEvent,
  ingestMarketingEventBatch,
  type MarketingIngestPayload,
} from "@/lib/marketing/pipeline";

/**
 * First-party marketing event ingest (browser beacon).
 * Same event names as GA4 / Meta / TikTok — learning store for Mission Control.
 * Client only calls after cookie consent === "all".
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as
      | MarketingIngestPayload
      | { events?: MarketingIngestPayload[] }
      | null;

    if (!body) {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    if ("events" in body && Array.isArray(body.events)) {
      const result = await ingestMarketingEventBatch(body.events);
      return NextResponse.json({ ok: true, ...result });
    }

    const result = await ingestMarketingEvent(body as MarketingIngestPayload);
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
