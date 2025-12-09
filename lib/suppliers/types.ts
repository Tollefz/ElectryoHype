export type Supplier =
  | "alibaba"
  | "ebay"
  | "temu"
  | "aliexpress"
  | "cj";

export interface NormalizedOrderItem {
  name: string;
  quantity: number;
  supplierSku?: string | null;
  price?: number;
}

export interface NormalizedOrder {
  orderId: string;
  storeId?: string | null;
  items: NormalizedOrderItem[];
  customer: {
    name: string;
    email?: string | null;
    phone?: string | null;
  };
  shippingAddress: {
    line1: string;
    line2?: string | null;
    city: string;
    postalCode: string;
    country: string;
    region?: string | null;
  };
}

export interface SupplierCreateResponse {
  supplierOrderId: string;
  status: "pending" | "confirmed" | "shipped";
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  raw?: unknown;
}

export interface SupplierStatusResponse {
  supplierOrderId: string;
  status: "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  raw?: unknown;
}

export interface SupplierProduct {
  supplierSku: string;
  name: string;
  price: number;
  images: string[];
  inStock: boolean;
  shippingInfo?: string | null;
  attributes?: Record<string, any>;
}

export interface SupplierAdapter {
  createOrder(order: NormalizedOrder): Promise<SupplierCreateResponse>;
  getOrderStatus(supplierOrderId: string): Promise<SupplierStatusResponse>;
  fetchProducts?(): Promise<SupplierProduct[]>;
  isConfigured(): Promise<boolean>;
}

