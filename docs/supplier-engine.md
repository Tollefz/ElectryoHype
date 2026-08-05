# Supplier Engine — Enterprise Architecture

ElectroHypeX Supplier Engine is a **supplier-agnostic catalog platform**.
CJ and CSV are plugins. The rest of the system never branches on vendor internals.

Audience: a new engineer should understand the system from this document before reading code.

---

## 1. Goals

- Support multiple suppliers and **multiple accounts per supplier**
- Import / review / publish at scale (hundreds of thousands of products)
- Continuous sync with **policy-driven** updates (never blind overwrite)
- Full audit trail (versions, change events, raw artifacts)
- Plug-and-play providers: implement `SupplierProvider` only

---

## 2. High-level flow

```
Supplier API / CSV
        │
        ▼
 SupplierProvider (plugin)
        │  search / get / normalize / facets
        ▼
 InternalProduct (normalized)
        │
        ▼
 Import Queue + Worker Jobs
        │
        ├── Validate
        ├── Normalize
        ├── Enrich (AI — never overwrites supplier facts)
        ├── Quality / Completeness
        ├── Persist draft Product (inactive)
        ├── Version snapshot
        └── Review (auto-approve if ≥99% clean)
                │
                ▼
         Publish → storefront
```

Sync path:

```
Cron / Admin / Job
   → runCatalogSync(provider, account)
   → getProduct
   → detectSupplierChanges
   → SyncPolicy decide (apply | queue | ignore)
   → ProductCatalogVersion + SupplierChangeEvent
   → safe field updates only
```

---

## 3. Provider contract

File: `lib/suppliers/provider.ts`

A new provider must implement:

| Method | Purpose |
|--------|---------|
| `searchProducts` | Catalog search |
| `getProduct` | Full product fetch |
| `normalizeProduct` | Native payload → `SupplierProductDetail` |
| `importProducts` | Enqueue into platform queue |
| `syncInventory` / `syncPrice` | Bulk sync entrypoints |
| `getInventory` | Inventory facet |
| `getPricing` | Pricing facet |
| `getMedia` | Images + videos |
| `getSpecifications` | Specs map |
| `getVideos` | Videos only |

Register factory in `lib/suppliers/registry.ts` and set status `active`.

**Proof:** `lib/suppliers/csv/provider.ts` + `data/csv-catalog/sample-catalog.csv` — activated without changing pipeline/sync/review/UI core.

Helpers: `lib/suppliers/provider-facets.ts` derives facets from `getProduct`.

---

## 4. SupplierAccount layer

Models: `SupplierAccount`, `SyncPolicy`

- Products and queue items link via `supplierAccountId`
- `apiCredentialsReference` stores env/secret **name**, never secrets
- Default accounts seeded by `scripts/seed-supplier-accounts.ts`
- Multiple accounts of the same `supplierType` are supported (`@@unique([supplierType, accountName])`)

---

## 5. Data model (catalog)

### Product (published / draft catalog)

- Identity: `supplierAccountId` + `supplierProductId` (unique)
- Denormalized: `supplierName` for indexing
- Facts: `supplierSpecs`, `attributes`, `videos`, `supplierSnapshot`
- Raw: `supplierRawArtifactId` → `SupplierRawArtifact` (prefer over inline `supplierRaw`)
- `catalogVersion` increments on tracked writes
- Drafts: `isActive = false` until publish

### ImportQueueItem

Pipeline statuses: queued → processing → validating → normalizing → enriching → quality_check → preview/review → approved → published | failed

Enterprise fields: `supplierAccountId`, `rawArtifactId`, `jobId`, `autoApproved`, `reviewReason`

### ProductCatalogVersion

Immutable history for: price, stock, specs, images, attributes, videos, snapshot, full

### SupplierChangeEvent

Diff audit with `policyDecision` (`apply` | `queue` | `ignore` | …)

### SupplierJob

Durable workers: idempotency key, lock, retry backoff, cancel, dead-letter

### SupplierRawArtifact

Metadata in Postgres; payload via `StorageProvider` (`db` | `filesystem` | `s3`)

---

## 6. Pipeline modules

| Stage | Module |
|-------|--------|
| Validate | `lib/suppliers/pipeline/validate.ts` |
| Normalize | `lib/suppliers/pipeline/normalize.ts` |
| Enrich | `lib/suppliers/pipeline/enrich.ts` |
| Quality | `lib/suppliers/pipeline/quality.ts` + `completeness.ts` |
| Orchestrator | `lib/suppliers/import-queue.ts` |
| Enqueue | `lib/suppliers/enqueue.ts` |

AI must not overwrite supplier specs/attributes/images/videos.

---

## 7. Review workflow

`lib/suppliers/review.ts`

Auto-approve when:

- Completeness ≥ 99%
- No validation errors
- No conflicts
- No critical image/variant/video loss

Otherwise → manual review. Publish still requires `review` or `approved` (and explicit approval if completeness gate failed).

---

## 8. SyncPolicy

Per account (`SyncPolicy` 1:1 with `SupplierAccount`).

Defaults:

| Field | Policy |
|-------|--------|
| Stock | auto |
| Supplier price | auto |
| Retail price | manual |
| SEO | never |
| AI | regenerate_if_changed |
| Images | auto_if_new |
| Videos | auto |
| Specs / attributes | auto |
| Variants | manual |

Decision logic: `lib/suppliers/sync/policy.ts`  
Engine: `lib/suppliers/sync/engine.ts`

---

## 9. StorageProvider

`lib/suppliers/storage/provider.ts`

```
StorageProvider { put, get, delete, exists }
```

- `DbStorageProvider` — inline JSON on artifact (default)
- `FilesystemStorageProvider` — `data/supplier-raw/`
- `S3StorageProvider` — interface-ready stub

