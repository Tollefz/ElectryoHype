import { Resend } from "resend";
import { NormalizedOrder, SupplierCreateResponse } from "./types";

const isTestMode = !process.env.RESEND_API_KEY || process.env.RESEND_API_KEY.trim() === "";
const resend = isTestMode ? null : new Resend(process.env.RESEND_API_KEY);

export async function sendEmailOrder(
  input: NormalizedOrder & { supplierOrderEmail: string }
): Promise<SupplierCreateResponse> {
  const subject = `Ny ordre ${input.orderId}`;
  const items = input.items
    .map(
      (item: any) =>
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

  if (isTestMode || !resend) {
    console.log("📧 [TEST MODE] Ville sendt leverandør-ordre til:", input.supplierOrderEmail);
    console.log(body);
    return {
      supplierOrderId: `EMAIL-${input.orderId}`,
      status: "pending",
    };
  }

  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM || "Electrohype <noreply@electrohype.no>",
    to: input.supplierOrderEmail,
    subject,
    text: body,
  });

  if (error) {
    throw error;
  }

  return {
    supplierOrderId: `EMAIL-${input.orderId}`,
    status: "pending",
  };
}

