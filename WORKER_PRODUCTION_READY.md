# Worker layer — production ready

**Declared:** 2026-08-02  
**Scope:** Buyer Hunt Worker lifecycle (`lib/buyer/buyer-worker.ts`, `scripts/buyer-hunt-worker.ts`, Mission Control status).  
**Not in scope:** Discovery / Merch / ranking algorithms, CJ API quota, batch I/O throughput.

No further lifecycle defects were found in code review or the 2h soak. The worker layer is **production-ready** when the dedicated process stays supervised (`npm run worker:buyer-hunt`).

---

## Lifecycle verification (code)

| Check | Result |
|---|---|
| Tick cadence (busy) | Loop sleeps **250 ms** when `claimed > 0` or queue non-empty |
| Tick cadence (idle) | Loop sleeps **2 s** when queue empty |
| Mid-drain heartbeat | Pulse every **15 s** (`HEARTBEAT_PULSE_MS`) + pulse at tick start + stamp at tick end |
| Stopped threshold | Heartbeat age ≥ **60 s** |
| Pending claim speed | Next tick after busy sleep (~250 ms) once single-flight lock frees |
| Unnecessary pending wait | Only when another job is `locked`/`running` for the same `scanRunId` (by design), or `runAfter` in the future |
| Idle while work exists | **Impossible** by `deriveStatus`: fresh HB + (`pending > 0` \|\| `claimed > 0`) ⇒ Running |
| Polling / safety net | Dedicated loop preferred; Inngest `buyer-hunt-worker-tick` every minute |
| Heartbeat = activity | `lastTickAt` reflects live pulses / tick boundaries — not “batch finished” |
| Watchdog false alarms | Fires only when `pending > 0` **and** HB stale ≥ 60 s; throttled 60 s; idle-with-pending warn requires `claimedJobs === 0` |
| Mission Control | Running / Idle / Stopped from same derive; `stalePendingAlert` only when `pending > 0` && `status === "stopped"` |
| Crash resilience | Tick errors do not exit the loop; `unhandledRejection` / `uncaughtException` log without process exit |

---

## Stability soak (2 hours)

| Field | Value |
|---|---|
| Window | 2026-08-02T14:13:05Z → 16:13:06Z (2.0 h) |
| Sample interval | 30 s |
| Samples | 234 |
| Report | `scripts/_worker-soak-report.json` |
| Monitor | `scripts/worker-soak-monitor.ts` |
| Worker | `npm run worker:buyer-hunt` (supervised for this test) |

### Throughput

| Metric | Value |
|---|---|
| Products scanned (delta) | **1920** (2080 → 4000) during active hunt |
| Active-hunt rate | **~50 products/min** over ~38 min of productive scanning |
| Soak-window average | 16.0 products/min (diluted by ~1.3 h Idle after hunt ended) |
| Peak products/min (sampled) | 278 |
| Jobs started / succeeded | **50 / 50** |

### Queue & heartbeat

| Metric | Value |
|---|---|
| Highest oldest-pending wait | **1864 s** (~31 min) — during CJ **API points exhausted** retry on one running job; not an idle/claim bug |
| Healthy claim-behind wait (pre-CJ outage) | typically **3–13 s** (max ~30 s); first sample 398 s was pre-soak backlog |
| Claimed jobs (DB started in window) | 50 |
| Heartbeat updates observed | **234 / 234** samples (every sample saw a fresh `lastTickAt`) |
| Max `tickAge` while work present | **15 s** (matches pulse interval) |
| Avg `tickAge` (all samples) | ~3 s |
| Periods without activity (work present, HB ≥ 90 s) | **none** |
| Idle while work | **0** |
| Stopped while work | **0** |
| Watchdog samples | **0** (no false alarms) |
| Status mix | Running 75 · Idle 159 · Stopped 0 |

### External incident (not a worker defect)

From ~14:21Z, job `cmsbw0nyr03opvf6sw1yinzsh` stayed `running` while CJ returned **Insufficient API points**. The worker kept pulsing; Mission Control correctly stayed **Running**; the next pending job waited behind single-flight until the job finished. When the hunt queue emptied, status correctly became **Idle** with continuous heartbeats for the rest of the soak.

---

## Ops requirement

Production readiness of this layer still requires:

1. **Dedicated process** kept alive (`pm2` / systemd / Docker restart policy) via `npm run worker:buyer-hunt`
2. Inngest tick as safety net only — do not rely on it alone for continuous drain
3. CJ daily API points available for long hunts (quota is outside the worker)

---

## Verdict

**WORKER LAYER: PRODUCTION READY**

Verified: tick/sleep intervals, claim latency under load, no false Idle/Stopped with work, heartbeat fidelity, watchdog quiet when healthy, Mission Control status across Running → Idle, and a clean 2h soak with zero inactivity gaps while work existed.
