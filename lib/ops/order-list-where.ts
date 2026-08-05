import { FulfillmentStatus, PaymentStatus, Prisma } from "@prisma/client";

/** Status chips on /admin/orders — UI labels mapped to existing fields. */
export type OrderStatusChip =
  | "alle"
  | "ny"
  | "bekreftet"
  | "behandles"
  | "sendt"
  | "levert"
  | "retur"
  | "kansellert";

export type OrderListFilters = {
  fulfillment?: string;
  payment?: string;
  emailStatus?: string;
  search?: string;
  archived?: boolean;
  /** Prefer over raw fulfillment when set (chip UX). */
  statusChip?: OrderStatusChip | string;
};

/** Shared where-clause for admin order list + filtered select-all. */
export function buildOrderListWhere(opts: OrderListFilters): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = {};
  const and: Prisma.OrderWhereInput[] = [];

  if (opts.archived) {
    and.push({ archivedAt: { not: null } });
  } else {
    and.push({ archivedAt: null });
  }

  const chip = (opts.statusChip || "").toLowerCase();
  if (chip && chip !== "alle") {
    switch (chip) {
      case "ny":
        and.push({ fulfillmentStatus: "NEW" });
        and.push({ paymentStatus: { not: "paid" } });
        break;
      case "bekreftet":
        and.push({ fulfillmentStatus: "NEW" });
        and.push({ paymentStatus: "paid" });
        break;
      case "behandles":
        and.push({ fulfillmentStatus: "ORDERED_FROM_SUPPLIER" });
        break;
      case "sendt":
        and.push({ fulfillmentStatus: "SHIPPED" });
        break;
      case "levert":
        and.push({ fulfillmentStatus: "DELIVERED" });
        break;
      case "kansellert":
        and.push({ fulfillmentStatus: "CANCELLED" });
        break;
      case "retur":
        // Not modeled yet — match nothing so count stays 0.
        and.push({ id: "__no_returns__" });
        break;
      default:
        break;
    }
  } else if (opts.fulfillment && opts.fulfillment !== "alle") {
    and.push({ fulfillmentStatus: opts.fulfillment as FulfillmentStatus });
  }

  if (opts.payment && opts.payment !== "alle") {
    and.push({ paymentStatus: opts.payment as PaymentStatus });
  }
  if (opts.emailStatus === "FAILED") {
    and.push({ customerEmailStatus: "FAILED" });
  }
  if (opts.search?.trim()) {
    const q = opts.search.trim();
    and.push({
      OR: [
        { orderNumber: { contains: q, mode: "insensitive" } },
        { customerEmail: { contains: q, mode: "insensitive" } },
        { customer: { name: { contains: q, mode: "insensitive" } } },
        { customer: { email: { contains: q, mode: "insensitive" } } },
      ],
    });
  }

  if (and.length) where.AND = and;
  return where;
}
