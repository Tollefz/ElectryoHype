import { NextResponse } from "next/server";
import Stripe from "stripe";
import { logError, logInfo } from "@/lib/utils/logger";
import { DEFAULT_STORE_ID } from "@/lib/store";
import { getStoreIdFromHeadersServer } from "@/lib/store-server";
import { prisma } from "@/lib/prisma";
import { nanoid } from "nanoid";
import { includedVatFromGross } from "@/lib/pricing/tax";
import { computeShippingCost } from "@/lib/checkout/shipping";
import { canPurchaseQuantity } from "@/lib/checkout/stock-policy";

/**
 * Stripe Checkout Session API endpoint.
 * Prices are always recomputed from the database — never trust client amounts.
 */
export async function POST(req: Request) {
  try {
    const storeId = await getStoreIdFromHeadersServer();

    let stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim() || "";
    stripeSecretKey = stripeSecretKey.replace(/^["']+|["']+$/g, "").trim();

    if (!stripeSecretKey) {
      logError(new Error("STRIPE_SECRET_KEY not set"), "[api/checkout]");
      return NextResponse.json(
        { ok: false, error: "Betalingssystemet er ikke konfigurert. Kontakt kundeservice." },
        { status: 500 }
      );
    }

    if (!stripeSecretKey.startsWith("sk_test_") && !stripeSecretKey.startsWith("sk_live_")) {
      logError(
        new Error(`Invalid Stripe key format: ${stripeSecretKey.substring(0, 10)}...`),
        "[api/checkout]"
      );
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

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ ok: false, error: "Handlekurven er tom" }, { status: 400 });
    }

    if (items.length > 50) {
      return NextResponse.json({ ok: false, error: "For mange produkter i handlekurven" }, { status: 400 });
    }

    const verifiedItems: Array<{
      productId: string;
      variantId?: string | null;
      name: string;
      price: number;
      quantity: number;
      image?: string | null;
    }> = [];

    for (const item of items) {
      const productId = String(item.productId || "");
      const quantity = Math.floor(Number(item.quantity) || 0);
      if (!productId || quantity < 1 || quantity > 99) {
        return NextResponse.json({ ok: false, error: "Ugyldig produktdata" }, { status: 400 });
      }

      const product = await prisma.product.findFirst({
        where: { id: productId, storeId, isActive: true },
        select: {
          id: true,
          name: true,
          price: true,
          stock: true,
          images: true,
          variants: item.variantId
            ? {
                where: { id: String(item.variantId), isActive: true },
                select: { id: true, name: true, price: true, stock: true, image: true },
                take: 1,
              }
            : false,
        },
      });

      if (!product) {
        return NextResponse.json(
          { ok: false, error: "Et produkt i handlekurven er ikke lenger tilgjengelig" },
          { status: 400 }
        );
      }

      const variant =
        item.variantId && Array.isArray(product.variants) ? product.variants[0] : null;
      if (item.variantId && !variant) {
        return NextResponse.json(
          { ok: false, error: "En produktvariant er ikke lenger tilgjengelig" },
          { status: 400 }
        );
      }

      const unitPrice = variant ? Number(variant.price) : Number(product.price);
      const stock = variant ? variant.stock : product.stock;
      const purchase = canPurchaseQuantity({
        isActive: true,
        stock,
        quantity,
      });
      if (!purchase.ok) {
        return NextResponse.json(
          { ok: false, error: `${purchase.error} for «${product.name}»` },
          { status: 400 }
        );
      }

      let image: string | null = variant?.image || null;
      if (!image) {
        try {
          const imgs = typeof product.images === "string" ? JSON.parse(product.images) : product.images;
          image = Array.isArray(imgs) && imgs[0] ? String(imgs[0]) : null;
        } catch {
          image = null;
        }
      }

      verifiedItems.push({
        productId: product.id,
        variantId: variant?.id ?? null,
        name: variant ? `${product.name} – ${variant.name}` : product.name,
        price: unitPrice,
        quantity,
        image,
      });
    }

    const subtotal = verifiedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const shippingCost = computeShippingCost(subtotal, "standard");
    const total = subtotal + shippingCost;
    const tax = includedVatFromGross(total);

    const orderNumber = `ORD-${Date.now()}-${nanoid(6).toUpperCase()}`;

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

    const order = await prisma.order.create({
      data: {
        orderNumber,
        storeId,
        customerId,
        status: "pending",
        paymentStatus: "pending",
        paymentMethod: "stripe",
        items: JSON.stringify(verifiedItems),
        subtotal,
        shippingCost,
        tax,
        total,
        shippingAddress: shippingAddress ? JSON.stringify(shippingAddress) : JSON.stringify({}),
        customerEmail: customerEmail || null,
      },
    });

    logInfo(`Order created: ${order.id} (${orderNumber})`, "[api/checkout]");

    const baseUrl = process.env.NEXTAUTH_URL || "https://www.electrohypex.com";

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = verifiedItems.map(
      (item) => ({
        price_data: {
          currency: "nok",
          product_data: {
            name: item.name,
            images: item.image ? [item.image] : undefined,
          },
          unit_amount: Math.round(item.price * 100),
        },
        quantity: item.quantity,
      })
    );

    if (shippingCost > 0) {
      lineItems.push({
        price_data: {
          currency: "nok",
          product_data: { name: "Frakt" },
          unit_amount: Math.round(shippingCost * 100),
        },
        quantity: 1,
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      success_url: `${baseUrl}/order-confirmation?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/cart`,
      customer_email: customerEmail || undefined,
      shipping_address_collection: {
        allowed_countries: ["NO", "SE", "DK"],
      },
      metadata: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        storeId: storeId || DEFAULT_STORE_ID,
        itemCount: verifiedItems.length.toString(),
        shippingCost: String(shippingCost),
      },
    });

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
