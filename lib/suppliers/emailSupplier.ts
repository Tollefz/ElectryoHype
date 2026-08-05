import { Resend } from "resend";
import { NormalizedOrder, SupplierCreateResponse } from "./types";

function getResendClient(): Resend | null {
  const key = (process.env.RESEND_API_KEY || "").trim();
  if (!key) return null;
  return new Resend(key);
}

export async function sendEmailOrder(
  input: NormalizedOrder & { supplierOrderEmail: string }
): Promise<SupplierCreateResponse> {
  const subject = `Ny ordre ${input.orderId}`;
  const items = input.items
    .map(
      (item) =>
        `- ${item.name} x${item.quantity} (supplierSku: ${item.supplierSku ?? "N/A"})`
    )
    .join("\n");

  const body = `
Leverandør-ordre
----------------
Order ID: ${input.orderId}
Customer: ${input.customer.name}
Email: ${input.customer.email ?? "-"}
Phone: ${input.customer.phone ?? "-"}

Shipping:
${input.shippingAddress.line1}
${input.shippingAddress.line2 ?? ""}
${input.shippingAddress.postalCode} ${input.shippingAddress.city}
${input.shippingAddress.country}${input.shippingAddress.region ? ` (${input.shippingAddress.region})` : ""}

Items:
${items}
`;

  const resend = getResendClient();
  if (!resend) {
    console.log("[email]", JSON.stringify({
      kind: "supplier_order",
      apiKeyDetected: "no",
      to: input.supplierOrderEmail,
      error: "RESEND_API_KEY mangler i .env",
      finalStatus: "FAILED",
    }));
    console.log(body);
    return {
      supplierOrderId: `EMAIL-${input.orderId}`,
      status: "pending",
    };
  }

  const from = process.env.EMAIL_FROM || "ElectroHypeX <noreply@vitamiro.com>";
  const { error } = await resend.emails.send({
    from,
    to: input.supplierOrderEmail,
    subject,
    text: body,
  });
  console.log("[email]", JSON.stringify({
    kind: "supplier_order",
    apiKeyDetected: "yes",
    from,
    to: input.supplierOrderEmail,
    error: error?.message ?? null,
    finalStatus: error ? "FAILED" : "SENT",
  }));

  if (error) {
    throw error;
  }

  return {
    supplierOrderId: `EMAIL-${input.orderId}`,
    status: "pending",
  };
}