Env: `SUPPLIER_RAW_STORAGE=db|filesystem|s3`

---

## 10. Worker system

`lib/suppliers/workers/jobs.ts`

- Enqueue with idempotency (`import_item:{queueItemId}`)
- Claim with lock TTL
- Parallel `runSupplierWorkers({ concurrency })`
- Retry with exponential backoff
- Dead-letter after `maxAttempts`
- Cancel cooperative

API: `POST /api/admin/suppliers/workers`  
Inngest: `syncCatalogSuppliers` drains workers every 6h (plus sync)

---

## 11. Observability

Admin: `/admin/suppliers/health`

Shows: products, published, queue, review, failed, open changes, imports 24h, auto-approved 24h, active workers, job queue, dead-letter, API latency, import time, sync-rate, error-rate, per-supplier account counts.

---

## 12. Admin surfaces

| Route | Role |
|-------|------|
| `/admin/suppliers` | Hub |
| `/admin/suppliers/[id]` | Catalog search/import |
| `/admin/suppliers/import-queue` | Queue |
| `/admin/suppliers/import-queue/[id]/preview` | Preview |
| `/admin/suppliers/sync` | Manual sync |
| `/admin/suppliers/health` | Observability |
| `/admin/products/[id]/supplier-raw` | Raw + versions + changes |

Rob’s Desk surfaces supplier-agnostic draft/queue chips (not CJ-only).

---

## 13. API map (admin)

- Search / import: `/api/admin/suppliers/...`
- Import queue process / approve / publish
- Sync trigger
- Workers drain / cancel
- Health JSON
- Product supplier-raw

---

## 14. Fulfillment vs catalog

**Catalog** = `SupplierProvider` + registry + pipeline (this document).  
**Fulfillment** = separate adapters (`lib/suppliers/*Supplier.ts`) for order placement.  
Do not mix them.

---

## 15. Adding a new supplier (checklist)

1. Implement `SupplierProvider` under `lib/suppliers/<id>/`
2. Register factory in `registry.ts` (`status: "active"`)
3. Ensure `SupplierName` enum includes the type
4. `ensureDefaultSupplierAccount("<id>")` on first import
5. No changes to pipeline, review, sync engine, or storefront

---

## 16. Operational notes

- Credentials: env vars referenced by `apiCredentialsReference`
- Batch imports enqueue jobs; workers process in parallel
- Never store unbounded raw JSON on `Product.supplierRaw` for new writes
- Retail price is never auto-applied unless SyncPolicy.retailPrice = auto

---

## 17. Key source map

```
lib/suppliers/
  provider.ts              contract
  registry.ts              factories
  accounts.ts              SupplierAccount helpers
  enqueue.ts               queue upsert + jobs
  import-queue.ts          pipeline orchestrator
  review.ts                auto-approve
  versioning.ts            catalog versions
  health.ts                dashboard metrics
  internal-product.ts      normalized model
  storage/provider.ts      StorageProvider
  sync/engine.ts           sync + policy apply
  sync/diff.ts             change detection
  sync/policy.ts           SyncPolicy decisions
  workers/jobs.ts          job queue
  pipeline/*               stages
  cj/*                     CJ plugin
  csv/*                    CSV reference plugin
  merchandiser/            AI Merchandiser (digital buyer)
    types.ts               score dimensions, shelves, settings
    shop-profile.ts        ElectroHypeX store profile
    scoring.ts             multi-dimension scoring
    visual.ts              heuristic + optional vision AI
    market.ts              optional LLM refinement
    pricing-advice.ts      Norwegian retail estimate
    scanner.ts             provider-agnostic catalog scan
    actions.ts             list / queue / decide
    compare.ts             pick winner among N
    decisions.ts           learning loop storage
    trends.ts              future Google Trends / sales hooks
    seeds.ts               shelf seed queries
```

---

## 18. AI Merchandiser

Permanent Supplier Engine capability — not a separate importer.

```
SupplierProviders → AI Scanner → Analysis → Scoring → Recommendations
        → Review (admin) → Import Queue → Preview → Publish
```

- Provider-agnostic (CJ, CSV, future AliExpress/Alibaba/1688/Banggood)
- ShopProfile drives fit scoring and prompts
- Auto-queue ≥ threshold into Import Queue / Review only — **never auto-publish**
- Decisions (accept/reject/queue/publish) stored for future learning
- Trend providers stubbed in `trends.ts` for later Google Trends / sales / season

Admin: `/admin/suppliers/merchandiser`

---

## 19. Autonomous Commerce Engine

Orchestration layer — coordinates Merchandiser, Intelligence, Import, Workers, Pricing/SEO pipeline. Does **not** duplicate engine logic.

- Modes: OFF / SEMI / AUTO (never auto-publish)
- Quality Gate + Store Memory + morning brief on Rob’s Desk
- Admin: `/admin/autonomy`
- Docs: [`docs/autonomous-commerce.md`](./autonomous-commerce.md)

---

## 20. Digital Buyer

Continuous product seeker — checkpointed scans, shop match %, ranking, alt-suppliers, lifecycle.

- Admin: `/admin/buyer`
- Docs: [`docs/digital-buyer.md`](./digital-buyer.md)

---

## 21. AI Trust

Scorecards, learning loop, human overrides, weekly self-eval.

- Admin: `/admin/trust`
- Docs: [`docs/ai-trust.md`](./ai-trust.md)

---

## 22. Self-Improving Store

Nightly quality scoring + improvement proposals — **Rob’s Desk only** (no new menu).

- Docs: [`docs/self-improving-store.md`](./self-improving-store.md)

---

*Generated for FASE 3–10.*
