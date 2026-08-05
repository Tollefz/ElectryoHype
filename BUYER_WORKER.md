# Buyer Hunt Worker

AI Product Hunt runs as a **background process**. The admin dashboard only observes status — it does not drain the job queue.

## Flow

```
start_product_hunt / start_mission / resume
        │
        ▼
enqueue buyer_scan_batch  (SupplierJob, status=pending)
        │
        ▼
Buyer Hunt Worker claims job  (locked → running)
        │
        ▼
processBuyerScanBatch(scanRunId)
        │
        ├── may enqueue next buyer_scan_batch
        └── updates BuyerScanRun (scanned / kept / checkpoint)
        │
        ▼
Worker loop / cron ticks again → next pending job
```

Discovery Scheduler, Merch Score, and candidate ranking are unchanged. This layer only **executes** already-enqueued `buyer_scan_batch` jobs.

## What drains the queue

| Entry | Role |
|---|---|
| `npm run worker:buyer-hunt` | Preferred — continuous loop via **ts-node** (project `devDependency`) |
| Inngest `buyer-hunt-worker-tick` | Every minute — serverless safety net |
| `POST /api/internal/buyer-worker` | External cron with `x-internal-token: INTERNAL_CRON_TOKEN` |
| Admin `drain_workers` | Escape hatch only — not used by live UI |

```bash
npm install   # once after clone — no global tsx
npm run worker:buyer-hunt
```

Preloads `scripts/stub-server-only.cjs` and uses `tsconfig-paths` for `@/` imports. No manual installs.

## What does **not** drain

- `GET /api/admin/buyer` (including `poll=1` and `view=live`)
- Rob’s Desk / BuyerProductHunt polling
- Starting or resuming a hunt (enqueue only; worker picks up)

## Core module

`lib/buyer/buyer-worker.ts`

- `tickBuyerHuntWorker()` — one claim/execute cycle + metrics + warnings
- `runBuyerHuntWorkerLoop()` — dedicated long-running process
- `getBuyerHuntWorkerStatus()` — read-only metrics for the dashboard

Heartbeat and rolling scan samples are stored in Setting key `buyer_hunt_worker`.

## Warnings

Logged via `[buyer-hunt-worker]`:

1. **Idle > 60s** while pending `buyer_scan_batch` jobs exist (and this tick claimed nothing)
2. **Oldest pending job > 5 min** — includes job id and wait time
3. **Watchdog** — `pending > 0` and heartbeat stale ≥ 60s: logs why, last batch, last exception + stack

Stale recovery (in `lib/suppliers/workers/jobs.ts`):

- Buyer lock TTL **90 minutes** (batches often run 10–40 min)
- `running`/`locked` buyer batches older than **90 min** are recovered
- Never claim a second `buyer_scan_batch` for a scan that already has locked/running work

## Status (Mission Control)

| Status | Meaning |
|---|---|
| **Running** | Heartbeat &lt; 60s old **and** (`pending &gt; 0` or `claimed &gt; 0`) |
| **Idle** | Heartbeat &lt; 60s old **and** empty queue — will resume when jobs appear |
| **Stopped** | Heartbeat ≥ 60s old (process not pulsing) |

Heartbeat is pulsed at tick start, every **15s** during a long drain, and again at tick end (never stamped only at tick start — that caused false Stopped).

See `lib/buyer/WORKER_STOPPED_ROOT_CAUSE.md`.

## Metrics

Exposed on admin buyer responses (`ops` / `metrics` / `worker`):

| Metric | Meaning |
|---|---|
| `pendingJobs` | Pending/failed claimable batches |
| `claimedJobs` | Locked + running batches |
| `jobsPerMinute` | Succeeded batches / min (10 min window) |
| `avgWaitMs` | createdAt → startedAt (recent succeeded) |
| `avgRuntimeMs` | startedAt → finishedAt (recent succeeded) |
| `productsPerMin` | Scan `scanned` delta over worker samples (~10 min) — **not** wall-clock since hunt start |
| `lastActiveWorker` / `lastActiveAt` | Last worker that claimed or finished work |

UI copy «AI leter etter produkter» uses `ops.productsPerMin` from these metrics so stall periods do not inflate speed.

## Local / VPS

```bash
npm run worker:buyer-hunt
```

Keep this process running alongside `next start` (or as a separate service). SIGINT/SIGTERM stop the loop cleanly.

## Serverless

Ensure Inngest is registered (`/api/inngest`) so `buyer-hunt-worker-tick` runs every minute. Optionally schedule:

```http
POST /api/internal/buyer-worker
x-internal-token: <INTERNAL_CRON_TOKEN>
```

## Design rules

- Dashboard **reads** worker status; it never drives hunt progress.
- New jobs are picked up automatically by the worker/cron without UI polling.
- Do not reintroduce opportunistic `runSupplierWorkers` on admin GET.

## AI Mission Control

Read-only diagnosis panel for the full Product Hunt chain:

- UI: `/admin/buyer` → **AI Mission Control**
- API: `GET /api/admin/buyer?view=mission_control`
- Aggregator: `lib/buyer/mission-control.ts` (`getMissionControlSnapshot`)

Shows worker, discovery, scanner, candidates, merch pillars, economy, system, AI Memory, and 24h timeline. Never mutates AI state.

## AI Store Memory

See `AI_MEMORY.md`. Experience patterns from hunts feed a capped (±3) Butikkscore nudge — never changes Discovery/Merch/Worker internals.
