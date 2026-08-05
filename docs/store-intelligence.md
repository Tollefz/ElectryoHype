# Store Intelligence — AI Category Manager

Digital kategoriansvarlig for ElectroHypeX.

Not a standalone AI toy — a layer on top of:

- Product catalog
- Supplier Engine
- AI Merchandiser
- Import review
- Ops queues

## Admin

- `/admin/intelligence` — Store Intelligence (top-level, same level as Rob’s Desk)
- Rob’s Desk → «Hva bør jeg gjøre i dag?»

## Flow

```
Catalog + Merchandiser + Review queues
            ↓
   Category Health scoring
            ↓
 Assortment gaps + complement ecosystems
            ↓
 Living Shop Profile (auto-refresh)
            ↓
 Daily tasks + recommendations (with why)
            ↓
 Admin decision → Preference learning
```

## Principles

1. Explain every recommendation.
2. Admin always decides (accept / dismiss stored for learning).
3. No supplier-specific code.
4. Future signals (Trends, GA, Ads, returns…) stubbed in `lib/intelligence/signals.ts`.

## Code

`lib/intelligence/`
