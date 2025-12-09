'use client';

import { Suspense } from "react";
import BulkImportClient from "./BulkImportClient";

export default function BulkImportPage() {
  return (
    <Suspense fallback={<div>Loading…</div>}>
      <BulkImportClient />
    </Suspense>
  );
}
