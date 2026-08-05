import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/api-auth";
import {
  getOrCreateAutonomyPolicy,
  updateAutonomyPolicy,
  runAutonomyCycle,
  getLatestAutonomyBrief,
  listAutonomyRuns,
  listOpenAutonomyTasks,
  getOrCreateStoreMemory,
  DEFAULT_STORE_GOAL,
  DEFAULT_QUALITY_GATE,
} from "@/lib/autonomy";
import { logError } from "@/lib/utils/logger";

export async function GET(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(req.url);
    const [policy, brief, runs, tasks, memory] = await Promise.all([
      getOrCreateAutonomyPolicy(),
      getLatestAutonomyBrief(),
      listAutonomyRuns(8),
      listOpenAutonomyTasks(),
      getOrCreateStoreMemory(),
    ]);

    return NextResponse.json({
      ok: true,
      policy,
      defaults: {
        storeGoal: DEFAULT_STORE_GOAL,
        qualityGate: DEFAULT_QUALITY_GATE,
      },
      brief: brief
        ? {
            id: brief.id,
            morningBrief: brief.morningBrief,
            summary: brief.summary,
            mode: brief.mode,
            finishedAt: brief.finishedAt,
            trigger: brief.trigger,
          }
        : null,
      runs,
      tasks: searchParams.get("tasks") === "0" ? undefined : tasks,
      memory,
    });
  } catch (error) {
    logError(error, "[autonomy:GET]");
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Feil" },
      { status: 500 }
    );
  }
}

const patchSchema = z.object({
  mode: z.enum(["off", "semi", "auto"]).optional(),
  scheduleEnabled: z.boolean().optional(),
  maxImportsPerRun: z.number().min(1).max(50).optional(),
  minMerchandiserScore: z.number().min(50).max(99).optional(),
  deepAnalyzeTop: z.number().min(0).max(30).optional(),
  storeGoal: z
    .object({
      quality: z.number().min(0).max(1),
      margin: z.number().min(0).max(1),
      customerExperience: z.number().min(0).max(1),
      minimizeManual: z.number().min(0).max(1),
    })
    .optional(),
  qualityGate: z
    .object({
      minImages: z.number().min(0).max(20),
      minSpecs: z.number().min(0).max(50),
      minMarginPct: z.number().min(0).max(90),
      minMerchandiserScore: z.number().min(0).max(100),
      minCategoryConfidence: z.number().min(0).max(100),
      minOverallConfidence: z.number().min(0).max(100),
      requireKnownCategory: z.boolean(),
    })
    .optional(),
});

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("run"),
    light: z.boolean().optional(),
    modeOverride: z.enum(["off", "semi", "auto"]).optional(),
  }),
  z.object({
    action: z.literal("update_policy"),
    policy: patchSchema,
  }),
]);

export async function POST(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const body = postSchema.parse(await req.json());

    if (body.action === "update_policy") {
      const policy = await updateAutonomyPolicy(body.policy);
      return NextResponse.json({ ok: true, policy });
    }

    const result = await runAutonomyCycle({
      trigger: "manual",
      light: body.light,
      modeOverride: body.modeOverride,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Ugyldig forespørsel" }, { status: 400 });
    }
    logError(error, "[autonomy:POST]");
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Kjøring feilet" },
      { status: 500 }
    );
  }
}
