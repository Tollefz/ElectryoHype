import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/api-auth";
import {
  runNightlySelfImprove,
  getDeskImproveBundle,
  decideImprovement,
  createMission,
  executeMission,
  updateStoreObjectives,
  DEFAULT_OBJECTIVES,
} from "@/lib/improve";
import { logError } from "@/lib/utils/logger";

export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const bundle = await getDeskImproveBundle();
    return NextResponse.json({
      ok: true,
      defaults: DEFAULT_OBJECTIVES,
      ...bundle,
    });
  } catch (error) {
    logError(error, "[improve:GET]");
    const { adminErrorResponse } = await import("@/lib/admin/api-error");
    return adminErrorResponse(error, 500, "improve:GET");
  }
}

const postSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("run_nightly") }),
  z.object({
    action: z.literal("decide"),
    id: z.string(),
    decision: z.enum(["approved", "rejected"]),
  }),
  z.object({
    action: z.literal("create_mission"),
    title: z.string().min(3),
    brief: z.string().optional(),
    targetCount: z.number().min(5).max(100).optional(),
  }),
  z.object({
    action: z.literal("execute_mission"),
    id: z.string(),
  }),
  z.object({
    action: z.literal("update_objectives"),
    targets: z.record(z.string(), z.number()).optional(),
  }),
]);

export async function POST(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const body = postSchema.parse(await req.json());

    if (body.action === "run_nightly") {
      const result = await runNightlySelfImprove();
      return NextResponse.json({ ...result, ok: true });
    }

    if (body.action === "decide") {
      const result = await decideImprovement({
        id: body.id,
        decision: body.decision,
        actorEmail: auth.email,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (body.action === "create_mission") {
      const mission = await createMission({
        title: body.title,
        brief: body.brief,
        targetCount: body.targetCount,
      });
      return NextResponse.json({ ok: true, mission });
    }

    if (body.action === "execute_mission") {
      const result = await executeMission(body.id);
      return NextResponse.json({ ok: true, ...result });
    }

    if (body.action === "update_objectives") {
      const objectives = await updateStoreObjectives(
        (body.targets || {}) as Partial<typeof DEFAULT_OBJECTIVES>
      );
      return NextResponse.json({ ok: true, objectives });
    }

    return NextResponse.json({ ok: false, error: "Ukjent action" }, { status: 400 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Ugyldig forespørsel" }, { status: 400 });
    }
    logError(error, "[improve:POST]");
    const { adminErrorResponse } = await import("@/lib/admin/api-error");
    return adminErrorResponse(error, 500, "improve:POST");
  }
}
