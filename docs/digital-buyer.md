# Digital Buyer

Butikkens digitale innkjøper — aktiv discovery, ikke søkemotor.

Administrator søker ikke. AI leter kontinuerlig. Du sier **Importer** eller **Nei**.

## What it does

1. Checkpointed scan across all Supplier Providers (100 / 1 000 / 10 000)
2. Filters bad products (images, specs, stock, margin, shop fit, risk)
3. Shop match % with explanation
4. Ranking board (best-in-group only for multi-supplier)
5. Discovery tags (niche, premium, budget, complementary, new category)
6. Alternative supplier offers for existing catalog products
7. Product lifecycle: new / active / declining / discontinued / replace
8. Bulk import top N → Import Queue (never auto-publish)

## Reuses

- Merchandiser scoring (`analyzeSearchProduct`)
- Store Memory / shop profile
- Import Queue via `queueRecommendationsToImport`
- Workers (`buyer_scan_batch`) + Inngest hourly

## Admin

`/admin/buyer`

## Code

`lib/buyer/`
