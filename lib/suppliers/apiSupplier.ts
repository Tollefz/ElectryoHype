import { NormalizedOrder, SupplierCreateResponse } from "./types";

export async function sendApiOrder(
  input: NormalizedOrder & { apiBaseUrl: string; apiKey?: string }
): Promise<SupplierCreateResponse> {
  // Placeholder implementation for future real API integration
  // For now, just log and return a fake ID
  console.log(`[API Supplier] Would send order to ${input.apiBaseUrl}`, {
    orderId: input.orderId,
    items: input.items.map((i: any) => ({
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

