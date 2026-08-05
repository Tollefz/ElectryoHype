# AI CRM / Customer Brain

Butikkens **CRM** — ikke et markedsføringsverktøy.

Customer Brain lærer av kundene og bygger profiler.  
**Kun forståelse + anbefaling.** Aldri auto-e-post, rabatt eller kampanjer.

---

## AI skal forstå

| Signal | Kilde |
|--------|--------|
| Hvor kunden kommer fra | MarketingEvent.source via `transactionId` = ordreummer (best-effort) |
| Hvilket språk | `Customer.locale` → Locale / Language Profile |
| Hva kunden liker / kjøper | Kjøpstittler + kategorier → segmenter |
| Gjennomsnittlig ordre (AOV) | Betalte ordrer |
| Favorittkategori | Hyppigste produktkategori |
| Livstidsverdi (LTV) | Sum betalte ordrer |
| Kjøpshistorikk | Siste ordrer på profilen |

---

## Profiler (personas)

| Id | Persona |
|----|---------|
| gaming | Gaming-entusiast |
| mobil | Mobil |
| apple | Apple-bruker |
| smart_home | Smart Home |
| kontor | Kontor |
| premium | Premium-kunde |
| prisbevisst | Prisjeger |

---

## Mission Control (Rob’s Desk)

Widget: **AI CRM · Customer Brain** (`#desk-customer`)

- Nye kunder  
- Tilbakevendende  
- VIP  
- Churn-risiko  
- Høy livstidsverdi  
- Toppsegmenter  
- **AI anbefaler** (kategori, ikke annonse)

---

## AI anbefaler (kun forslag)

```
Denne kunden passer best med: Gaming · ikke Mobil
```

Alltid `actionRequired: true`. Mennesket bestemmer.

---

## Arkitektur

```
lib/customer/
  customer-brain.ts       # CRM snapshot + mission cohorts
  customer-score.ts       # LTV, AOV, locale, source, history, persona
  customer-segments.ts    # personas + recommend headline
  customer-memory.ts
  customer-insights.ts
  customer-desk-status.ts
  index.ts
```

API: `GET/POST /api/admin/customers/brain`

---

## Hardregler

1. Ikke markedsføring — ingen auto-send  
2. Separat fra Buyer / Marketing ads / Order fulfillment  
3. Communication Engine eier språkmaler; CRM eier *hvem kunden er*  
4. Likes/ønskeliste: fremtidig signal når data finnes  

Se også `CUSTOMER_BRAIN.md` (kort oversikt) og `COMMUNICATION_ENGINE.md` (locale).
