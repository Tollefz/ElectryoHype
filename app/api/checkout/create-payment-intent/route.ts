import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { nanoid } from "nanoid";
import { PaymentMethod, OrderStatus, PaymentStatus, FulfillmentStatus } from "@prisma/client";
import { getStoreIdFromHeadersServer } from "@/lib/store-server";
import { safeQuery } from "@/lib/safeQuery";

// Stripe instance vil bli opprettet med validert key i POST handler

export async function POST(req: Request) {
  try {
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

    const { items, customer, total, shippingCost, discountCode, affiliateCode } = await req.json();
    
    console.log("📦 Creating order with:", {
      itemsCount: items?.length || 0,
      customerEmail: customer?.email,
      total,
      shippingCost,
    });

    // Opprett eller finn kunde
    let dbCustomer = await prisma.customer.findFirst({
      where: { email: customer.email, storeId },
    });

    if (!dbCustomer) {
      dbCustomer = await prisma.customer.create({
        data: {
          storeId,
          email: customer.email,
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

    // Hent produkter for å verifisere priser og stokk
    const productIds = items.map((item: any) => item.productId);
    const products = await safeQuery(
      () =>
        prisma.product.findMany({
          where: { id: { in: productIds }, storeId },
          include: { variants: true },
        }),
      [],
      "checkout:products"
    );

    // Optional: apply discount code
    let discountAmount = 0;
    let appliedDiscountCode: string | null = null;
    if (discountCode) {
      const now = new Date();
      const dc = await prisma.discountCode.findFirst({ where: { code: discountCode, storeId } });
      if (dc && dc.isActive !== false && (!dc.expiresAt || dc.expiresAt > now)) {
        appliedDiscountCode = dc.code;
        const percent = dc.percentOff ? dc.percentOff / 100 : 0;
        const amount = dc.amountOff ?? 0;
        const computed = total * percent + amount;
        discountAmount = Math.max(0, Math.min(computed, total));
      }
    }

    // Konverter items til OrderItem format med variant-støtte
    const orderItemsData = [];
    const orderItemsCreate = [];
    
    for (const item of items) {
      const product = products.find((p) => p.id === item.productId);
      if (!product) {
        return NextResponse.json(
          { error: `Produkt ${item.productId} ikke funnet` },
          { status: 404 }
        );
      }

      // Hent variant hvis variantId er oppgitt
      let variant = null;
      if (item.variantId) {
        variant = product.variants.find((v) => v.id === item.variantId);
        if (!variant) {
          console.warn(`⚠️ Variant ${item.variantId} ikke funnet for produkt ${product.id}`);
        }
      }

      const itemPrice = variant ? variant.price : product.price;
      const variantName = item.variantName || variant?.name || null;
      const variantId = item.variantId || null;

      orderItemsData.push({
        productId: item.productId,
        productName: product.name,
        variantId,
        variantName,
        price: itemPrice,
        quantity: item.quantity,
      });

      orderItemsCreate.push({
        productId: item.productId,
        variantId,
        variantName,
        quantity: item.quantity,
        price: itemPrice,
      });
    }

    // Opprett ordre med OrderItems
    const order = await prisma.order.create({
      data: {
        storeId,
        orderNumber: `ORD-${nanoid(8).toUpperCase()}`,
        customerId: dbCustomer.id,
        items: JSON.stringify(orderItemsData),
        subtotal: total - shippingCost,
        shippingCost: shippingCost || 0,
        tax: 0,
        total: total - discountAmount,
        shippingAddress: JSON.stringify({
          name: customer.name || customer.fullName,
          address: customer.address || customer.address1,
          zip: customer.zip || customer.zipCode,
          city: customer.city,
          shippingMethod: shippingCost === 0 ? "Gratis" : "Standard",
        }),
        paymentMethod: PaymentMethod.stripe, // PaymentMethod enum: stripe, vipps, klarna, paypal
        paymentStatus: PaymentStatus.pending,
        status: OrderStatus.pending, // Keep for backward compatibility
        fulfillmentStatus: FulfillmentStatus.NEW, // Single source of truth
        customerEmailStatus: "NOT_SENT", // Will be updated by email function
        orderItems: {
          create: orderItemsCreate,
        },
      },
    });

    // Affiliate (kobler ordre til affiliateCode hvis gitt)
    if (affiliateCode) {
      const aff = await prisma.affiliate.findFirst({ where: { code: affiliateCode, storeId } });
      if (aff) {
        const commission = (aff.ratePercent / 100) * (total - discountAmount);
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
    const amountCents = Math.round((total - discountAmount) * 100);
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
        amount: amountCents, // Konverter til øre
        currency: "nok",
        metadata: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          discountCode: appliedDiscountCode || "",
        },
      });
      console.log("✅ PaymentIntent created:", paymentIntent.id);
    } catch (stripeError: any) {
      console.error("❌ Stripe error details:", {
        type: stripeError.type,
        code: stripeError.code,
        message: stripeError.message,
        statusCode: stripeError.statusCode,
        raw: stripeError.raw ? {
          type: stripeError.raw.type,
          code: stripeError.raw.code,
          message: stripeError.raw.message,
        } : undefined,
      });

      // Gi mer hjelpsomme feilmeldinger basert på feiltype
      let errorMessage = "Ukjent feil ved opprettelse av betaling";
      let hint = "";
      
      if (stripeError.type === "StripeAuthenticationError" || stripeError.code === "api_key_expired" || stripeError.code === "invalid_api_key") {
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
      } else if (stripeError.type === "StripeInvalidRequestError") {
        errorMessage = `Stripe feil: ${stripeError.message}`;
      } else {
        errorMessage = `Stripe feil: ${stripeError.message || errorMessage}`;
      }

      // Returner mer detaljert feil til frontend
      return NextResponse.json(
        {
          error: errorMessage,
          hint: hint,
          stripeError: process.env.NODE_ENV === "development" ? {
            type: stripeError.type,
            code: stripeError.code,
            message: stripeError.message,
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
    });
  } catch (error: any) {
    console.error("❌ Error creating payment intent:", {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    
    // Returner mer detaljert feilmelding
    const errorMessage = error.message || "Noe gikk galt ved opprettelse av betaling";
    return NextResponse.json(
      {
        error: errorMessage,
        details: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

