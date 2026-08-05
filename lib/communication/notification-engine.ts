/**
 * Notification Engine — deliver rendered messages on a channel.
 * Does not invent copy; uses Template Engine + Locale Engine only.
 */

import "server-only";

import { Resend } from "resend";
import type { CommunicationChannel, RenderedMessage } from "./types";

export type NotifyResult = {
  ok: boolean;
  channel: CommunicationChannel;
  providerId?: string | null;
  error?: string;
  skipped?: boolean;
};

function getResend(): Resend | null {
  const key = (process.env.RESEND_API_KEY || "").trim();
  if (!key) return null;
  return new Resend(key);
}

function emailFrom(): string {
  return (
    process.env.EMAIL_FROM?.trim() ||
    "Store <noreply@example.com>"
  );
}

/**
 * Send a pre-rendered message. Locale/copy already resolved.
 */
export async function deliverNotification(input: {
  channel: CommunicationChannel;
  to: string;
  message: RenderedMessage;
  /** Optional idempotency / logging metadata */
  meta?: Record<string, unknown>;
}): Promise<NotifyResult> {
  const to = String(input.to || "").trim();
  if (!to) {
    return { ok: false, channel: input.channel, error: "missing_recipient" };
  }

  if (input.channel === "email") {
    const resend = getResend();
    if (!resend) {
      return {
        ok: false,
        channel: "email",
        error: "RESEND_API_KEY missing",
        skipped: true,
      };
    }
    try {
      const result = await resend.emails.send({
        from: emailFrom(),
        to,
        subject: input.message.subject,
        text: input.message.text,
        html: input.message.html,
      });
      if (result.error) {
        return {
          ok: false,
          channel: "email",
          error: result.error.message || String(result.error),
        };
      }
      return {
        ok: true,
        channel: "email",
        providerId: result.data?.id ?? null,
      };
    } catch (err) {
      return {
        ok: false,
        channel: "email",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  if (input.channel === "sms" || input.channel === "push" || input.channel === "in_app") {
    // Channels reserved — wire providers later without changing compose API
    console.log(
      "[communication]",
      JSON.stringify({
        channel: input.channel,
        locale: input.message.locale,
        messageType: input.message.messageType,
        to,
        subject: input.message.subject,
        meta: input.meta || null,
        status: "channel_not_configured",
      })
    );
    return {
      ok: false,
      channel: input.channel,
      skipped: true,
      error: `channel_not_configured:${input.channel}`,
    };
  }

  return { ok: false, channel: input.channel, error: "unknown_channel" };
}
