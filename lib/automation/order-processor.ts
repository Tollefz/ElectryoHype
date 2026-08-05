import { OrderStatus, SupplierOrderStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSupplierAdapter } from "@/lib/suppliers";
import type { Supplier, SupplierAdapter } from "@/lib/suppliers/types";

interface ProcessOptions {
  isRetry?: boolean;
}

type ShippingAddress = {
  name: string;
  line1: string;
  line2: string | null;
  city: string;
  postalCode: string;
  country: string;
  region: string | null;
};

type PlaceOrderCapable = SupplierAdapter & {
  placeOrder: (params: {
    orderId: string;
    productId: string;
    supplierProductId: string | null;
    quantity: number;
    customer: {
      name: string;
      email?: string | null;
      phone?: string | null;
    };
    shippingAddress: ShippingAddress;
  }) => Promise<{ supplierOrderId: string }>;
};

export async function processOrderAutomation(orderId: string, options?: ProcessOptions) {
  void options;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      orderItems: {
        include: {
          product: true,
        },
      },
      customer: true,
    },
  });

  if (!order) {
    throw new Error(`Order ${orderId} not found`);
  }

  if (!order.orderItems.length) {
    throw new Error("Cannot process order without items");
  }

  // Parse shipping address - can be Json (object) or string
  let shippingAddressData: Prisma.JsonValue | Record<string, unknown> = order.shippingAddress;
  if (typeof order.shippingAddress === 'string') {
    try {
      shippingAddressData = JSON.parse(order.shippingAddress);
    } catch {
      throw new Error("Order missing valid shipping address");
    }
  }
  
  const shippingAddress = parseAddressFromObject(shippingAddressData);
  if (!shippingAddress) {
    throw new Error("Order missing shipping address");
  }

  const autoOrderAttempts = (order.autoOrderAttempts ?? 0) + 1;
  const supplierResults: Array<{ supplierOrderId: string; supplier: Supplier }> = [];

  for (const item of order.orderItems) {
    if (!item.product?.supplierName || !item.product.supplierUrl) {
      continue;
    }

    const supplier = item.product.supplierName.toLowerCase() as Supplier;
    const adapter = await getSupplierAdapter(supplier);

    const result = await (adapter as PlaceOrderCapable).placeOrder({
      orderId: order.id,
      productId: item.productId,
      supplierProductId: item.product.supplierProductId,
      quantity: item.quantity,
      customer: {
        name: order.customer?.name ?? shippingAddress.name,
        email: order.customer?.email,
        phone: order.customer?.phone,
      },
      shippingAddress,
    });

    supplierResults.push({ supplierOrderId: result.supplierOrderId, supplier });
  }

  if (!supplierResults.length) {
    throw new Error("No supplier orders were placed");
  }

  const primarySupplier = supplierResults[0];

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: {
      supplierOrderId: primarySupplier.supplierOrderId,
      supplierOrderStatus: SupplierOrderStatus.PENDING,
      autoOrderAttempts,
      status: OrderStatus.processing,
      updatedAt: new Date(),
    },
  });

  // AutomationLog model ikke tilgjengelig i schema
  // await prisma.automationLog.create({
  //   data: {
  //     type: "order",
  //     orderId: order.id,
  //     action: "success",
  //     details: JSON.stringify({
  //       isRetry: options?.isRetry ?? false,
  //       suppliers: supplierResults,
  //     }),
  //   },
  // });

  return updated;
}

function parseAddressFromObject(address: unknown): ShippingAddress | null {
  if (!address || typeof address !== 'object') return null;
  
  const parsed = address as {
    name?: string;
    line1?: string;
    address1?: string;
    line2?: string;
    address2?: string;
    city?: string;
    postalCode?: string;
    zipCode?: string;
    zip?: string;
    country?: string;
    region?: string;
  };
  
  const line1 = parsed.line1 || parsed.address1;
  const city = parsed.city;
  const postalCode = parsed.postalCode || parsed.zipCode || parsed.zip;
  const country = parsed.country;
  
  if (!line1 || !city || !postalCode || !country) {
    return null;
  }
  
  return {
    name: parsed.name ?? "Customer",
    line1,
    line2: parsed.line2 || parsed.address2 || null,
    city,
    postalCode: String(postalCode),
    country,
    region: parsed.region ?? null,
  };
}

