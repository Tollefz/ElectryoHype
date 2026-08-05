import { PrismaClient } from "@prisma/client";
import { evaluateAutoPublishGate } from "../lib/buyer/auto-publish-gate";
import { parseEconomicFromPricing } from "../lib/buyer/economic-validation";

const p = new PrismaClient();
const id = process.argv[2] || "cms6mn4bp00j0vff49xp91x4v";

async function main() {
  const c = await p.buyerCandidate.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      status: true,
      supplier: true,
      supplierProductId: true,
      merchandiserRecId: true,
      importQueueItemId: true,
      supplierPrice: true,
      imageUrl: true,
      pricing: true,
      snapshot: true,
      overallScore: true,
    },
  });
  if (!c) throw new Error("missing");

  const economic = parseEconomicFromPricing(c.pricing);
  const snap =
    c.snapshot && typeof c.snapshot === "object"
      ? (c.snapshot as Record<string, unknown>)
      : {};
  const images = Array.isArray(snap.images)
    ? snap.images.map(String)
    : c.imageUrl
      ? [c.imageUrl]
      : [];

  const gate = evaluateAutoPublishGate({
    title: c.title || "",
    canImport: Boolean(c.merchandiserRecId),
    merchandiserRecId: c.merchandiserRecId,
    imageUrl: c.imageUrl,
    images,
    costNOK: economic?.landedCostNOK ?? economic?.costNOK ?? null,
    retailNOK: economic?.retailNOK ?? null,
    marginPct: economic?.marginPct ?? null,
    economicConfidence: economic?.confidence ?? null,
    requireEconomicPass: true,
    variantCount:
      typeof snap.variantCount === "number" ? snap.variantCount : null,
  });

  console.log(
    JSON.stringify(
      {
        id: c.id,
        status: c.status,
        title: c.title,
        merchandiserRecId: c.merchandiserRecId,
        importQueueItemId: c.importQueueItemId,
        supplier: c.supplier,
        supplierProductId: c.supplierProductId,
        gate,
        economic: economic
          ? {
              costNOK: economic.costNOK,
              shippingNOK: economic.shippingNOK,
              landedCostNOK: economic.landedCostNOK,
              retailNOK: economic.retailNOK,
              marginPct: economic.marginPct,
              confidence: economic.confidence,
              flags: economic.flags,
            }
          : null,
      },
      null,
      2
    )
  );

  if (c.importQueueItemId) {
    const q = await p.importQueueItem.findUnique({
      where: { id: c.importQueueItemId },
      select: {
        id: true,
        status: true,
        publishedAt: true,
        productId: true,
        lastError: true,
      },
    });
    console.log("QUEUE", JSON.stringify(q, null, 2));
  }

  const prod = await p.product.findFirst({
    where: { supplierProductId: c.supplierProductId },
    select: {
      id: true,
      name: true,
      isActive: true,
      supplierName: true,
      updatedAt: true,
    },
  });
  console.log("PRODUCT", JSON.stringify(prod, null, 2));
}

main()
  .then(async () => {
    await p.$disconnect();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error(e);
    await p.$disconnect();
    process.exit(1);
  });
