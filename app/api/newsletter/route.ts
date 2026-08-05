import { NextResponse } from "next/server";
import { logInfo, logError } from "@/lib/utils/logger";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

const NEWSLETTER_SETTING_KEY = "newsletter_subscribers";

/**
 * Persist newsletter emails in Setting JSON until a proper ESP is wired.
 */
export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    const normalized = String(email || "")
      .trim()
      .toLowerCase();

    if (!normalized || !normalized.includes("@") || normalized.length > 254) {
      return NextResponse.json(
        { ok: false, error: "Ugyldig e-postadresse" },
        { status: 400 }
      );
    }

    const existing = await prisma.setting.findUnique({
      where: { key: NEWSLETTER_SETTING_KEY },
    });

    let list: string[] = [];
    if (existing?.value) {
      const parsed = existing.value as unknown;
      if (Array.isArray(parsed)) {
        list = parsed.map(String);
      }
    }

    if (!list.includes(normalized)) {
      list.push(normalized);
      const value = list as unknown as Prisma.InputJsonValue;
      await prisma.setting.upsert({
        where: { key: NEWSLETTER_SETTING_KEY },
        create: {
          key: NEWSLETTER_SETTING_KEY,
          value,
        },
        update: {
          value,
        },
      });
    }

    logInfo(`Newsletter subscription stored: ${normalized}`, "[api/newsletter]");

    return NextResponse.json({
      ok: true,
      message: "Takk! Vi har lagret e-posten din. Rabattkode sendes når nyhetsbrevet er aktivert.",
    });
  } catch (error: unknown) {
    logError(error, "[api/newsletter]");
    return NextResponse.json(
      { ok: false, error: "Noe gikk galt. Prøv igjen senere." },
      { status: 500 }
    );
  }
}
