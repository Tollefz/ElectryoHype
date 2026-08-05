import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/api-auth";
import { getSupplierEngineHealth } from "@/lib/suppliers/health";
import { logError } from "@/lib/utils/logger";
import { adminErrorResponse } from "@/lib/admin/api-error";

export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const health = await getSupplierEngineHealth();
    return NextResponse.json({ ok: true, ...health });
  } catch (error: unknown) {
    logError(error, "[admin:suppliers:health]");
    return adminErrorResponse(error, 500, "suppliers:health");
  }
}
