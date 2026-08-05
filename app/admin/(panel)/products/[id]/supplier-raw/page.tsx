import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { loadSupplierRawPayload } from "@/lib/suppliers/storage/provider";
import { listProductCatalogHistory } from "@/lib/suppliers/versioning";
import { safeQueryResult } from "@/lib/safeQuery";
import { DataState } from "@/components/admin/DataState";
import { runAdminPage } from "@/lib/admin/run-admin-page";

export const dynamic = "force-dynamic";

export default async function ProductSupplierRawPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return runAdminPage("products", "/admin/products/supplier-raw", async () => {
    const { id } = await params;
    const productRes = await safeQueryResult(
      () =>
        prisma.product.findUnique({
          where: { id },
          select: {
            id: true,
            name: true,
            supplierName: true,
            supplierAccountId: true,
            supplierProductId: true,
            supplierRaw: true,
            supplierRawArtifactId: true,
            supplierSnapshot: true,
            catalogVersion: true,
          },
        }),
      "products:supplier-raw"
    );
    if (!productRes.ok) {
      return <DataState state="error" surface="products" error={productRes.error} />;
    }
    const product = productRes.data;
    if (!product) notFound();

    const raw =
      (product.supplierRawArtifactId
        ? await loadSupplierRawPayload(product.supplierRawArtifactId).catch(
            () => null
          )
        : null) ?? product.supplierRaw;

    const artifact = product.supplierRawArtifactId
      ? await safeQueryResult(
          () =>
            prisma.supplierRawArtifact.findUnique({
              where: { id: product.supplierRawArtifactId! },
              select: {
                storageProvider: true,
                storageKey: true,
                byteSize: true,
                checksum: true,
                createdAt: true,
              },
            }),
          "products:raw-artifact"
        ).then((r) => (r.ok ? r.data : null))
      : null;

    const extras = await safeQueryResult(
      () =>
        Promise.all([
          prisma.supplierChangeEvent.findMany({
            where: { productId: id },
            orderBy: { createdAt: "desc" },
            take: 40,
          }),
          listProductCatalogHistory(id, { take: 40 }),
          prisma.importQueueItem.findFirst({
            where: { productId: id },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              rawPayload: true,
              mappedDraft: true,
              rawArtifactId: true,
            },
          }),
        ]),
      "products:supplier-raw-extras"
    );
    if (!extras.ok) {
      return <DataState state="error" surface="products" error={extras.error} />;
    }
    const [changes, versions, queue] = extras.data;

    return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <nav className="text-sm text-gray-500">
            <Link href="/admin/products" className="hover:text-green-700">
              Produkter
            </Link>
            {" / "}
            <Link href={`/admin/products/edit/${id}`} className="hover:text-green-700">
              {product.name}
            </Link>
            {" / "}
            <span className="text-gray-800">Leverandørdata</span>
          </nav>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">Leverandørdata</h1>
          <p className="mt-1 text-sm text-gray-600">
            {product.supplierName || "ukjent"} · {product.supplierProductId || "—"} · v
            {product.catalogVersion}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/admin/products/edit/${id}`}
            className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            Rediger produkt
          </Link>
          {queue?.id ? (
            <Link
              href={`/admin/suppliers/import-queue/${queue.id}/preview`}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
            >
              Import-forhåndsvisning
            </Link>
          ) : null}
          <Link
            href="/admin/suppliers/sync"
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50"
          >
            Synkronisering
          </Link>
        </div>
      </div>

      {artifact ? (
        <section className="rounded-lg border bg-white p-4 shadow-sm text-sm">
          <h2 className="text-sm font-semibold uppercase text-gray-500">Storage metadata</h2>
          <dl className="mt-2 grid gap-1 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-gray-500">Provider</dt>
              <dd>{artifact.storageProvider}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Key</dt>
              <dd className="font-mono text-xs">{artifact.storageKey}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Size</dt>
              <dd>{artifact.byteSize} bytes</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Checksum</dt>
              <dd className="font-mono text-xs">{artifact.checksum}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold uppercase text-gray-500">Normalized snapshot</h2>
        <pre className="mt-2 max-h-80 overflow-auto rounded bg-gray-50 p-3 text-xs">
          {JSON.stringify(product.supplierSnapshot, null, 2)}
        </pre>
      </section>

      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold uppercase text-gray-500">Raw supplier payload</h2>
        <pre className="mt-2 max-h-[480px] overflow-auto rounded bg-gray-50 p-3 text-xs">
          {JSON.stringify(raw ?? queue?.rawPayload, null, 2)}
        </pre>
      </section>

      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold uppercase text-gray-500">Catalog versions</h2>
        <ul className="mt-2 divide-y text-sm">
          {versions.length === 0 ? (
            <li className="py-3 text-gray-500">Ingen versjoner</li>
          ) : (
            versions.map((v) => (
              <li key={v.id} className="py-2">
                <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                  <span className="rounded bg-gray-100 px-2 py-0.5">v{v.version}</span>
                  <span className="rounded bg-gray-100 px-2 py-0.5">{v.kind}</span>
                  <span>{v.source}</span>
                  <span className="ml-auto">{v.createdAt.toISOString().slice(0, 19)}</span>
                </div>
                <pre className="mt-1 max-h-40 overflow-auto rounded bg-gray-50 p-2 text-xs">
                  {JSON.stringify(v.payload, null, 2)}
                </pre>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold uppercase text-gray-500">Change events</h2>
        <ul className="mt-2 divide-y text-sm">
          {changes.length === 0 ? (
            <li className="py-3 text-gray-500">Ingen endringer</li>
          ) : (
            changes.map((c) => (
              <li key={c.id} className="flex flex-wrap gap-2 py-2">
                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">{c.changeType}</span>
                {c.policyDecision ? (
                  <span className="rounded bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">
                    {c.policyDecision}
                  </span>
                ) : null}
                <span>{c.summary || c.field}</span>
                <span className="ml-auto text-xs text-gray-400">
                  {c.applied ? "applied" : "pending"}
                </span>
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
  });
}
