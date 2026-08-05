# AI Merchandiser

Digital innkjøper inne i Supplier Engine.

## Flow

```
Supplier Providers
        ↓
   AI Scanner
        ↓
 Produktanalyse (bilder, varianter, pris, lager, specs, video, …)
        ↓
    Scoring (12 dimensjoner + overall)
        ↓
  Anbefalinger (hyller: i dag / gaming / mobil / …)
        ↓
     Review (admin)
        ↓
   Import Queue → Preview → Publish
```

## Principles

1. Leverandørdata er sannheten — AI vurderer, overskriver ikke facts.
2. Provider-agnostic — kun `SupplierProvider` / `SupplierSearchProduct` / `SupplierProductDetail`.
3. Explainability alltid — score + «hvorfor».
4. Admin tar siste beslutning. Auto-kø går til Review, aldri Publish.
5. Beslutninger lagres for senere læring.

## Admin

- `/admin/suppliers/merchandiser` — forslag, scan, import, sammenlign
- `/admin/suppliers/merchandiser/settings` — butikkprofil + auto-kø

## Code

`lib/suppliers/merchandiser/`
