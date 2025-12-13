import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { inngest } from "@/inngest/client";
import { sendOrderConfirmation, sendAdminNotification } from "@/lib/email";
import { sendOrderToSupplier } from "@/lib/dropshipping/send-order-to-supplier";
import { evaluateOrderRisk } from "@/lib/risk/evaluateOrderRisk";
import { getDropshippingConfig } from "@/config/dropshipping";
import { getStoreIdFromHeadersServer } from "@/lib/store-server";

// Stripe instance vil bli opprettet med validert key

export async function POST(req: Request) {
  const body = await req.text();
  const headersList = await headers();
  const signature = headersList.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  // Sjekk og valider Stripe keys
  // Clean and validate Stripe keys
  let stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim() || "";
  let webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim() || "";
  
  // Remove extra quotes if present
  stripeSecretKey = stripeSecretKey.replace(/^["']+|["']+$/g, "").trim();
  webhookSecret = webhookSecret.replace(/^["']+|["']+$/g, "").trim();

  if (!stripeSecretKey) {
    console.error("❌ STRIPE_SECRET_KEY is not set in environment variables");
    return NextResponse.json(
      { error: "Betalingssystemet er ikke konfigurert." },
      { status: 500 }
    );
  }

  if (!webhookSecret) {
    console.error("❌ STRIPE_WEBHOOK_SECRET is not set in environment variables");
    return NextResponse.json(
      { error: "Betalingssystemet er ikke konfigurert." },
      { status: 500 }
    );
  }

  // Valider at Stripe secret key har riktig format
  if (!stripeSecretKey.startsWith("sk_test_") && !stripeSecretKey.startsWith("sk_live_")) {
    console.error("❌ STRIPE_SECRET_KEY has invalid format");
    return NextResponse.json(
      {
        error: "Betalingssystemet er ikke konfigurert.",
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
      case "checkout.session.completed":
        const session = event.data.object as Stripe.Checkout.Session;
        const sessionOrderId = session.metadata?.orderId;
        
        // Prevent duplicate orders: check if order already exists by session ID
        let existingOrder = await prisma.order.findFirst({
          where: { stripeSessionId: session.id },
        });

        if (existingOrder) {
          // Order already exists, just update it
          await prisma.order.update({
            where: { id: existingOrder.id },
            data: {
              paymentStatus: "paid",
              status: "pending", // Keep for backward compatibility
              fulfillmentStatus: "NEW", // Single source of truth
              paymentIntentId: session.payment_intent as string || undefined,
              customerEmail: session.customer_email || undefined,
            },
          });
          console.log("✅ Checkout session completed - updated existing order:", existingOrder.id);
          
          // Send emails (non-blocking, updates status in DB)
          sendOrderConfirmation(existingOrder.id).then((result) => {
            if (!result.success) {
              console.error("❌ Failed to send order confirmation:", result.error);
            }
          }).catch((err) => {
            console.error("❌ Error in sendOrderConfirmation:", err);
          });
          
          sendAdminNotification(existingOrder.id).then((result) => {
            if (!result.success) {
              console.error("❌ Failed to send admin notification:", result.error);
            }
          }).catch((err) => {
            console.error("❌ Error in sendAdminNotification:", err);
          });
          break;
        }

        if (sessionOrderId) {
          // Update order with session ID and mark as paid
          existingOrder = await prisma.order.findUnique({
            where: { id: sessionOrderId },
          });

          if (existingOrder) {
            await prisma.order.update({
              where: { id: sessionOrderId },
              data: {
                paymentStatus: "paid",
                status: "pending", // Keep for backward compatibility
                fulfillmentStatus: "NEW", // Single source of truth
                paymentIntentId: session.payment_intent as string || undefined,
                stripeSessionId: session.id,
                customerEmail: session.customer_email || undefined,
              },
            });

            // Get order for risk evaluation
            const order = await prisma.order.findUnique({
              where: { id: sessionOrderId },
              include: { customer: true },
            });

            if (order) {
              const dropshipCfg = getDropshippingConfig();
              const sendAnywayOnHighRisk = dropshipCfg.sendAnywayOnHighRisk ?? false;

              // Risk evaluation
              const risk = await evaluateOrderRisk(sessionOrderId);
              await prisma.order.update({
                where: { id: sessionOrderId },
                data: {
                  riskScore: risk.riskScore,
                  isFlaggedForReview: risk.isFlagged,
                } as any,
              });

              // Send emails (non-blocking, updates status in DB)
              sendOrderConfirmation(sessionOrderId).then((result) => {
                if (!result.success) {
                  console.error("❌ Failed to send order confirmation:", result.error);
                }
              }).catch((err) => {
                console.error("❌ Error in sendOrderConfirmation:", err);
              });
              
              sendAdminNotification(sessionOrderId).then((result) => {
                if (!result.success) {
                  console.error("❌ Failed to send admin notification:", result.error);
                }
              }).catch((err) => {
                console.error("❌ Error in sendAdminNotification:", err);
              });

              // Manual fulfillment: DO NOT automatically send to supplier
              // Admin will manually process orders
              console.log("✅ Checkout session completed for order (manual fulfillment):", sessionOrderId);
            }
          }
        } else {
          // No orderId in metadata and no existing order - create order from session
          // This handles cases where checkout was created directly via Stripe Checkout
          try {
            // Retrieve full session with line items
            const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
              expand: ['line_items', 'line_items.data.price.product', 'customer'],
            });

            if (!fullSession.line_items?.data || fullSession.line_items.data.length === 0) {
              console.warn("⚠️ Checkout session has no line items, cannot create order");
              break;
            }

            // Extract customer info
            const customerEmail = session.customer_email || (fullSession.customer_details?.email);
            const customerName = fullSession.customer_details?.name || "Kunde";
            const shippingAddress = fullSession.shipping_details?.address;

            if (!customerEmail) {
              console.warn("⚠️ Checkout session has no customer email, cannot create order");
              break;
            }

            // Get or create customer
            const storeId = await getStoreIdFromHeadersServer().catch(() => null);
            let customer = await prisma.customer.findFirst({
              where: { email: customerEmail, storeId: storeId || undefined },
            });

            if (!customer) {
              customer = await prisma.customer.create({
                data: {
                  storeId: storeId || undefined,
                  email: customerEmail,
                  name: customerName,
                  phone: fullSession.customer_details?.phone || null,
                  addresses: shippingAddress ? JSON.stringify([{
                    address: shippingAddress.line1 || "",
                    address2: shippingAddress.line2 || "",
                    zip: shippingAddress.postal_code || "",
                    city: shippingAddress.city || "",
                    country: shippingAddress.country || "NO",
                  }]) : undefined,
                },
              });
            }

            // Build order items from line items
            const orderItemsData: any[] = [];
            const orderItemsCreate: any[] = [];
            let subtotal = 0;

            for (const lineItem of fullSession.line_items.data) {
              const productId = lineItem.price?.metadata?.productId || lineItem.price?.product as string;
              const productName = lineItem.description || "Produkt";
              const quantity = lineItem.quantity || 1;
              const unitPrice = (lineItem.price?.unit_amount || 0) / 100; // Convert from cents
              const lineTotal = unitPrice * quantity;
              subtotal += lineTotal;

              orderItemsData.push({
                productId: productId || "unknown",
                name: productName,
                quantity,
                price: unitPrice,
              });

              // Try to find product in database
              if (productId && productId !== "unknown") {
                const product = await prisma.product.findUnique({
                  where: { id: productId },
                });

                if (product) {
                  orderItemsCreate.push({
                    productId: product.id,
                    quantity,
                    price: unitPrice,
                  });
                }
              }
            }

            const shippingCost = (fullSession.shipping_cost?.amount_total || 0) / 100;
            const total = (fullSession.amount_total || 0) / 100;

            // Create order
            const { nanoid } = await import("nanoid");
            const newOrder = await prisma.order.create({
              data: {
                storeId: storeId || undefined,
                orderNumber: `ORD-${nanoid(8).toUpperCase()}`,
                customerId: customer.id,
                items: JSON.stringify(orderItemsData),
                subtotal: subtotal,
                shippingCost: shippingCost,
                tax: 0,
                total: total,
                shippingAddress: shippingAddress ? JSON.stringify({
                  name: customerName,
                  address: shippingAddress.line1 || "",
                  address2: shippingAddress.line2 || "",
                  zip: shippingAddress.postal_code || "",
                  city: shippingAddress.city || "",
                  country: shippingAddress.country || "NO",
                }) : JSON.stringify({}),
                paymentMethod: "stripe",
                paymentStatus: "paid",
                status: "pending", // Keep for backward compatibility
                fulfillmentStatus: "NEW", // Single source of truth
                paymentIntentId: session.payment_intent as string || undefined,
                stripeSessionId: session.id,
                customerEmail: customerEmail,
                customerEmailStatus: "NOT_SENT", // Will be updated by email function
                orderItems: orderItemsCreate.length > 0 ? {
                  create: orderItemsCreate,
                } : undefined,
              },
            });

            console.log("✅ Created order from checkout session (manual fulfillment):", newOrder.id);

            // Send emails (non-blocking, updates status in DB)
            // IMPORTANT: Order creation succeeded, so we return 200 even if emails fail
            sendOrderConfirmation(newOrder.id).then((result) => {
              if (!result.success) {
                console.error("❌ Failed to send order confirmation:", result.error);
              }
            }).catch((err) => {
              console.error("❌ Error in sendOrderConfirmation:", err);
            });
            
            sendAdminNotification(newOrder.id).then((result) => {
              if (!result.success) {
                console.error("❌ Failed to send admin notification:", result.error);
              }
            }).catch((err) => {
              console.error("❌ Error in sendAdminNotification:", err);
            });
          } catch (createError: any) {
            console.error("❌ Error creating order from checkout session:", createError);
            // Don't throw - webhook should still return success to Stripe
          }
        }
        break;

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
              status: "processing", // Keep for backward compatibility
              fulfillmentStatus: "NEW", // Single source of truth - manual fulfillment
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

          // Send e-poster (non-blocking, updates status in DB)
          sendOrderConfirmation(orderId).then((result) => {
            if (!result.success) {
              console.error("❌ Failed to send order confirmation:", result.error);
            }
          }).catch((err) => {
            console.error("❌ Error in sendOrderConfirmation:", err);
          });

          sendAdminNotification(orderId).then((result) => {
            if (!result.success) {
              console.error("❌ Failed to send admin notification:", result.error);
            }
          }).catch((err) => {
            console.error("❌ Error in sendAdminNotification:", err);
          });

          // Manual fulfillment: DO NOT automatically send to supplier
          // Admin will manually process orders
          console.log("✅ Payment succeeded for order (manual fulfillment):", orderId);
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

