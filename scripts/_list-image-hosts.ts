import { prisma } from "../lib/prisma";

function addHost(hosts: Set<string>, u: unknown) {
  if (typeof u !== "string" || !u.startsWith("http")) return;
  try {
    hosts.add(new URL(u).hostname);
  } catch {
    /* ignore */
  }
}

async function main() {
  const hosts = new Set<string>();

  const products = await prisma.product.findMany({
    select: { images: true },
    take: 500,
    orderBy: { updatedAt: "desc" },
  });
  for (const r of products) {
    if (typeof r.images === "string") {
      try {
        const parsed = JSON.parse(r.images);
        if (Array.isArray(parsed)) parsed.forEach((u) => addHost(hosts, u));
        else addHost(hosts, r.images);
      } catch {
        addHost(hosts, r.images);
      }
    }
  }

  const variants = await prisma.productVariant.findMany({
    select: { image: true },
    take: 300,
    where: { image: { not: null } },
  });
  for (const v of variants) addHost(hosts, v.image);

  const candidates = await prisma.buyerCandidate.findMany({
    select: { imageUrl: true },
    take: 200,
    orderBy: { createdAt: "desc" },
  });
  for (const c of candidates) addHost(hosts, c.imageUrl);

  const queue = await prisma.importQueueItem.findMany({
    select: { rawPayload: true },
    take: 50,
    orderBy: { createdAt: "desc" },
  });
  for (const q of queue) {
    const raw = q.rawPayload as Record<string, unknown> | null;
    if (!raw) continue;
    for (const key of ["imageUrl", "productImage", "bigImage"]) {
      addHost(hosts, raw[key]);
    }
    for (const key of ["images", "productImageSet"]) {
      const arr = raw[key];
      if (Array.isArray(arr)) arr.forEach((u) => addHost(hosts, u));
      if (typeof arr === "string") {
        try {
          const parsed = JSON.parse(arr);
          if (Array.isArray(parsed)) parsed.forEach((u) => addHost(hosts, u));
        } catch {
          addHost(hosts, arr);
        }
      }
    }
  }

  console.log([...hosts].sort().join("\n"));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
