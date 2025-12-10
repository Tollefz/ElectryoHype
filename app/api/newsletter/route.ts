import { NextResponse } from "next/server";
import { logInfo, logError } from "@/lib/utils/logger";

/**
 * Simple newsletter subscription endpoint
 * For now, just logs the email. Can be extended later with actual email service.
 */
export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { ok: false, error: "Ugyldig e-postadresse" },
        { status: 400 }
      );
    }

    // Log subscription (in production, save to database or send to email service)
    logInfo(`Newsletter subscription: ${email}`, "[api/newsletter]");
    
    // TODO: Integrate with email service (e.g., Mailchimp, SendGrid, etc.)
    // For now, just return success

    return NextResponse.json({
      ok: true,
      message: "Du er nå meldt på nyhetsbrevet!",
    });
  } catch (error: any) {
    logError(error, "[api/newsletter]");
    return NextResponse.json(
      { ok: false, error: "Noe gikk galt. Prøv igjen senere." },
      { status: 500 }
    );
  }
}

