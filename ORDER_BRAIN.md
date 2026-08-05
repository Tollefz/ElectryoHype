# AI Order Brain

ElektroHypeX Order Brain — forstå hele ordre-livssyklusen.

**Separat fra Product Buyer og Marketing Brain.**  
**Ingen automatiske refusjoner. Ingen automatiske kundeavgjørelser.**

---

## Formål

Order Brain skal forstå ordrene på samme måte som Buyer forstår produkter og Marketing forstår trafikk:

- følge alle betalte ordre
- overvåke status / fulfillment-faser
- oppdage forsinkelser og tracking-avvik
- lære av leverandører, produktfamilier og frakt
- forklare *hvorfor* på Rob’s Desk

Den skal **ikke**:

- refundere automatisk
- kansellere på vegne av kunden
- sende «unnskyld»-avgjørelser uten menneske
- blande seg inn i Buyer-import eller Marketing-ads

Fulfillment-utførelse (CJ send, tracking poll) lever i samme `lib/orders/`-modul via Order Worker — Brain er intelligenslaget oppå.

---

## Arkitektur

```
lib/orders/
  order-engine.ts       # advanceOrder (fulfillment) + advanceOrderBrain (memory)
  order-worker.ts       # tick / loop / heartbeat (+ brain rebuild cadence)
  order-memory.ts       # leverandør / familie / frakt-mønstre
  order-events.ts       # append-only automation events
  order-insights.ts     # døgn / behandling / sendt / levert / forsinket / avvik
  order-dashboard.ts    # tall-rollup
  order-report.ts       # narrativ
  order-desk-status.ts  # Rob's Desk snapshot
  order-state-machine.ts
  tracking.ts / cj-fulfillment.ts / …
  index.ts
```

```
Betalt ordre ──► Order Worker ──► phase machine (CJ / tracking)
                              └─► advanceOrderBrain() (ca. hvert 5. min)
                                      └─► Order Memory (Setting)

Rob's Desk ──► DeskOrderBrain (fakta) + DeskOrderAutomation (kø)
```

---

## Order Worker

Samme filosofi som Buyer Worker:

| Kanal | Hvordan |
|-------|---------|
| Dedicated | `npm run worker:order` |
| Internal cron | `POST /api/internal/order-worker` |
| Escape hatch | `POST /api/admin/orders/automation` `{ action: "tick" }` |
| Brain only | `{ action: "brain_tick" }` |

Worker:

1. Claim betalte ordre i aktive faser  
2. `advanceOrder` — valider, send CJ, hent tracking, varsle  
3. Periodisk `advanceOrderBrain` — rebuild Memory  

---

## Order Memory

Lærer (eksempel):

| Signal | Eksempel |
|--------|----------|
| Leverandør | «X: rask levering, få problemer» / «Y: mange forsinkelser» |
| Produktfamilie | høy kansellering / forsinkelse |
| Frakttype | mange tracking-avvik |

Lagring: `Setting` key `order_brain_memory`.  
Nudge-cap ±3 (forklarbart) — brukes ikke til auto-handling.

**Forsinkelse (fakta-terskler):**

- ≥ 5 dager i `ORDERED` / `SENT_TO_CJ` uten tracking  
- ≥ 14 dager i `SHIPPED` uten levering  

---

## Order Insights

Svarer med spørsmål → tittel → detalj → **Hvorfor**:

- Ordre siste døgn  
- Under behandling  
- Sendt  
- Levert  
- Forsinket  
- Avvik  
- Kansellert  

Ingen LLM — kun databasefakta.

---

## Rob’s Desk — Order Brain

Viser:

- Ordre som trenger oppmerksomhet  
- Forsinkede ordre  
- Høy risiko (error-faser)  
- Leverandørproblemer (Memory)  
- Tracking-avvik  

API: `GET /api/admin/orders/automation?view=brain`

---

## Hardregler

1. **Mennesket bestemmer** overfor kunden.  
2. **Ingen auto-refusjon.**  
3. **Separat** fra Buyer score og Marketing ads.  
4. Worker kan sende til CJ / hente tracking (eksisterende automation) — Brain foreslår oppmerksomhet, ikke pengehandlinger.

---

## Relatert

- Fulfillment state machine: `order-state-machine.ts`  
- Marketing parallel: `MARKETING_ENGINE.md`  
- Buyer parallel: `AI_MEMORY.md` / Buyer worker  
