import { Suspense } from "react";
import BulkImportClient from "./BulkImportClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function BulkImportPage() {
  return (
    <Suspense fallback={<div>Loading…</div>}>
      <BulkImportClient />
    </Suspense>
  );
}
