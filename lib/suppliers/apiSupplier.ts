import { SupplierOrderInput, SupplierOrderResult } from "./types";

export async function sendApiOrder(
  input: SupplierOrderInput & { apiBaseUrl: string; apiKey?: string }
): Promise<SupplierOrderResult> {
  // Placeholder implementation for future real API integration
  // For now, just log and return a fake ID
  console.log(`[API Supplier] Would send order to ${input.apiBaseUrl}`, {
    orderId: input.orderId,
    items: input.items.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      supplierSku: i.supplierSku,
    })),
  });

  return {
    supplierOrderId: `API-${input.orderId}`,
    status: "pending",
  };
}

