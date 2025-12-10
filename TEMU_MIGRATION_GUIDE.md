# Temu Produkter Migration Guide

## Oversikt

Denne guiden beskriver hvordan du migrerer fra demo-produkter til Temu-produkter som hovedkatalog.

## Status

✅ **Fullført:**
- Bulk import setter nå `storeId` til `DEFAULT_STORE_ID`
- Debug-ruter for å sjekke Temu-produkter
- Queries ekskluderer "demo-store" produkter
- Cleanup-scripts for demo-produkter
- ProductCard håndterer Temu-bilder korrekt

## Steg-for-steg

### 1. Sjekk eksisterende Temu-produkter

Først, sjekk om du allerede har Temu-produkter i databasen:

```bash
# Lokalt: Åpne http://localhost:3000/api/debug/temu-products
# Produksjon: Åpne https://din-side.no/api/debug/temu-products
```

Dette viser:
- Antall Temu-produkter
- Hvilken `storeId` de bruker
- Sample produkter med bilder

### 2. Fiks storeId for eksisterende Temu-produkter

Hvis Temu-produkter har `storeId: null`, oppdater dem:

```bash
npm run fix:temu-storeid
```

Dette setter `storeId` til `DEFAULT_STORE_ID` for alle Temu-produkter uten `storeId`.

### 3. Importer nye Temu-produkter (hvis nødvendig)

Hvis du ikke har nok Temu-produkter, importer via admin:

1. Gå til `/admin/products/temu-import`
2. Lim inn Temu URLs (én per linje)
3. Klikk "Parse URLs"
4. Klikk "Import All" for å scrape data
5. Klikk "Save All" for å lagre til database

**Viktig:** Nye produkter får automatisk `storeId = DEFAULT_STORE_ID`.

### 4. Verifiser at Temu-produkter vises

Sjekk at Temu-produkter vises på frontend:

```bash
# Sjekk storeIds i databasen
# Lokalt: http://localhost:3000/api/debug/store-ids
# Produksjon: https://din-side.no/api/debug/store-ids

# Sjekk Temu-produkter
# Lokalt: http://localhost:3000/api/debug/temu-products
# Produksjon: https://din-side.no/api/debug/temu-products

# Sjekk frontend
# Lokalt: http://localhost:3000/products
# Produksjon: https://din-side.no/products
```

### 5. Rydd opp i demo-produkter (NÅR TEMU-PRODUKTER ER PÅ PLASS)

**⚠️ VIKTIG:** Ikke kjør dette før du har bekreftet at Temu-produkter vises korrekt!

Først, gjør en dry-run for å se hva som vil bli slettet:

```bash
npm run cleanup:demo-products:dry-run
```

Hvis alt ser bra ut, kjør cleanup:

```bash
npm run cleanup:demo-products
```

Dette vil:
- Slette alle produkter med `storeId = "demo-store"` (sport/klær demo-produkter)
- Flytte gamle demo-produkter fra "default-store" til "demo-legacy" (sikrere enn å slette)

## Debug-ruter

### `/api/debug/store-ids`
Viser alle `storeId`s i databasen med antall produkter per store.

### `/api/debug/temu-products`
Viser alle Temu-produkter med:
- Total antall
- Antall aktive/inaktive
- Fordeling per `storeId`
- Sample produkter med bilder

## Konfigurasjon

### DEFAULT_STORE_ID

`DEFAULT_STORE_ID` er definert i `lib/store.ts`:

```typescript
const DEFAULT_STORE_ID = process.env.DEFAULT_STORE_ID || "default-store";
```

Du kan overstyre dette med environment variable `DEFAULT_STORE_ID`.

### Hvordan produkter vises

Frontend viser produkter basert på:
1. `storeId` fra request headers (hvis satt)
2. `DEFAULT_STORE_ID` som fallback
3. **Ekskluderer alltid "demo-store" produkter**

## Troubleshooting

### Problem: Ingen produkter vises på /products

**Løsning:**
1. Sjekk `/api/debug/store-ids` - finnes det produkter med `storeId = DEFAULT_STORE_ID`?
2. Sjekk `/api/debug/temu-products` - finnes det Temu-produkter?
3. Kjør `npm run fix:temu-storeid` hvis Temu-produkter har `storeId: null`

### Problem: Demo-produkter vises fortsatt

**Løsning:**
1. Sjekk at queries ekskluderer "demo-store": `storeId !== "demo-store"`
2. Sjekk at `DEFAULT_STORE_ID` ikke er "demo-store"
3. Kjør cleanup-script: `npm run cleanup:demo-products`

### Problem: Temu-produkter har ingen bilder

**Løsning:**
1. Sjekk at `images` feltet i database er en JSON-string med array av URLs
2. ProductCard parser automatisk JSON-string
3. Hvis bilder mangler, re-import produktet via admin

## Filer endret

- `app/api/admin/products/bulk-import/route.ts` - Setter `storeId` for nye produkter
- `app/api/admin/products/route.ts` - Bruker `DEFAULT_STORE_ID` som fallback
- `app/products/page.tsx` - Ekskluderer "demo-store" produkter
- `app/page.tsx` - Ekskluderer "demo-store" produkter
- `app/tilbud/page.tsx` - Ekskluderer "demo-store" produkter
- `components/ProductCard.tsx` - Håndterer Temu-bilder korrekt
- `app/api/debug/temu-products/route.ts` - Ny debug-route
- `scripts/fix-temu-storeid.ts` - Script for å fikse eksisterende produkter
- `scripts/cleanup-demo-products.ts` - Script for å rydde opp i demo-produkter

## Neste steg

1. ✅ Sjekk at Temu-produkter finnes i databasen
2. ✅ Fiks `storeId` for eksisterende Temu-produkter
3. ✅ Verifiser at Temu-produkter vises på frontend
4. ⏳ Rydd opp i demo-produkter (når Temu-produkter er bekreftet)

