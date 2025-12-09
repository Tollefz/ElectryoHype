import { SupplierAdapter, NormalizedOrder, SupplierCreateResponse, SupplierStatusResponse, SupplierProduct } from "./types";

class CjSupplierAdapter implements SupplierAdapter {
  async createOrder(order: NormalizedOrder): Promise<SupplierCreateResponse> {
    console.log("[CJAdapter] createOrder", order.orderId);
    return {
      supplierOrderId: `CJ-${order.orderId}`,
      status: "pending",
    };
  }

  async getOrderStatus(supplierOrderId: string): Promise<SupplierStatusResponse> {
    console.log("[CJAdapter] getOrderStatus", supplierOrderId);
    return {
      supplierOrderId,
      status: "pending",
    };
  }

  async fetchProducts(): Promise<SupplierProduct[]> {
    return [];
  }

  async isConfigured(): Promise<boolean> {
    return true;
  }
}

export async function getCjAdapter(): Promise<SupplierAdapter> {
  return new CjSupplierAdapter();
}

