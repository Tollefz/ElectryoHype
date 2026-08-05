# Throughput optimization — Database + CJ Search

Date: 2026-08-02  
Constraint: **no changes** to Discovery Scheduler, Merch Brain, ranking, or AI decision logic.

## Why Database was serial

Per product in the hunt loop the batch did:

| Write | When | Discovery impact |
|---|---|---|
| `buyerCandidate` upsert | awaited inline | Board / checkpoint only |
| `merchandiserRecommendation` upsert | awaited before candidate (kept) | Import mirror — not Discovery |
| Rank updates | only in `finalizeBuyerScan` | N/A mid-hunt |
| Memory / DNA / Feedback | not written in batch | N/A (0 ms) |

With `BATCH_EVAL_LIMIT=40` that was **~40–80 sequential Prisma roundtrips** per batch. Indexes (`@@unique([supplier, supplierProductId])`, `scanRunId`, etc.) were fine — the cost was roundtrip count, not missing indexes.

## Optimizations applied

### Database
1. Queue all candidate/merch writes in memory while scoring (CPU).
2. Flush once per CJ page via `flushBuyerCandidateWrites` (`lib/buyer/batch-writes.ts`).
3. Bounded parallelism (default **8** concurrent upserts, `BUYER_WRITE_CONCURRENCY`).
4. Merch mirror still written (needed for `merchandiserRecId` / publish) but in a parallel phase, not product-by-product with the scoring loop.

### CJ Search (Discovery-safe only)
1. **Prefetch next page** of the *same* query/sort while the DB flush runs — same pages, same products, same family rotation.
2. **Non-blocking** `supplierApiLog` write (was adding DB latency onto every CJ call).
3. Did **not** raise page size, parallelize different queries, or change rate limit (~1 QPS) — those would change Discovery cadence or risk 429s.

## Before → after (live batches)

Baseline (batches 46–48, pre-opt):

| | Batch 46 | Batch 47 | Batch 48 | Avg |
|---|---:|---:|---:|---:|
| Database | 7954 | 6807 | **8895** | 7885 |
| CJ Search | 3530 | 2732 | **4746** | 3669 |
| Total | 13461 | 10213 | 14259 | 12644 |

After (batches 49–51):

| | Batch 49 | Batch 50 | Batch 51 | Avg |
|---|---:|---:|---:|---:|
| Database | 3102 | 1777 | **2004** | **2294** |
| CJ Search | 5106 | 3915 | **4287** | 4436 |
| Total | 9854 | 6266 | 6846 | **7655** |

### Headline (matches requested format)

```
Database: 8895 ms
→
Database: 2004 ms   (± ~1.8–3.1 s across after-batches; avg 2294 ms)

CJ Search: 4746 ms
→
CJ Search: 4287 ms  (measured await; avg 4436 ms — API/QPS bound)
```

**Batch wall clock:** ~12.6 s → ~7.7 s avg (**~39% faster**).

### How to read CJ Search

Measured `CJ Search` is time spent *awaiting* search promises. Prefetch overlaps the next page with DB flush, so total batch time drops even when the CJ bucket stays ~4 s (first page cannot overlap; CJ ~1 QPS still applies). Pure network+QPS cost is unchanged by design.

## Unchanged by design

- Discovery family selection / `forceAdvance` / page size 20  
- Merch score & shop-match formulas  
- Ranking / finalize  
- Memory / DNA / Feedback algorithms (still not in write path)
