import { getBuyerReviewOverview, listBuyerReviewPage } from "../lib/buyer/review-board";

async function main() {
  const overview = await getBuyerReviewOverview({});
  console.log("OVERVIEW", {
    total: overview.total,
    groups: overview.groups.map((g) => ({ id: g.id, count: g.count })),
  });

  const p1 = await listBuyerReviewPage({ group: "all", page: 1, pageSize: 100 });
  const p2 = await listBuyerReviewPage({ group: "all", page: 2, pageSize: 100 });
  const margin = await listBuyerReviewPage({
    group: "ai-confident",
    page: 1,
    pageSize: 100,
    sort: "margin",
  });

  console.log("PAGE1", {
    total: p1.total,
    items: p1.items.length,
    pages: p1.totalPages,
    sort: p1.sort,
  });
  console.log("PAGE2", {
    total: p2.total,
    items: p2.items.length,
    page: p2.page,
  });
  console.log("SORT_MARGIN", {
    total: margin.total,
    firstMargin: margin.items[0]?.marginPct,
    lastMargin: margin.items[margin.items.length - 1]?.marginPct,
    sorted:
      margin.items.every(
        (c, i, arr) =>
          i === 0 || (c.marginPct ?? 0) <= (arr[i - 1].marginPct ?? 0)
      ),
  });

  const gaming = await listBuyerReviewPage({ group: "gaming", page: 1, pageSize: 100 });
  console.log("GAMING", { total: gaming.total, items: gaming.items.length });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
