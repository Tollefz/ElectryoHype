# Worker «Stopped» with pending jobs — root cause

Date: 2026-08-02  
Severity: production-critical

## Symptom

Mission Control showed **Stopped** while `buyer_scan_batch` jobs sat `pending` for hours (live: 2 pending ~163 min, `tickAgeSec` ~9780).

## Root causes (two layers)

### 1. False Stopped while the process is alive (code bug)

`tickBuyerHuntWorker` stamped `lastTickAt` with a `Date` captured **at the start** of the tick, then `await runSupplierWorkers(...)` which can run for minutes.

After a long batch:

- Heartbeat age ≈ batch duration (often ≫ 90s)
- `claimedJobs` already 0
- Status derivation required `tickAgeMs < 45s` **and** `idleMs < 60s` for Running

⇒ Mission Control flipped to **Stopped** even though the loop was about to sleep 250ms and tick again.

`idleMs` was anchored on `lastActiveAt` (claim time), so any batch longer than 60s also failed the Running gate.

### 2. True Stopped — nothing was ticking (ops + safety net)

Live diagnosis before the fix: no heartbeat for ~2.7h, jobs still claimable (a manual tick drained one immediately). So the dedicated `npm run worker:buyer-hunt` process was **not running**, and the Inngest minute cron was **not** refreshing heartbeat either (not deployed / not receiving / failing before `saveState`).

Stopped was then *accurate* — but pending work was abandoned.

## What we ruled out

| Hypothesis | Result |
|---|---|
| Event loop empty / loop `return` | Loop only exits on `AbortSignal`; tick errors are caught and retried |
| DB lock makes worker exit | No; claim simply returns 0 while a sibling `running` job exists |
| Idle detection stops the process | Idle only affects sleep duration and warnings, not exit |
| Promise rejection always kills Node | Possible on unhandledRejection — hardened (log, do not exit) |
| Pending jobs unclaimable | False — `runAfter` OK, claim succeeded on diagnostic tick |

## Fixes (not workarounds)

1. **Heartbeat = end of tick** (`Date.now()` after drain), plus **immediate pulse** at tick start and **15s mid-batch pulses** so long drains stay Running.
2. **Status semantics**
   - `stopped` — heartbeat age ≥ 60s
   - `running` — fresh heartbeat and (`pending > 0` or `claimed > 0`)
   - `idle` — fresh heartbeat and empty queue  
   (removed the broken `idleMs < 60s` Running gate)
3. **Internal watchdog** — if `pending > 0` and heartbeat stale ≥ 60s: log why, last batch, last exception + stack (throttled 60s). Surfaced on Mission Control read path too.
4. **Persist** `lastBatch` + `lastException` on worker setting for forensics.
5. **Process hardening** — `unhandledRejection` / `uncaughtException` log without exiting; tick errors never break the loop.
6. Loop treats `pending > 0` or `claimed > 0` as busy (tight sleep).

## Verification checklist

| Check | Expected |
|---|---|
| Pending always claimable when process ticks | Yes (unless sibling running / `runAfter` future) |
| Worker never exits while pending > 0 | Loop keeps going; only SIGINT/SIGTERM abort |
| Resumes after empty queue | Idle sleep 2s, then tick again |
| Heartbeat continuous | Pulse every ≤15s during drain; end-of-tick stamp |
| Mission Control Running / Idle / Stopped | Matches heartbeat + queue rules above |

## Ops requirement

Keep **`npm run worker:buyer-hunt`** running as a supervised process (pm2/systemd/Docker restart). Inngest remains a safety net — confirm it is actually delivering `buyer-hunt-worker-tick` in the target environment.
