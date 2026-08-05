import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/api-auth";
import {
  getOrCreateShopProfile,
  updateShopProfile,
  DEFAULT_MERCHANDISER_SETTINGS,
} from "@/lib/suppliers/merchandiser";
import { logError } from "@/lib/utils/logger";

export async function GET() {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const profile = await getOrCreateShopProfile();
    return NextResponse.json({ ok: true, profile });
  } catch (error) {
    logError(error, "[merchandiser/profile:GET]");
    return NextResponse.json({ ok: false, error: "Kunne ikke hente profil" }, { status: 500 });
  }
}

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  audience: z.string().min(1).optional(),
  priceLevel: z.string().optional(),
  designStyle: z.string().nullable().optional(),
  productStrategy: z.string().nullable().optional(),
  categories: z.array(z.string()).optional(),
  qualityLevel: z.string().optional(),
  brandVoice: z.string().nullable().optional(),
  avoidCategories: z.array(z.string()).optional(),
  merchandiserSettings: z
    .object({
      autoQueueEnabled: z.boolean().optional(),
      autoQueueMinScore: z.number().min(50).max(100).optional(),
      defaultBatchSize: z.union([z.literal(10), z.literal(25), z.literal(100)]).optional(),
      minScoreToShow: z.number().min(0).max(100).optional(),
      trendSignalsEnabled: z.boolean().optional(),
    })
    .optional(),
});

export async function PATCH(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const body = patchSchema.parse(await req.json());
    const current = await getOrCreateShopProfile();
    const profile = await updateShopProfile({
      id: current.id,
      ...body,
      merchandiserSettings: body.merchandiserSettings
        ? {
            ...DEFAULT_MERCHANDISER_SETTINGS,
            ...current.merchandiserSettings,
            ...body.merchandiserSettings,
          }
        : undefined,
    });
    return NextResponse.json({ ok: true, profile });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Ugyldig forespørsel" }, { status: 400 });
    }
    logError(error, "[merchandiser/profile:PATCH]");
    return NextResponse.json({ ok: false, error: "Kunne ikke lagre profil" }, { status: 500 });
  }
}
