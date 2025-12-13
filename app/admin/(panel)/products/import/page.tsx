import { Suspense } from "react";
import ImportClient from "./ImportClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function ImportPage() {
  return (
    <Suspense fallback={<div>Loading…</div>}>
      <ImportClient />
    </Suspense>
  );
}

