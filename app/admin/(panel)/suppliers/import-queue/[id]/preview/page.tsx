import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CJ_FIELD_COVERAGE } from "@/lib/suppliers/cj/field-coverage";
import ImportPreviewClient from "./ImportPreviewClient";
import { safeQueryResult } from "@/lib/safeQuery";
import { DataState } from "@/components/admin/DataState";
import { runAdminPage } from "@/lib/admin/run-admin-page";

export const dynamic = "force-dynamic";

export default async function ImportPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return runAdminPage("importQueue", "/admin/suppliers/import-queue/preview", async () => {
    const { id } = await params;
    const itemRes = await safeQueryResult(
      () => prisma.importQueueItem.findUnique({ where: { id } }),
      "import-preview:item"
    );
    if (!itemRes.ok) {
      return <DataState state="error" surface="importQueue" error={itemRes.error} />;
    }
    const item = itemRes.data;
    if (!item) notFound();

    const productRes = item.productId
      ? await safeQueryResult(
          () =>
            prisma.product.findUnique({
              where: { id: item.productId! },
              include: { variants: true },
            }),
          "import-preview:product"
        )
      : null;
    if (productRes && !productRes.ok) {
      return <DataState state="error" surface="importQueue" error={productRes.error} />;
    }
    const product = productRes?.ok ? productRes.data : null;

    return (
      <div className="space-y-4">
        <div>
          <nav className="text-sm text-slate-500">
            <Link href="/admin/suppliers" className="hover:text-emerald-700">
              Leverandører
            </Link>
            {" / "}
            <Link href="/admin/suppliers/import-queue" className="hover:text-emerald-700">
              Importkø
            </Link>
            {" / "}
            <span className="text-slate-800">Preview</span>
          </nav>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Import — forhåndsvisning</h1>
          <p className="mt-1 text-sm text-slate-600">
            {item.title || item.supplierProductId}
          </p>
        </div>

        <ImportPreviewClient
          item={JSON.parse(JSON.stringify(item))}
          product={product ? JSON.parse(JSON.stringify(product)) : null}
          fieldCoverage={CJ_FIELD_COVERAGE}
        />
      </div>
    );
  });
}
