import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { nanoid } from "nanoid";
import { PaymentMethod, OrderStatus, PaymentStatus, FulfillmentStatus } from "@prisma/client";
import { getStoreIdFromHeadersServer } from "@/lib/store-server";
import { safeQuery } from "@/lib/safeQuery";
import { includedVatFromGross } from "@/lib/pricing/tax";
import {
  computeShippingCost,
  normalizeShippingMethod,
  shippingMethodLabel,
} from "@/lib/checkout/shipping";
import { canPurchaseQuantity } from "@/lib/checkout/stock-policy";

// Stripe instance vil bli opprettet med validert key i POST handler

export async function POST(req: Request) {
  try {
    // Validate payload early (before Stripe client setup) so callers get clear 400s
    interface CheckoutItem {
      productId?: string;
      quantity?: number;
      variantId?: string;
      [key: string]: unknown;
    }
    interface CheckoutBody {
      items?: CheckoutItem[];
      customer?: {
        email?: string;
        name?: string;
        fullName?: string;
        phone?: string;
        address?: string;
        address1?: string;
        zip?: string;
        zipCode?: string;
        city?: string;
        country?: string;
      };
      discountCode?: string;
      affiliateCode?: string;
      shippingMethod?: string;
      [key: string]: unknown;
    }
    let earlyBody: CheckoutBody | null = null;
    try {
      earlyBody = (await req.json()) as CheckoutBody;
    } catch {
      return NextResponse.json({ error: "Ugyldig forespørsel" }, { status: 400 });
    }
    if (!earlyBody?.customer?.email || typeof earlyBody.customer.email !== "string") {
      return NextResponse.json({ error: "E-postadresse er påkrevd" }, { status: 400 });
    }
    if (!earlyBody?.items || !Array.isArray(earlyBody.items) || earlyBody.items.length === 0) {
      return NextResponse.json({ error: "Handlekurven er tom" }, { status: 400 });
    }

    console.log("📥 Payment intent request received");
    const storeId = await getStoreIdFromHeadersServer();
    
    // Sjekk og valider Stripe keys
    let stripeSecretKey = process.env.STRIPE_SECRET_KEY?.trim() || "";
    
    // Remove extra quotes if present
    stripeSecretKey = stripeSecretKey.replace(/^["']+|["']+$/g, "").trim();
    
    if (!stripeSecretKey) {
      console.error("❌ STRIPE_SECRET_KEY is not set in environment variables");
      return NextResponse.json(
        { error: "Betalingssystemet er ikke konfigurert. Kontakt kundeservice." },
        { status: 500 }
      );
    }

    // Valider at Stripe key har riktig format
    if (!stripeSecretKey.startsWith("sk_test_") && !stripeSecretKey.startsWith("sk_live_")) {
      console.error("❌ STRIPE_SECRET_KEY has invalid format:", {
        keyLength: stripeSecretKey.length,
        firstChars: stripeSecretKey.substring(0, 15),
        hasWhitespace: /\s/.test(stripeSecretKey),
      });
      return NextResponse.json(
        { 
          error: "Betalingssystemet er ikke konfigurert. Kontakt kundeservice.",
        },
        { status: 500 }
      );
    }

    // Log key info for debugging (uten å vise hele key-en)
    console.log("🔑 Stripe key validation:", {
      keyLength: stripeSecretKey.length,
      startsWith: stripeSecretKey.substring(0, 7),
      isTest: stripeSecretKey.startsWith("sk_test_"),
      isLive: stripeSecretKey.startsWith("sk_live_"),
    });

    // Opprett Stripe instance med validert key
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2025-02-24.acacia",
    });

    const { items, customer, discountCode, affiliateCode, shippingMethod: shippingMethodRaw } =
      earlyBody;
    const shippingMethod = normalizeShippingMethod(shippingMethodRaw);

    console.log("📦 Creating order with:", {
      itemsCount: items.length,
      customerEmail: customer.email,
    });

    // Opprett eller finn kunde
    let dbCustomer = await prisma.customer.findFirst({
      where: { email: customer.email, storeId },
    });

    if (!dbCustomer) {
      dbCustomer = await prisma.customer.create({
        data: {
          storeId,
          // customer.email is validated as a non-empty string earlier in this handler
          email: customer.email as string,
          name: customer.name || customer.fullName,
          phone: customer.phone || null,
          addresses: JSON.stringify([
            {
              address: customer.address || customer.address1,
              zip: customer.zip || customer.zipCode,
              city: customer.city,
            },
          ]),
        },
      });
    }

    // Hent produkter for å verifisere priser og stokk — never trust client totals
    const productIds = items.map((item: CheckoutItem) => String(item.productId || ""));
    const products = await safeQuery(
      () =>
        prisma.product.findMany({
          where: { id: { in: productIds }, storeId, isActive: true },
          include: { variants: true },
        }),
      [],
      "checkout:products"
    );

    const orderItemsData = [];
    const orderItemsCreate = [];
    let subtotal = 0;

    for (const item of items) {
      const product = products.find((p) => p.id === item.productId);
      if (!product) {
        return NextResponse.json(
          { error: `Et produkt i handlekurven er ikke lenger tilgjengelig` },
          { status: 400 }
        );
      }

      let variant = null;
      if (item.variantId) {
        variant = product.variants.find((v) => v.id === item.variantId && v.isActive !== false);
        if (!variant) {
          return NextResponse.json(
            { error: `En produktvariant er ikke lenger tilgjengelig` },
            { status: 400 }
          );
        }
      }

      const quantity = Math.floor(Number(item.quantity) || 0);
      const stock = variant ? variant.stock : product.stock;
      const purchase = canPurchaseQuantity({
        isActive: product.isActive !== false,
        stock,
        quantity,
      });
      if (!purchase.ok) {
        return NextResponse.json(
          { error: `${purchase.error}: «${product.name}»` },
          { status: 400 }
        );
      }

      const itemPrice = Number(variant ? variant.price : product.price);
      const rawVariantName = item.variantName;
      const variantName =
        (typeof rawVariantName === "string" ? rawVariantName : undefined) ||
        variant?.name ||
        null;
      const variantId = item.variantId || null;
      const productId = product.id;
      subtotal += itemPrice * quantity;

      orderItemsData.push({
        productId,
        productName: product.name,
        variantId,
        variantName,
        price: itemPrice,
        quantity,
      });

      orderItemsCreate.push({
        productId,
        variantId,
        variantName,
        quantity,
        price: itemPrice,
      });
    }

    // Server-side shipping (ignore client shippingCost / total)
    const shippingCost = computeShippingCost(subtotal, shippingMethod);
    let discountAmount = 0;
    let appliedDiscountCode: string | null = null;
    if (discountCode) {
      const now = new Date();
      const dc = await prisma.discountCode.findFirst({ where: { code: discountCode, storeId } });
      if (dc && dc.isActive !== false && (!dc.expiresAt || dc.expiresAt > now)) {
        appliedDiscountCode = dc.code;
        const percent = dc.percentOff ? dc.percentOff / 100 : 0;
        const amount = dc.amountOff ?? 0;
        const computed = subtotal * percent + amount;
        discountAmount = Math.max(0, Math.min(computed, subtotal));
      }
    }

    const grossBeforeDiscount = subtotal + shippingCost;
    const orderTotal = Math.max(0, grossBeforeDiscount - discountAmount);
    const tax = includedVatFromGross(orderTotal);

    // Opprett ordre med OrderItems
    const order = await prisma.order.create({
      data: {
        storeId,
        orderNumber: `ORD-${nanoid(8).toUpperCase()}`,
        customerId: dbCustomer.id,
        items: JSON.stringify(orderItemsData),
        subtotal,
        shippingCost,
        tax,
        total: orderTotal,
        shippingAddress: JSON.stringify({
          name: customer.name || customer.fullName,
          address: customer.address || customer.address1,
          zip: customer.zip || customer.zipCode,
          city: customer.city,
          shippingMethod: shippingMethodLabel(shippingMethod, shippingCost),
        }),
        paymentMethod: PaymentMethod.stripe,
        paymentStatus: PaymentStatus.pending,
        status: OrderStatus.pending,
        fulfillmentStatus: FulfillmentStatus.NEW,
        customerEmailStatus: "NOT_SENT",
        orderItems: {
          create: orderItemsCreate,
        },
      },
    });

    // Affiliate (kobler ordre til affiliateCode hvis gitt)
    if (affiliateCode) {
      const aff = await prisma.affiliate.findFirst({ where: { code: affiliateCode, storeId } });
      if (aff) {
        const commission = (aff.ratePercent / 100) * orderTotal;
        await prisma.affiliateOrder.create({
          data: {
            affiliateId: aff.id,
            orderId: order.id,
            commissionAmount: Math.max(0, commission),
          },
        });
      }
    }

    // Opprett Stripe PaymentIntent
    const amountCents = Math.round(orderTotal * 100);
    console.log("💳 Creating Stripe PaymentIntent with:", {
      amount: amountCents,
      currency: "nok",
      orderNumber: order.orderNumber,
      discountAmount,
      discountCode: appliedDiscountCode,
    });
    
    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create({
        amount: amountCents,
        currency: "nok",
        receipt_email: customer.email,
        metadata: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          discountCode: appliedDiscountCode || "",
        },
      });
      console.log("✅ PaymentIntent created:", paymentIntent.id);
    } catch (stripeError: unknown) {
      const err = stripeError as {
        message?: string;
        type?: string;
        statusCode?: number;
        code?: string;
        raw?: { type?: string; code?: string; message?: string };
      };
      console.error("❌ Stripe error details:", {
        type: err.type,
        code: err.code,
        message: err.message,
        statusCode: err.statusCode,
        raw: err.raw ? {
          type: err.raw.type,
          code: err.raw.code,
          message: err.raw.message,
        } : undefined,
      });

      // Gi mer hjelpsomme feilmeldinger basert på feiltype
      let errorMessage = "Ukjent feil ved opprettelse av betaling";
      let hint = "";
      
      if (err.type === "StripeAuthenticationError" || err.code === "api_key_expired" || err.code === "invalid_api_key") {
        errorMessage = `Ugyldig Stripe API key. Stripe avviser key-en.`;
        hint = `Dette kan bety:
1. Key-en er feil kopiert (mangler tegn eller har ekstra tegn)
2. Key-en er fra feil Stripe konto
3. Key-en er utløpt eller deaktivert
4. Key-en har whitespace eller linjeskift

Løsning:
- Gå til Stripe Dashboard → Developers → API Keys
- Kopier Secret key på nytt (klikk "Reveal test key")
- Lim inn i .env uten mellomrom eller linjeskift
- Restart dev serveren (Ctrl+C og npm run dev)`;
      } else if (err.type === "StripeInvalidRequestError") {
        errorMessage = `Stripe feil: ${err.message}`;
      } else {
        errorMessage = `Stripe feil: ${err.message || errorMessage}`;
      }

      // Returner mer detaljert feil til frontend
      return NextResponse.json(
        {
          error: errorMessage,
          hint: hint,
          stripeError: process.env.NODE_ENV === "development" ? {
            type: err.type,
            code: err.code,
            message: err.message,
          } : undefined,
        },
        { status: 500 }
      );
    }

    // Oppdater ordre med paymentIntentId
    await prisma.order.update({
      where: { id: order.id },
      data: { paymentIntentId: paymentIntent.id },
    });

    console.log("✅ Payment intent created successfully for order:", order.orderNumber);
    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      orderId: order.id,
      orderNumber: order.orderNumber,
      total: orderTotal,
      shippingCost,
      tax,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("❌ Error creating payment intent:", {
      message,
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined,
    });
    
    // Returner mer detaljert feilmelding
    const errorMessage = message || "Noe gikk galt ved opprettelse av betaling";
    return NextResponse.json(
      {
        error: errorMessage,
        details: process.env.NODE_ENV === "development" ? (error instanceof Error ? error.stack : undefined) : undefined,
      },
      { status: 500 }
    );
  }
}

