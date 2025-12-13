"use client";

import { SHIPPING_MESSAGES } from "@/lib/shippingCopy";

interface DeliveryInfoProps {
  variant?: "compact" | "full";
  className?: string;
}

export default function DeliveryInfo({ variant = "compact", className = "" }: DeliveryInfoProps) {
  if (variant === "compact") {
    return (
      <div className={`text-sm text-gray-600 ${className}`}>
        <p className="font-medium text-gray-900 mb-1">Levering</p>
        <p>{SHIPPING_MESSAGES.ESTIMATED_DELIVERY}</p>
        <p className="text-xs text-gray-500 mt-1">{SHIPPING_MESSAGES.MANUAL_PROCESSING}</p>
      </div>
    );
  }

  return (
    <div className={`rounded-lg bg-blue-50 border border-blue-200 p-4 ${className}`}>
      <h3 className="font-semibold text-gray-900 mb-2">Leveringsinformasjon</h3>
      <ul className="text-sm text-gray-700 space-y-1">
        <li>✓ {SHIPPING_MESSAGES.FREE_SHIPPING_MESSAGE}</li>
        <li>✓ {SHIPPING_MESSAGES.DELIVERY_INFO}</li>
        <li>✓ Leveres til hele Norge</li>
      </ul>
    </div>
  );
}

