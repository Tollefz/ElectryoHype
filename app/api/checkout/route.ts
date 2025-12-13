import { NextResponse } from "next/server";
import Stripe from "stripe";
import { logError, logInfo } from "@/lib/utils/logger";
import { DEFAULT_STORE_ID } from "@/lib/store";
import { getStoreIdFromHeadersServer } from "@/lib/store-server";

/**
 * Stripe Checkout Session API endpoint.
 * 
 * Creates a Stripe Checkout Session and returns the checkout URL.
 * 
 * Environment variables required:
 * - STRIPE_SECRET_KEY (sk_test_... or sk_live_...)
 * - NEXTAUTH_URL (for success/cancel URLs)
 */
export async function POST(req: Request) {
  try {
    const storeId = await getStoreIdFromHeadersServer();
    
    // Validate and clean Stripe secret key
    let stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim() || "";
    
    // Remove extra quotes if present
    stripeSecretKey = stripeSecretKey.replace(/^["']+|["']+$/g, "").trim();
    
    if (!stripeSecretKey) {
      logError(new Error("STRIPE_SECRET_KEY not set"), "[api/checkout]");
      return NextResponse.json(
        { ok: false, error: "Betalingssystemet er ikke konfigurert. Kontakt kundeservice." },
        { status: 500 }
      );
    }

    if (!stripeSecretKey.startsWith("sk_test_") && !stripeSecretKey.startsWith("sk_live_")) {
      logError(new Error(`Invalid Stripe key format: ${stripeSecretKey.substring(0, 10)}...`), "[api/checkout]");
      return NextResponse.json(
        { ok: false, error: "Betalingssystemet er ikke konfigurert. Kontakt kundeservice." },
        { status: 500 }
      );
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2025-02-24.acacia",
    });

    const body = await req.json();
    const { items, customerEmail, shippingAddress } = body;

    // Validate input
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Handlekurven er tom" },
        { status: 400 }
      );
    }

    // Validate each item
    for (const item of items) {
      if (!item.productId || !item.name || !item.price || !item.quantity) {
        return NextResponse.json(
          { ok: false, error: "Ugyldig produktdata" },
          { status: 400 }
        );
      }
    }

    logInfo(`Checkout initiated with ${items.length} items`, "[api/checkout]");

    // Calculate totals
    const subtotal = items.reduce((sum: number, item: any) => sum + item.price * item.quantity, 0);
    const shippingCost = subtotal >= 500 ? 0 : 99;
    const tax = 0; // MVA kan legges til senere
    const total = subtotal + shippingCost + tax;

    // Create order in database first (pending status)
    const { prisma } = await import("@/lib/prisma");
    const { nanoid } = await import("nanoid");
    
    // Generate order number
    const orderNumber = `ORD-${Date.now()}-${nanoid(6).toUpperCase()}`;

    // Create or find customer if email provided
    let customerId: string | undefined;
    if (customerEmail) {
      const existingCustomer = await prisma.customer.findFirst({
        where: { email: customerEmail, storeId },
      });
      
      if (existingCustomer) {
        customerId = existingCustomer.id;
      } else {
        const newCustomer = await prisma.customer.create({
          data: {
            email: customerEmail,
            storeId,
            name: shippingAddress?.name || undefined,
          },
        });
        customerId = newCustomer.id;
      }
    }

    // Create order
    const order = await prisma.order.create({
      data: {
        orderNumber,
        storeId,
        customerId,
        status: "pending",
        paymentStatus: "pending",
        paymentMethod: "stripe",
        items: JSON.stringify(items),
        subtotal,
        shippingCost,
        tax,
        total,
        shippingAddress: shippingAddress ? JSON.stringify(shippingAddress) : JSON.stringify({}),
        customerEmail: customerEmail || null,
      },
    });

    logInfo(`Order created: ${order.id} (${orderNumber})`, "[api/checkout]");

    // Create Stripe Checkout Session
    const baseUrl = process.env.NEXTAUTH_URL || "https://www.electrohypex.com";
    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: items.map((item: any) => ({
        price_data: {
          currency: "nok",
          product_data: {
            name: item.name,
            images: item.image ? [item.image] : undefined,
          },
          unit_amount: Math.round(item.price * 100), // Convert to øre
        },
        quantity: item.quantity,
      })),
      mode: "payment",
      success_url: `${baseUrl}/order-confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cart`,
      customer_email: customerEmail || undefined,
      shipping_address_collection: {
        allowed_countries: ["NO", "SE", "DK"], // Norway, Sweden, Denmark
      },
      metadata: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        storeId: storeId || DEFAULT_STORE_ID,
        itemCount: items.length.toString(),
      },
    });

    // Update order with Stripe session ID
    await prisma.order.update({
      where: { id: order.id },
      data: { stripeSessionId: session.id },
    });

    logInfo(`Stripe session created: ${session.id} for order ${order.id}`, "[api/checkout]");

    return NextResponse.json({
      ok: true,
      url: session.url,
      sessionId: session.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
    });
  } catch (error) {
    logError(error, "[api/checkout] POST");
    return NextResponse.json(
      { ok: false, error: "Feil ved oppretting av checkout" },
      { status: 500 }
    );
  }
}

