# AI Marketing Brain

ElektroHypeX Marketing Engine — analyse, læring og anbefaling.

**Separat fra Product Buyer.**  
**Ingen automatiske kampanjer. Ingen AI som bruker penger.**

---

## Formål

Marketing Brain skal forstå butikkens markedsføring på samme måte som AI Buyer forstår produkter:

- lese trafikk og funnel-events
- lære hvilke produkter som klikkes, legges i kurv og kjøpes
- score produkter for *marketing potential* (uavhengig av Buyer Score)
- gi anbefalinger et menneske må godkjenne

Den skal **ikke**:

- endre annonser
- endre budsjett
- publisere kampanjer
- sende budendringer til Meta / Google / TikTok

---

## Arkitektur

```
lib/marketing/
  marketing-events.ts      # ingest + daily reaggregate (GA4-standard navn)
  marketing-score.ts       # CTR, conversion, margin, profit, … → overall
  marketing-memory.ts      # kampanjer/kanaler/sesong/CTR/ROAS + stories
  marketing-insights.ts    # analyser (ikke prediksjoner)
  marketing-brain-board.ts # Rob's Desk fakta-paneler (ingen LLM)
  ad-suggestions.ts        # ukentlige kanal-forslag (aldri publiser)
  marketing-dashboard.ts   # sessions, CTR, ATC, checkout, purchases, ROAS/CPA
  marketing-report.ts      # narrativ for Desk
  marketing-engine.ts      # advanceMarketingBrain() — én enhet arbeid
  marketing-worker.ts      # tick + loop + heartbeat (som Buyer/Order)
  marketing-dashboard.ts
  desk-status.ts           # Mission Control snapshot
  recommendations.ts       # actionRequired: true always
  beacon.ts                # klient → /api/marketing/events
  index.ts                 # public surface
```

```
Storefront events ──► dataLayer / Meta / GA4 / TikTok / Clarity
                   └─► POST /api/marketing/events ──► MarketingEvent
                                                      └─► MarketingDailyStat

Marketing Worker ──► reaggregate → rebuild Memory → score products
                 └─► MarketingProductScore + MarketingMemory

Rob's Desk / Mission Control ──► observasjon + anbefaling (ingen write til ads)
```

### Prisma

| Model | Rolle |
|-------|--------|
| `MarketingEvent` | Rå first-party events |
| `MarketingDailyStat` | Daglig funnel-rollup |
| `MarketingProductScore` | Per-produkt Marketing Score (≠ Buyer) |
| `MarketingMemory` | Lærte mønstre (high CTR, never bought, …) |

---

## Event-pipeline

Samme event-navn overalt (GA4 ecommerce):

`page_view` · `view_item` · `add_to_cart` · `begin_checkout` · `purchase` · …

Klient (`beaconMarketingEvent`) sender kun etter cookie consent.  
Server `purchase` lagres også via Stripe → `firePurchaseAnalytics`.

---

## Marketing Score (uavhengig av Buyer)

Pillars (0–100):

| Pillar | Signal |
|--------|--------|
| CTR | add_to_cart / view_item |
| Konvertering | purchase / view_item |
| Margin | pris vs leverandørkost |
| Profit | revenue i perioden |
| Popularity | volum (views/carts/purchases) |
| Store fit | kategori-preferanse |
| Inventory | aktiv / lager |
| Return risk | pris/margin-heuristikk |
| **Marketing potential** | vektet blend + memory nudge (±3) |

---

## Marketing Memory

Samme prinsipp som **Buyer AI Memory** — langtidshukommelse fra funnel, ikke chat.

Husker:

| Signal | Hvordan |
|--------|---------|
| Produkter | CTR, konvertering, kjøpsrate, never-bought |
| Kanaler | Meta / TikTok / Google / … med CTR, conv., estimert ROAS |
| Kampanjer | `utm_campaign` → volum + konvertering |
| Sesonger | Vår / Sommer / Høst / Vinter |
| Produkt × kanal | f.eks. «Gamingmus gjorde det bra på TikTok» |
| Historikk | siste rebuilds (score + topp-historie) |

**Stories** (Desk): menneskelige setninger med *Hvorfor*.  
**Anbefalinger**: Memory farger forslag — `actionRequired: true` alltid.  
**Nudge**: maks ±3 på Marketing Score (kan ikke redde dårlig performance).  
**Aldri**: endre bud, publisere ads, bruke penger.

Worker: `rebuildMarketingMemory()` i `advanceMarketingBrain()`.

---

## AI Ad Suggestions

`getWeeklyAdSuggestions()` — **foreslår** produkter per kanal. Lager/publiserer aldri.

Eksempel:

```
Denne uken anbefaler AI
Google Shopping: USB-C Hub, Gaming Keyboard
Meta: RGB Headset
TikTok: Mini projektor
```

Hver forslag forklarer med CTR, margin, lager, pris, Store DNA, Memory, Feedback og Marketing Score.

Visning: Rob’s Desk (`DeskMarketing`) + Mission Control. API: `?view=ad_suggestions`.

---

## Marketing Worker

Samme filosofi som Buyer Worker / Order Worker:

| Kanal | Hvordan |
|-------|---------|
| Dedicated | `npm run worker:marketing` |
| Internal cron | `POST /api/internal/marketing-worker` + `INTERNAL_CRON_TOKEN` |
| Inngest | `marketingBrainWorkerTick` hvert 5. minutt |
| Manuell | `POST /api/admin/marketing` `{ "action": "tick" }` |

Worker gjør:

1. Reaggregér daily stats  
2. Rebuild Marketing Memory  
3. Beregn Marketing Score for produkter med trafikk (+ katalog-baseline)  
4. Oppdater heartbeat i `Setting` (`marketing_brain_worker`)

---

## Mission Control

- **Rob's Desk** → widget `DeskMarketing` (live observasjon)
- **Fordypning** → `/admin/marketing` (ingen ny sidebar-meny)

Viser:

Sessions · CTR · Add to Cart · Checkout · Purchases · Conversion ·  
Traffic sources · Top / worst products · Marketing Score · Insights · Anbefalinger · Feil

---

## Anbefalinger

Eksempler når data finnes:

- «Flytt budsjett fra A til B» (manuelt)
- «Dette produktet bør annonseres»
- «Stopp kampanje X»

Alle har `actionRequired: true`. AI utfører **ingenting**.

---

## Relasjon til Buyer

| | Buyer | Marketing Brain |
|--|-------|-----------------|
| Domene | Katalog / import | Trafikk / konvertering |
| Score | Merch Brain / Butikkscore | Marketing Score |
| Memory | StoreMemory + buyer_ai_memory | MarketingMemory |
| Worker | buyer-hunt | marketing |
| Pengbruk | Nei (kun forslag) | Nei (kun forslag) |

De deler ikke score-lag og skriver ikke til hverandres state.
