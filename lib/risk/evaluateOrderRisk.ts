import { prisma } from "@/lib/prisma";

export interface RiskResult {
  riskScore: number;
  flags: string[];
  isFlagged: boolean;
}

export async function evaluateOrderRisk(orderId: string): Promise<RiskResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      customer: true,
    },
  });

  if (!order) {
    throw new Error("Order not found");
  }

  let score = 0;
  const flags: string[] = [];

  const total = Number(order.total || 0);
  if (total >= 4000) {
    score += 40;
    flags.push("high_value");
  } else if (total >= 2500) {
    score += 25;
    flags.push("medium_value");
  }

  // Parse shipping country if present
  let country: string | undefined;
  try {
    const addr = typeof order.shippingAddress === "string" ? JSON.parse(order.shippingAddress) : order.shippingAddress;
    country = addr?.country || addr?.land || addr?.countryCode;
  } catch {
    country = undefined;
  }
  if (country && country.toUpperCase() !== "NO") {
    score += 20;
    flags.push("non_local_country");
  }

  // Many orders recently for same customer/email (basic abuse heuristic)
  const or: any[] = [];
  if (order.customerId) or.push({ customerId: order.customerId });
  if (order.customer?.email) or.push({ customer: { email: order.customer.email } });

  const recentCount =
    or.length === 0
      ? 0
      : await prisma.order.count({
          where: {
            id: { not: order.id },
            storeId: order.storeId,
            OR: or,
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
        });
  if (recentCount >= 3) {
    score += 30;
    flags.push("many_orders_24h");
  } else if (recentCount === 2) {
    score += 15;
    flags.push("multiple_orders_24h");
  }

  const isFlagged = score >= 50 || flags.includes("high_value");

  return {
    riskScore: score,
    flags,
    isFlagged,
  };
}

