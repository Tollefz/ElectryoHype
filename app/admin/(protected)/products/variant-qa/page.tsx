import { Suspense } from "react";
import VariantQAClient from "./VariantQAClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function VariantQAPage() {
  return (
    <Suspense fallback={<div>Loading…</div>}>
      <VariantQAClient />
    </Suspense>
  );
}
