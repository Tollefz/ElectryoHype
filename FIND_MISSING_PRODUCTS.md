# Guide: Finne manglende Temu-produkter

## Status

✅ **Fullført:**
- Debug-route opprettet: `/api/debug/products-all`
- Admin API oppdatert til å ikke filtrere på `storeId` eller `isActive`
- Admin viser nå ALLE produkter i databasen

## Steg-for-steg diagnose

### 1. Sjekk hva som faktisk ligger i databasen

Åpne debug-ruten i nettleseren:

```
http://localhost:3000/api/debug/products-all
```

Eller i produksjon:
```
https://din-side.no/api/debug/products-all
```

Dette viser:
- **Total antall produkter** i databasen
- **Antall per storeId** (default-store, demo-store, null, etc.)
- **Antall per supplierName** (temu, alibaba, etc.)
- **Antall aktive/inaktive** produkter
- **Sample produkter** fra hver storeId
- **Anbefaling** basert på dataene

### 2. Tolke resultatene

#### Scenario A: `total <= 12`
**Betydning:** Temu-produktene er sannsynligvis IKKE i denne databasen.

**Mulige årsaker:**
- Produktene ble importert til en annen database (gammel DATABASE_URL)
- Produktene ble aldri lagret (import feilet)
- Produktene ble slettet

**Løsning:**
- Gå til steg 6 (re-import via admin)

#### Scenario B: `total > 12` men `temu = 0`
**Betydning:** Det finnes produkter, men ingen er markert som Temu.

**Mulige årsaker:**
- `supplierName` er ikke satt til "temu"
- `supplierUrl` inneholder ikke "temu"
- `sku` starter ikke med "TEMU-"

**Løsning:**
- Sjekk `samplesByStore` i debug-output
- Se etter produkter med `supplierUrl` som inneholder "temu.com"
- Hvis du finner dem, oppdater `supplierName` til "temu" via admin eller script

#### Scenario C: `total > 12` og `temu > 0`
**Betydning:** Temu-produkter finnes, men vises ikke i admin.

**Mulige årsaker:**
- Produktene har `storeId` som ikke matcher admin-query
- Produktene har `isActive = false`
- Pagination begrenser visningen

**Løsning:**
- Sjekk `samplesByStore` for å se hvilken `storeId` Temu-produktene har
- Sjekk om de har `isActive: false`
- Admin API viser nå ALLE produkter uavhengig av `storeId` og `isActive`

### 3. Sjekk admin-listen

Etter at admin API er oppdatert, skal `/admin/products` vise:
- **Alle produkter** i databasen (uavhengig av `storeId` eller `isActive`)
- **Pagination** med default limit på 50 produkter per side
- **Søk og filter** fungerer fortsatt

Hvis du fortsatt bare ser 6 produkter:
1. Sjekk at du har lastet siden på nytt (hard refresh: Ctrl+Shift+R)
2. Sjekk browser console for feil
3. Sjekk `/api/debug/products-all` for å se faktisk antall

### 4. Fiks produkter hvis nødvendig

Hvis Temu-produkter finnes men har feil `storeId` eller `isActive`:

#### Oppdater storeId for Temu-produkter:
```bash
npm run fix:temu-storeid
```

#### Oppdater isActive for alle produkter:
Lag et midlertidig script eller bruk admin-edit for å sette `isActive = true`.

### 5. Re-import hvis produkter mangler

Hvis debug-ruten viser at det bare er 6-12 produkter totalt:

1. Gå til `/admin/products/temu-import`
2. Lim inn Temu URLs (én per linje)
3. Klikk "Parse URLs"
4. Klikk "Import All" for å scrape data
5. Klikk "Save All" for å lagre til database

**Viktig:** Nye produkter får automatisk:
- `storeId = DEFAULT_STORE_ID` (så de vises i frontend)
- `isActive = true`
- `supplierName = "temu"`

## Debug-ruter

### `/api/debug/products-all`
Viser full oversikt over alle produkter i databasen.

### `/api/debug/temu-products`
Viser spesifikt Temu-produkter (basert på supplierName, supplierUrl, eller sku).

### `/api/debug/store-ids`
Viser fordeling av produkter per storeId.

## Endringer gjort

### `app/api/admin/products/route.ts`
- **Fjernet:** Filtrering på `storeId` og `isActive`
- **Resultat:** Admin viser nå ALLE produkter uavhengig av status

### `app/api/debug/products-all/route.ts` (ny)
- Ny debug-route for å inspisere alle produkter
- Viser fordeling per storeId, supplierName, og status
- Gir anbefalinger basert på dataene

## Neste steg

1. ✅ Åpne `/api/debug/products-all` og se hva som faktisk ligger i databasen
2. ✅ Sjekk `/admin/products` - skal nå vise alle produkter
3. ⏳ Hvis produkter mangler, re-import via `/admin/products/temu-import`
4. ⏳ Hvis produkter har feil `storeId`, kjør `npm run fix:temu-storeid`

## Troubleshooting

### Problem: Admin viser fortsatt bare 6 produkter

**Løsning:**
1. Hard refresh siden (Ctrl+Shift+R)
2. Sjekk browser console for JavaScript-feil
3. Sjekk Network-tab for å se API-responsen
4. Verifiser at `/api/debug/products-all` viser flere produkter

### Problem: Debug-route viser 0 Temu-produkter

**Løsning:**
1. Sjekk `samplesByStore` i debug-output
2. Se etter produkter med `supplierUrl` som inneholder "temu"
3. Hvis du finner dem, oppdater `supplierName` til "temu" via admin

### Problem: Produkter finnes men vises ikke i frontend

**Løsning:**
1. Sjekk at produkter har `storeId = DEFAULT_STORE_ID`
2. Sjekk at produkter har `isActive = true`
3. Kjør `npm run fix:temu-storeid` hvis nødvendig

