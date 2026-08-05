# Rob CEO

ElectroHypeX **administrerende direktør** på Rob's Desk.

**Ikke et dashboard.** Rob leser fakta fra AI-hjernene og foreslår — mennesket bestemmer alltid.

---

## Formål

Hver morgen (og ved oppdatering) skriver Rob:

```
God morgen.
Jeg analyserte butikken.

Buyer:
…

Marketing:
…

Orders:
…

Finance:
…

SEO:
…

Customer:
…
```

Rob **prioriterer** — lister ikke alt. Eksempler:

- Ordre trenger oppfølging
- Disse produktene bør annonseres
- Disse taper penger
- Disse bør publiseres
- SEO-problem her

---

## Regler

1. **Aldri finne på** — kun fakta fra Buyer, Marketing, Orders, Finance, SEO, Customer
2. **Aldri utføre** — ingen auto-publish, ads, refund, pris, e-post
3. **Alltid forklare** — hvorfor, hvilke data, hvor sikker (%), hvilken AI
4. **Approval Gate** — ✔ Publiser / ✔ Ignorer / ✔ Vis detaljer

---

## Arkitektur

```
AI Council (lib/council) ──► Rob CEO (lib/ceo) ──► DeskRobCeo + Approval Gate
         │
         └──► Mission Control (DeskAiCouncil)
```

Se `AI_MANAGEMENT_TEAM.md` for hvordan AI-ene kommuniserer og hvordan nye moduler plugges inn.

```
lib/ceo/
  types.ts
  extract.ts          # fakta-adaptere per domene (brukt av Council-medlemmer)
  prioritize.ts
  proposals.ts
  brief.ts            # morgenbrev fra Council-medlemmer
  ceo-desk-status.ts  # buildCeoDeskStatusFromSession(conveneCouncil())
  index.ts
```

SSR på dashboard blokkeres **ikke** — én `GET /api/admin/council` (mission + ceo).

---

## Approval Gate

| Handling | Betydning |
|----------|-----------|
| Publiser / Følg opp / Annonser | Lenke til riktig sted — Rob utfører ikke |
| Ignorer | Noterer forslag (ingen butikkhandling) |
| Vis detaljer | Utvider data + scroller til domene-widget |

---

## Kilder

| Domene | Kilde |
|--------|--------|
| Buyer | `getDigitalBuyerDeskStatus` + ImportQueue review/approved |
| Marketing | `getMarketingDeskStatus` (promote/pause + anbefalinger) |
| Orders | `getOrderBrainDeskStatus` (forsinket / risiko / attention) |
| Finance | `getFinanceDeskStatus` (tapere + anbefalinger) |
| SEO | `getSeoDeskStatus` (score / worst pages) |
| Customer | `getCustomerDeskStatus` (churn / VIP / kategori-forslag) |

Feil i én hjerne stopper ikke de andre (`Promise.allSettled`).
