import { SupplierAdapter, NormalizedOrder, SupplierCreateResponse, SupplierStatusResponse, SupplierProduct } from "./types";

class TemuSupplierAdapter implements SupplierAdapter {
  async createOrder(order: NormalizedOrder): Promise<SupplierCreateResponse> {
    console.log("[TemuAdapter] createOrder", order.orderId);
    return {
      supplierOrderId: `TEMU-${order.orderId}`,
      status: "pending",
      trackingNumber: null,
      trackingUrl: null,
    };
  }

  async getOrderStatus(supplierOrderId: string): Promise<SupplierStatusResponse> {
    console.log("[TemuAdapter] getOrderStatus", supplierOrderId);
    // Mock: after some time, return shipped
    return {
      supplierOrderId,
      status: "shipped",
      trackingNumber: `TRACK-${supplierOrderId}`,
      trackingUrl: `https://www.17track.net/en#nums=${supplierOrderId}`,
    };
  }

  async fetchProducts(): Promise<SupplierProduct[]> {
    // Mock product list
    return [
      {
        supplierSku: "TEMU-001",
        name: "Temu produkt 1",
        price: 10,
        images: [],
        inStock: true,
        shippingInfo: "5-9 dager",
      },
    ];
  }

  async isConfigured(): Promise<boolean> {
    return true;
  }
}

export async function getTemuAdapter(): Promise<SupplierAdapter> {
  return new TemuSupplierAdapter();
}

