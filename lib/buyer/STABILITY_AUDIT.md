# AI Product Buyer — Stability Audit

Date: 2026-08-02  
Scope: live long hunt (~37h wall-clock) + worker/queue/discovery/ranks/Mission Control  
Policy: no new product features — observe, document, fix root causes only.

## Verdict

**Not production-ready before this revision.** Three stability-critical defects were confirmed and fixed. After fixes, continuous operation depends on keeping `npm run worker:buyer-hunt` (or Inngest minute tick) alive.

| Check | Before | After fix |
|---|---|---|
| Stuck batches | 1 zombie `running` ~71h | Recovered → dead; concurrent guard added |
| Worker never stops | Heartbeat OK; processing intermittent | Heartbeat OK; 90 min buyer lock + stale recovery |
| Heartbeat continuous | Yes (Inngest/loop ticks) | Yes |
| Discovery rotates families | Stalled on MagSafe (367 products, 2 decisions / 17h) | Page cap 3 + `pagesOnCurrent` increment |
| Candidate list refreshes | Yes (new rows / upserts) | Yes |
| Old ranks not reused | **FAIL** — 743 carried ranks | Cleared; upsert sets `rank: null` until finalize |
| Mission Control live truth | Mixed / stale rank top-20 | Scoped to active scan; live sort by shopMatch |

## Live snapshot (pre-fix observation)

- Scan `cms9g1qzh00f4vf80v7ufeq6b`: running, **1800 / 50000** scanned, kept 919, age ~37h
- Wall-clock ~0.8 products/min (misleading — large idle gaps)
- Worker: `lastTickAt` fresh; `lastActiveAt` only when claiming
- Queue 24h: 19 succeeded, large gaps (max ~8h) from period without dedicated worker
- Candidates last hour: ~29; growth continues when batches run
- Memory / DNA / Feedback settings present and rebuilding
- Economy sample: 0 below 35% margin; 5/100 `economicControlFailed`

## Root causes fixed

### 1. Stale `running` jobs never recovered

`claimJobs` only claims `pending`/`failed`. A crashed worker left `buyer_scan_batch` in `running` forever (observed ~71h, `worker-bb1f4668`).

**Fix** (`lib/suppliers/workers/jobs.ts`):

- `recoverStaleSupplierJobs()` before each drain
- Buyer lock **90 min** (batches often 10–40 min; old 5 min lock was wrong)
- If another locked/running batch owns the same `scanRunId`, stale job → **dead** (no dual-write)
- Claim skips a second batch for a scan that already has locked/running work

### 2. Discovery did not rotate while paging

`reusePaging` (page > 1) never incremented `pagesOnCurrent` and never called the scheduler until CJ exhausted pages. MagSafe could page for hundreds of products with only 2 logged decisions.

**Fix** (`lib/buyer/scan.ts`):

- Cap reuse at `MAX_PAGES_PER_FAMILY = 3` (matches scheduler stay window)
- Increment `pagesOnCurrent` on each reused page
- Force `resolveNextDiscoverySeed({ forceAdvance: true })` after the cap

### 3. Old ranks reused across hunts

`BuyerCandidate` is unique on `(supplier, supplierProductId)`. Upsert moved rows to the new `scanRunId` but **kept** `rank` from a prior `finalizeBuyerScan`. Mission Control sorted by `rank asc`, so gaming products from an earlier finalize stayed “top” during a MagSafe hunt.

**Fix**:

- Upsert update sets `rank: null` (kept + filtered paths)
- One-shot `ranksInvalidatedForHunt` clears ranks for the active scan
- Mission Control: filter by active `scanRunId`; while running/queued sort by `shopMatchPct` / `overallScore`

## Confirmation checklist (ops)

1. Run `npm run worker:buyer-hunt` continuously in production (Inngest is safety net only).
2. Re-run `scripts/stability-audit-buyer.ts` after 2–4 hours of uninterrupted worker:
   - `stuckOver5min == 0`
   - `gapOver30min` should drop sharply
   - Discovery `lastDecisions` should show multiple families
   - `ranks.withRank` mid-hunt should stay ~0 until finalize
3. Open Mission Control: Merch top-20 must match current hunt scores, not old ranks.

## Layers (Memory / DNA / Feedback)

Observed healthy rebuild timestamps and non-empty patterns. These are advisory nudges only (±3 / ±2 / ±2) and did not cause hunt stalls.

## Economic validation

Sample of recent ranked candidates: margin floor OK in sample; a few `economicControlFailed` flags — monitor, not a hunt stopper.

## Tooling

```bash
# Read-only audit JSON to stdout
npx ts-node --transpile-only -r dotenv/config \
  -O "{\"module\":\"CommonJS\",\"moduleResolution\":\"node\"}" \
  scripts/stability-audit-buyer.ts
```

(With `NODE_OPTIONS=--require=./scripts/stub-server-only.cjs` if importing server-only modules.)
