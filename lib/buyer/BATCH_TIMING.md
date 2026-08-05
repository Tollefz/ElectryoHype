# Buyer batch timing — measurement report

Date: 2026-08-02  
Sample: **3 consecutive batches** (46–48) on live hunt `cms9g1qzh00f4vf80v7ufeq6b`  
Policy: **measure only** — no throughput optimizations in this step.

> **Update:** Database + CJ I/O optimizations landed afterward. See `THROUGHPUT_OPT.md` for before/after (Database 8895→~2004 ms).

## Example log (Batch 48)

```
Batch 48
scanned +40 (kept 19, filtered 21)
Discovery: 247 ms
CJ Search: 4746 ms
Product fetch: 0 ms
Price: 3 ms
Shipping: 0 ms
Currency lookup: 0 ms
Matching: 0 ms
Merch Score: 1 ms
Memory: 241 ms
Store DNA: 0 ms
Feedback: 0 ms
Database: 8895 ms
Other: 125 ms
Total: 14259 ms
```

## Aggregate (3 batches)

| Wall total | ~37.9 s |
| Products evaluated | 120 (40 × 3) |
| Avg batch | ~12.6 s |
| Effective | ~3.2 products/s inside a batch |

## Top 10 bottlenecks

| # | Stage | Avg ms/batch | % of wall | Notes |
|---|---|---:|---:|---|
| 1 | **Database** | 7885 | **62.4%** | Sequential `buyerCandidate` + `merchandiserRecommendation` upserts per product |
| 2 | **CJ Search** | 3669 | **29.0%** | Blocking `searchProducts` (1–2 calls/batch) |
| 3 | **Discovery** | 656 | **5.2%** | Mostly `loadDiscoveryContext` (catalog snapshot) once/batch; scheduler CPU ≪ 1 ms |
| 4 | **Memory** | 228 | **1.8%** | Almost entirely `getOrCreateStoreMemory` once/batch |
| 5 | **Other** | 200 | **1.6%** | Provider checks, gate/filter, seen-set, progress assembly |
| 6 | Price | 4 | ~0% | Sync landed/retail math |
| 7 | Merch Score | 2 | ~0% | Sync dimensions |
| 8 | Matching | &lt;1 | ~0% | Sync `computeShopMatch` |
| 9 | Shipping | &lt;1 | ~0% | Sync weight/estimate |
| 10 | Currency lookup | ~0 | ~0% | Sync cached FX |

Not in hunt batch path (always **0 ms** in this sample):

- **CJ product fetch** — hunt uses search cards only (`analyzeSearchProduct`), never `getProduct`
- **Store DNA** — display-time nudge, not batch
- **Feedback** — display-time nudge, not batch

## Where time actually goes

```
Batch wall ≈ 12–14 s
 ├── Database upserts (serial, per product)     ~60–65%
 ├── CJ search API                              ~25–35%
 ├── loadDiscoveryContext + store memory load   ~5–7%
 └── Scoring / price / match / FX              ≪ 1%
```

Scoring algorithms are **not** the throughput problem.

## Likely causes (for later optimization — do not change yet)

1. **Sequential DB writes** — each kept product does 2 upserts; filtered does 1; all awaited one-by-one inside the product loop (`BATCH_EVAL_LIMIT = 40`).
2. **No write batching** — no `createMany` / transaction bulk / parallel upsert pool.
3. **CJ search is serial and blocking** — next page/family waits on previous search; no prefetch of next page.
4. **Repeated heavy setup each batch** — `loadDiscoveryContext` + `getOrCreateStoreMemory` reloaded every batch (first batch Discovery 1483 ms).
5. **Duplicate mirror write** — every kept row writes both `MerchandiserRecommendation` and `BuyerCandidate`.
6. **Not a factor:** product detail API, DNA, Feedback, price/FX CPU, Merch dimension math.

## How to re-measure

```bash
# Prefer continuous worker; logs appear as:
# Batch N
# Discovery: … ms
# …

# Or probe:
set NODE_OPTIONS=--require=./scripts/stub-server-only.cjs
set BATCH_TIMING_RUNS=3
npx ts-node --transpile-only -r tsconfig-paths/register -r dotenv/config \
  -O "{\"module\":\"CommonJS\",\"moduleResolution\":\"node\"}" \
  scripts/run-batch-timing.ts
```

Persisted aggregate: Setting key `buyer_batch_timing` (`top10`, `reports`, `lastLog`).

Instrumentation: `lib/buyer/batch-timing.ts` + hooks in `scan.ts` / pricing / scoring.
