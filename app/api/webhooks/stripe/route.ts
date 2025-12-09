import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { inngest } from "@/inngest/client";
import { sendOrderConfirmation, sendAdminNotification } from "@/lib/email";
import { sendOrderToSupplier } from "@/lib/dropshipping/send-order-to-supplier";
import { evaluateOrderRisk } from "@/lib/risk/evaluateOrderRisk";
import { getDropshippingConfig } from "@/config/dropshipping";

// Stripe instance vil bli opprettet med validert key

export async function POST(req: Request) {
  const body = await req.text();
  const headersList = await headers();
  const signature = headersList.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  // Sjekk og valider Stripe keys
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

  if (!stripeSecretKey) {
    console.error("❌ STRIPE_SECRET_KEY is not set in environment variables");
    return NextResponse.json(
      { error: "Stripe er ikke konfigurert. STRIPE_SECRET_KEY mangler i .env filen." },
      { status: 500 }
    );
  }

  if (!webhookSecret) {
    console.error("❌ STRIPE_WEBHOOK_SECRET is not set in environment variables");
    return NextResponse.json(
      { error: "Stripe webhook er ikke konfigurert. STRIPE_WEBHOOK_SECRET mangler i .env filen." },
      { status: 500 }
    );
  }

  // Valider at Stripe secret key har riktig format
  if (!stripeSecretKey.startsWith("sk_test_") && !stripeSecretKey.startsWith("sk_live_")) {
    console.error("❌ STRIPE_SECRET_KEY has invalid format");
    return NextResponse.json(
      { 
        error: "Ugyldig Stripe secret key format. Key må starte med 'sk_test_' (test) eller 'sk_live_' (produksjon).",
      },
      { status: 500 }
    );
  }

  // Opprett Stripe instance med validert key
  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: "2025-02-24.acacia",
  });

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      webhookSecret
    );
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded":
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const orderId = paymentIntent.metadata.orderId;

        if (orderId) {
          const dropshipCfg = getDropshippingConfig();
          const sendAnywayOnHighRisk = dropshipCfg.sendAnywayOnHighRisk ?? false;
          // Oppdater ordre status
          await prisma.order.update({
            where: { id: orderId },
            data: {
              paymentStatus: "paid",
              status: "processing",
            },
          });

          // Risk-evaluering før vi sender til leverandør
          const risk = await evaluateOrderRisk(orderId);
          await prisma.order.update({
            where: { id: orderId },
            data: {
              riskScore: risk.riskScore,
              isFlaggedForReview: risk.isFlagged,
            } as any,
          });

          // Send e-poster (fire and forget - ikke vent på dem)
          sendOrderConfirmation(orderId).catch((err) =>
            console.error("❌ Failed to send order confirmation:", err)
          );

          sendAdminNotification(orderId).catch((err) =>
            console.error("❌ Failed to send admin notification:", err)
          );

          const shouldSendToSupplier = !(risk.isFlagged && !sendAnywayOnHighRisk);
          if (shouldSendToSupplier) {
            // Send ordre til leverandør (fire and forget)
            sendOrderToSupplier(orderId).catch((err) =>
              console.error("❌ Failed to send order to supplier:", err)
            );
          } else {
            console.warn("⏸️ Order flagged for review, not sent to supplier", { orderId, risk });
          }

          // Trigger Inngest event for ordrebehandling
          await inngest.send({
            name: "order/paid",
            data: {
              orderId,
            },
          });

          console.log("✅ Payment succeeded for order:", orderId);
        }
        break;

      case "payment_intent.payment_failed":
        const failedPayment = event.data.object as Stripe.PaymentIntent;
        const failedOrderId = failedPayment.metadata.orderId;

        if (failedOrderId) {
          await prisma.order.update({
            where: { id: failedOrderId },
            data: {
              paymentStatus: "failed",
              status: "cancelled",
            },
          });

          // AutomationLog model ikke tilgjengelig i schema
          // await prisma.automationLog.create({
          //   data: {
          //     type: "order",
          //     orderId: failedOrderId,
          //     action: "failed",
          //     error: failedPayment.last_payment_error?.message || "Payment failed",
          //   },
          // });
        }
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("Error processing webhook:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

