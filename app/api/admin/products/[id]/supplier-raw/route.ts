import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { loadSupplierRawPayload } from "@/lib/suppliers/storage/provider";
import { listProductCatalogHistory } from "@/lib/suppliers/versioning";
import { adminErrorResponse } from "@/lib/admin/api-error";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await context.params;
    const product = await prisma.product.findUnique({
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
        supplierSpecs: true,
        attributes: true,
        videos: true,
        importCompleteness: true,
        supplierLastSync: true,
        catalogVersion: true,
      },
    });

    if (!product) {
      return NextResponse.json(
        {
          ok: false,
          reason: "not_found",
          message: "Produktet finnes ikke",
          error: "Produktet finnes ikke",
        },
        { status: 404 }
      );
    }

    let artifactPayload: unknown = null;
    let artifactMeta: unknown = null;
    if (product.supplierRawArtifactId) {
      const artifact = await prisma.supplierRawArtifact.findUnique({
        where: { id: product.supplierRawArtifactId },
      });
      artifactMeta = artifact
        ? {
            id: artifact.id,
            storageProvider: artifact.storageProvider,
            storageKey: artifact.storageKey,
            byteSize: artifact.byteSize,
            checksum: artifact.checksum,
            contentType: artifact.contentType,
            createdAt: artifact.createdAt,
            meta: artifact.meta,
          }
        : null;
      artifactPayload = await loadSupplierRawPayload(
        product.supplierRawArtifactId
      ).catch(() => null);
    }

    const [changes, versions, queue] = await Promise.all([
      prisma.supplierChangeEvent.findMany({
        where: { productId: id },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      listProductCatalogHistory(id, { take: 50 }),
      prisma.importQueueItem.findFirst({
        where: { productId: id },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      product,
      raw: artifactPayload ?? product.supplierRaw,
      artifact: artifactMeta,
      versions,
      changes,
      queueRaw: queue?.rawPayload ?? null,
      queueMapped: queue?.mappedDraft ?? null,
    });
  } catch (error: unknown) {
    return adminErrorResponse(error, 503, "products:supplier-raw");
  }
}
