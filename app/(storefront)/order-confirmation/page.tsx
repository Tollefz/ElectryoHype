import { Suspense } from "react";
import OrderConfirmationClient from "./OrderConfirmationClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function OrderConfirmationPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <div className="mx-auto h-16 w-16 animate-spin rounded-full border-4 border-green-600 border-t-transparent"></div>
            <p className="mt-4 text-lg text-slate-600">Laster...</p>
          </div>
        </div>
      }
    >
      <OrderConfirmationClient />
    </Suspense>
  );
}
