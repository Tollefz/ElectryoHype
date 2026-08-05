/**
 * Order Automation — AI / rule validation before CJ.
 * Does not call CJ. Failures map to ADDRESS_ERROR / WAITING_FOR_STOCK / MANUAL_REVIEW.
 */

import "server-only";

import type { Order, OrderItem, Product, ProductVariant } from "@prisma/client";

export type ValidationIssue = {
  code:
    | "missing_address"
    | "invalid_postal"
    | "invalid_country"
    | "missing_items"
    | "missing_supplier_sku"
    | "inactive_product"
    | "out_of_stock"
    | "price_anomaly"
    | "missing_customer";
  severity: "block" | "warn";
  message: string;
};

export type ValidationResult = {
  ok: boolean;
  issues: ValidationIssue[];
  /** Suggested automation phase when !ok */
  failPhase:
    | "ADDRESS_ERROR"
    | "WAITING_FOR_STOCK"
    | "MANUAL_REVIEW"
    | null;
};

type OrderWithItems = Order & {
  orderItems: Array<
    OrderItem & {
      product: Product | null;
      variant: ProductVariant | null;
    }
  >;
  customer: { email: string | null; name: string | null; phone: string | null } | null;
};

type AddressShape = {
  address?: string;
  addressLine1?: string;
  address1?: string;
  city?: string;
  zip?: string;
  zipCode?: string;
  postalCode?: string;
  country?: string;
  name?: string;
};

function parseAddress(raw: unknown): AddressShape {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as AddressShape;
    } catch {
      return {};
    }
  }
  if (typeof raw === "object") return raw as AddressShape;
  return {};
}

function norwegianPostalOk(zip: string): boolean {
  return /^\d{4}$/.test(zip.trim());
}

/**
 * Validate a paid order before supplier fulfillment.
 */
export function validateOrderForFulfillment(
  order: OrderWithItems
): ValidationResult {
  const issues: ValidationIssue[] = [];
  const addr = parseAddress(order.shippingAddress);

  const line1 = (
    addr.address ||
    addr.addressLine1 ||
    addr.address1 ||
    ""
  ).trim();
  const city = (addr.city || "").trim();
  const zip = (addr.zip || addr.zipCode || addr.postalCode || "").trim();
  const country = (addr.country || "NO").trim().toUpperCase();

  if (!line1 || line1.length < 3) {
    issues.push({
      code: "missing_address",
      severity: "block",
      message: "Mangler gateadresse.",
    });
  }
  if (!city) {
    issues.push({
      code: "missing_address",
      severity: "block",
      message: "Mangler poststed.",
    });
  }
  if (!zip) {
    issues.push({
      code: "invalid_postal",
      severity: "block",
      message: "Mangler postnummer.",
    });
  } else if (country === "NO" && !norwegianPostalOk(zip)) {
    issues.push({
      code: "invalid_postal",
      severity: "block",
      message: `Ugyldig norsk postnummer: ${zip}`,
    });
  }
  if (!country || country.length < 2) {
    issues.push({
      code: "invalid_country",
      severity: "block",
      message: "Mangler land.",
    });
  }

  if (!order.customerEmail && !order.customer?.email) {
    issues.push({
      code: "missing_customer",
      severity: "warn",
      message: "Mangler kundens e-post (varsler kan feile).",
    });
  }

  if (!order.orderItems?.length) {
    issues.push({
      code: "missing_items",
      severity: "block",
      message: "Ordren har ingen linjer.",
    });
  }

  let stockBlock = false;
  for (const item of order.orderItems || []) {
    const product = item.product;
    if (!product) {
      issues.push({
        code: "inactive_product",
        severity: "block",
        message: `Produkt mangler for linje ${item.id}.`,
      });
      continue;
    }
    if (product.isActive === false) {
      issues.push({
        code: "inactive_product",
        severity: "block",
        message: `Produktet «${product.name}» er inaktivt.`,
      });
    }
    const sku =
      product.supplierSku ||
      item.variant?.sku ||
      product.supplierProductId ||
      null;
    if (!sku) {
      issues.push({
        code: "missing_supplier_sku",
        severity: "block",
        message: `Mangler leverandør-SKU for «${product.name}».`,
      });
    }
    // Soft stock check — dropship often has stock=0 while still sellable
    const variantStock = item.variant?.stock;
    if (
      typeof variantStock === "number" &&
      variantStock <= 0 &&
      product.stock <= 0 &&
      product.isActive === false
    ) {
      stockBlock = true;
      issues.push({
        code: "out_of_stock",
        severity: "block",
        message: `Utsolgt: «${product.name}».`,
      });
    }
    if (item.price <= 0 || order.total <= 0) {
      issues.push({
        code: "price_anomaly",
        severity: "block",
        message: "Pris/total er ugyldig.",
      });
    }
  }

  const blockers = issues.filter((i) => i.severity === "block");
  let failPhase: ValidationResult["failPhase"] = null;
  if (blockers.length > 0) {
    if (blockers.some((i) => i.code.startsWith("invalid_") || i.code === "missing_address")) {
      failPhase = "ADDRESS_ERROR";
    } else if (stockBlock || blockers.some((i) => i.code === "out_of_stock")) {
      failPhase = "WAITING_FOR_STOCK";
    } else {
      failPhase = "MANUAL_REVIEW";
    }
  }

  return {
    ok: blockers.length === 0,
    issues,
    failPhase,
  };
}
