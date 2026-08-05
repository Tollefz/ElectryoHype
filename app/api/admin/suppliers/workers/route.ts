import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/api-auth";
import {
  runSupplierWorkers,
  cancelSupplierJob,
  getWorkerObservability,
} from "@/lib/suppliers/workers/jobs";

export const dynamic = "force-dynamic";

/** GET — live worker + buyer mission observability */
export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;
  try {
    const observability = await getWorkerObservability();
    return NextResponse.json({ ok: true, observability });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Feil" },
      { status: 500 }
    );
  }
}

/** POST — drain supplier job workers or cancel a job */
export async function POST(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => ({}))) as {
    concurrency?: number;
    limit?: number;
    cancelJobId?: string;
  };

  if (body.cancelJobId) {
    const ok = await cancelSupplierJob(body.cancelJobId);
    return NextResponse.json({ cancelled: ok });
  }

  const result = await runSupplierWorkers({
    concurrency: body.concurrency ?? 3,
    limit: body.limit ?? 10,
  });
  return NextResponse.json(result);
}
