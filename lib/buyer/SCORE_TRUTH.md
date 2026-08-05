# AI Product Buyer — score truth (single brain)

**Do not add parallel scorers.** Every buyer ranking path must use these.

| Score | Single implementation | Consumers |
|-------|----------------------|-----------|
| Discovery priority | `scoreFamilyNeedV3` + `huntFatigueMultiplier` in `hunt-store-builder.ts` | `discovery-scheduler.ts` |
| Shop match (persisted) | `computeShopMatch` in `match.ts` | scan → `BuyerCandidate.shopMatchPct` |
| Explainable match | `buildExplainableMatch` in `explainable-match.ts` | **Narrative UI only** — not sort truth |
| **Store Identity Fit** | `scoreStoreIdentityFit` in `lib/identity/` | **before** Merch Brain; publish gate |
| Assortment | `scoreAssortmentFit` in `assortment-score.ts` | brain pillar + finalize |
| Produktfokus | `scoreProductFocus` in `product-focus-core.ts` | brain pillar + finalize |
| Landed cost / margin / FX | `validateEconomics` + `calculateSupplierPricing` | pricing-advice, publish gate |
| Shipping by weight | `estimateShippingByWeight` in `suppliers/pricing.ts` | supplier pricing + economic validation |
| Butikkscore | `computeMerchBrain` in `merch-brain.ts` | hunt rank, cards, aliases |
| Supplier risk | `supplier-risk.ts` → brain pillar | publish revalidate sightings |
| Margin policy | `margin-policy.ts` (hard 25 / soft 35) | econ + auto-publish |

## Merch Brain caps (always sum 100)

| Pillar | Max pts |
|--------|---------|
| Sortiment | 18 |
| Produktfokus | 14 |
| Profit | 11 |
| Margin | 10 |
| Levering | 9 |
| Lager | 9 |
| Konkurranse | 8 |
| Demand | 7 |
| Økonomisk sikkerhet | 8 |
| Supplier stability | 6 |
| **Sum** | **100** |

Store Identity Fit er **eget lag** (0–100) før Merch Brain — ikke en ny pillar. Lav fit demoterer ranking og kan blokkere publish.

## Pipeline (no hidden steps)

```
CJ → Discovery Scheduler → Scanner (analyze + shop match + pricing/econ)
  → filter → BuyerCandidate
  → finalize: Store Identity Fit → Merch Brain rank
  → Buyer API → Frontend
  → approve: live econ + identity gate → publish
```

## Out of buyer scope (do not mix)

- `lib/import/product-score.ts` (0–10 import preview)
- `lib/import/pricing.ts` landed without VAT (Temu/catalog import)
- Merchandiser 12-dim overall (feature extractor feeding shop match)

## Aliases (thin wrappers — do not fork logic)

- `computeStoreBuilderMerchScore` → brain
- `computeMerchandisingScore` → brain
