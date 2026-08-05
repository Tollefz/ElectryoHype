# AI Finance Brain

ElektroHypeX Finance Brain — **butikkens økonomisjef**.

**Separat fra Buyer, Marketing og Order Brain.**  
**Ingen automatiske prisendringer. Kun anbefalinger.**

---

## Formål

Forstå om butikken tjener penger:

| Signal | Betydning |
|--------|-----------|
| Margin | (pris − leverandørkost) / pris |
| Profit / fortjeneste | Brutto og netto (est.) |
| ROI | Bruttofortjeneste ÷ leverandørkost |
| ROAS / CPA / CAC | Når adSpend finnes |
| Valuta | USD/NOK |
| Frakt | Innkrevd frakt (Order.shippingCost) |
| Leverandørkostnader | Product.supplierPrice × antall |

---

## Dashboard (Rob’s Desk)

**Finance Brain · Økonomisjef** (`#desk-finance`)

Perioder:

- **I dag** (1 d)
- **Uke** (7 d)
- **Måned** (30 d)

Lister:

- Beste produkter (fortjeneste)
- Verste produkter (tap / lav margin)
- Høyeste margin
- Laveste margin

---

## AI Insights

Eksempler:

> Powerbanks gir 31 % høyere snittmargin enn gamingmus.

> Disse produktene taper penger.

Bygget fra fakta (ordre + katalog + Memory) — ikke LLM-oversettelse.

---

## Arkitektur

```
lib/finance/
  finance-math.ts          # margin, profit, ROI, Stripe-est.
  finance-dashboard.ts     # rollups + produktlister
  finance-periods.ts       # i dag / uke / måned
  finance-insights.ts
  finance-memory.ts        # familie-sammenligning
  finance-recommendations.ts
  finance-desk-status.ts
  finance-worker.ts
  …
```

API: `GET /api/admin/finance?view=desk_status&days=1|7|30`

---

## Hardregler

1. Aldri endre priser automatisk  
2. Anbefalinger har alltid `actionRequired: true`  
3. Ikke fullt regnskap / MVA / bilag  
4. Separat fra Buyer-import og ads-publisering  
