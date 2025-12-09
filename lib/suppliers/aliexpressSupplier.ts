import { SupplierAdapter, NormalizedOrder, SupplierCreateResponse, SupplierStatusResponse, SupplierProduct } from "./types";

class AliExpressSupplierAdapter implements SupplierAdapter {
  async createOrder(order: NormalizedOrder): Promise<SupplierCreateResponse> {
    console.log("[AliExpressAdapter] createOrder", order.orderId);
    return {
      supplierOrderId: `ALX-${order.orderId}`,
      status: "pending",
    };
  }

  async getOrderStatus(supplierOrderId: string): Promise<SupplierStatusResponse> {
    console.log("[AliExpressAdapter] getOrderStatus", supplierOrderId);
    return {
      supplierOrderId,
      status: "pending",
    };
  }

  async fetchProducts(): Promise<SupplierProduct[]> {
    // Mock empty list for now
    return [];
  }

  async isConfigured(): Promise<boolean> {
    return true;
  }
}

export async function getAliExpressAdapter(): Promise<SupplierAdapter> {
  return new AliExpressSupplierAdapter();
}

