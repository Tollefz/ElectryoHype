# Produktvarianter - Migrering Guide

## Oversikt
Systemet støtter nå produktvarianter (farger, størrelser, lengder, etc.) med varierende priser.

## Database Migrering

Kjør følgende kommando for å legge til nye tabeller og kolonner:

```bash
npm run db:migrate
```

Dette vil:
- Legge til `ProductVariant` tabell
- Oppdatere `OrderItem` med `variantId` og `variantName` kolonner
- Legge til `variants` relasjon i `Product` modell

## Endringer

### Prisma Schema
- Ny `ProductVariant` modell med:
  - `productId` (relasjon til Product)
  - `name` (f.eks. "Rød - 2m")
  - `price`, `compareAtPrice`, `supplierPrice`
  - `image` (variant-spesifikk bilde)
  - `attributes` (JSON med f.eks. {"color": "Rød", "length": "2m"})
  - `sku`, `stock`, `isActive`

- Oppdatert `OrderItem` med:
  - `variantId` (valgfri relasjon til ProductVariant)
  - `variantName` (snapshot ved ordre-tidspunkt)

### Scraper
- Temu-scraperen henter nå automatisk varianter
- Variant-informasjon inkluderer priser, attributter (farge, størrelse, lengde), og bilder

### Import Script
- `import-temu-products.ts` oppretter nå varianter automatisk
- Hver variant får sin egen pris basert på Temu-data

### Frontend
- Produktsiden viser variant-valg
- Prisen oppdateres basert på valgt variant
- Handlekurven støtter varianter

