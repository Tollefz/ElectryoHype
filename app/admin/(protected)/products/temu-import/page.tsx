import { Suspense } from "react";
import TemuImportClient from "./TemuImportClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function TemuImportPage() {
  return (
    <Suspense fallback={<div>Loading…</div>}>
      <TemuImportClient />
    </Suspense>
  );
}
