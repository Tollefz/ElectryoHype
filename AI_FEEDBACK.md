# AI Feedback Layer

Læringssløyfe fra **hvordan butikken presterer** — ikke bare Discovery.

Ekstra lag. Fjerner ingen eksisterende score-komponenter (Merch, Memory, DNA, Fokus, Assortment).

## Prinsipp

Feedback er **aldri absolutt**. Den gir en liten bonus eller straff (`±2` på Butikkscore).

Eksempel:

```
USB-C Hub — publisert 5×, solgt bra, høy margin, få refusjoner
→ confidence opp → liten positiv nudge på lignende produkter

RGB-mus — publisert 18×, solgt dårlig, mange refusjoner
→ confidence ned → liten negativ nudge
```

## Datakilder (nå)

| Signal | Kilde |
|---|---|
| Publisert | `Product.isActive` |
| Ikke publisert | Utkast + avviste kandidater |
| Slettet | Inaktiv / archived |
| Solgt | `OrderItem` på betalte ordre |
| Margin | `(price - supplierPrice) / price` |
| Returer | Proxy: `paymentStatus = refunded` |
| Lagerdager | Tid siden `lastInventoryCheck` / `createdAt` med stock |
| Prisendringer | `ProductCatalogVersion` kind=`price` |
| Leverandør | `Product.supplierName` |
| Levering | (delvis via ordre/tracking — utvides senere) |

## Stub (senere)

| Signal | Status |
|---|---|
| Klikk / visninger / PDP-konvertering | Ikke i DB ennå |
| Ekte retur-workflow | UI viser 0; bruker refund-proxy |

## API

`lib/buyer/ai-feedback.ts`

| Funksjon | Rolle |
|---|---|
| `rebuildAiFeedback()` | Aggregerer erfaringer → Setting `buyer_store_feedback` |
| `getAiFeedback()` | Cache 30 min |
| `scoreAiFeedback()` | `{ nudge, feedbackScore, why }` |
| `applyAiFeedbackNudge()` | Capped ±2 |

Nøkler: `family:…`, `supplier:…` (samme mønster som AI Memory).

## Score-stakk

```
Merch Brain
  + AI Memory (±3)
  + Store DNA (±2)
  + Feedback (±2)   ← dette laget
  = vist Butikkscore
```

## Mission Control

Seksjon **Feedback — butikkprestasjon**:

- Top Performing Product Types  
- Worst Performing Product Types  
- Lærer akkurat nå  
- Positive / negative erfaringer  
- Confidence over tid  
- Historikk per produktfamilie  

## Oppdatering

- Ved publisering (sammen med Store DNA)  
- Ved stale cache (30 min) når Mission Control / review laster  

## Relatert

- `AI_MEMORY.md` — jakt-erfaring (liked/avvist)  
- `STORE_DNA.md` — observert identitet  
- Discovery — hva vi søker (uendret)
