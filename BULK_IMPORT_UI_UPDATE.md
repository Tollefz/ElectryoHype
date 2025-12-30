# Bulk Import UI Update - Temu og Alibaba Support

## Oversikt

Admin-siden "Temu Bulk Import" er nå oppdatert til å støtte både Temu og Alibaba import i samme UI.

## Endringer

### Frontend (`app/admin/(panel)/products/temu-import/TemuImportClient.tsx`)

1. **Provider State Management**
   - Lagt til `Provider` type: `'temu' | 'alibaba'`
   - Lagt til `provider` state med default `'temu'`

2. **Provider Dropdown**
   - Ny dropdown øverst i form med valg: "Temu" (default) og "Alibaba"
   - Clearing av produkter ved provider-bytt

3. **URL Validering**
   - `validateUrl()` funksjon som validerer basert på provider:
     - **Temu**: krever `temu.com` eller `temu.` i URL
     - **Alibaba**: krever `alibaba.com` eller `1688.com` i URL
   - `isAlibabaProductUrl()` sjekker om Alibaba URL inneholder `/product-detail/`
   - Advarsel (console) hvis Alibaba URL mangler `/product-detail/`

4. **Feilmeldinger**
   - Oppdatert til å bruke korrekt provider-navn: `"Ingen gyldige {provider}-URLs funnet"`
   - Dynamisk basert på valgt provider

5. **API-kall**
   - Oppdatert `handleImportAll()` til å sende `provider` parameter til API
   - `fetch('/api/admin/scrape-product', { body: JSON.stringify({ url, provider }) })`

6. **Helper Functions**
   - `extractTemuId()` → `extractSupplierId()` som håndterer både Temu og Alibaba
   - Oppdatert SKU-generering til å bruke provider-navn: `${provider.toUpperCase()}-...`
   - Oppdatert `supplierName` til å bruke valgt provider

7. **UI Labels**
   - Tittel endret fra "Temu Bulk Import" til "Bulk Import"
   - Beskrivelse oppdatert: "Importer flere produkter fra Temu eller Alibaba samtidig"
   - Label endret fra "Temu Produkt URLs" til "Produkt URLs"
   - Placeholder oppdatert basert på provider

### Backend (`app/api/admin/scrape-product/route.ts`)

1. **Provider Parameter Support**
   - API aksepterer nå valgfri `provider` parameter
   - Validerer at spesifisert provider matcher auto-detektert supplier
   - Hvis provider er spesifisert men auto-deteksjon feiler, bruker spesifisert provider
   - Returnerer feil hvis provider ikke matcher URL

## Funksjonalitet

### Provider-valg
- Bruker kan velge mellom "Temu" og "Alibaba" i dropdown
- Default er "Temu" (beholder eksisterende oppførsel)
- Ved bytte av provider, cleares eksisterende produkter

### Validering
- **Temu URLs**: Må inneholde `temu.com` eller `temu.`
- **Alibaba URLs**: Må inneholde `alibaba.com` eller `1688.com`
- Alibaba URLs anbefales å inneholde `/product-detail/` (advarsel vises i console)

### API-integrasjon
- Provider sendes til backend for tydelighet
- Backend validerer at provider matcher URL
- Hvis backend støtter autodeteksjon, brukes den som fallback

## Eksempel på bruk

### Temu Import
1. Velg "Temu" i dropdown
2. Lim inn Temu URLs (én per linje)
3. Klikk "Last URLs"
4. Klikk "Importer Alle"

### Alibaba Import
1. Velg "Alibaba" i dropdown
2. Lim inn Alibaba URLs (én per linje, helst med `/product-detail/`)
3. Klikk "Last URLs"
4. Klikk "Importer Alle"

## Breaking Changes

**Ingen breaking changes** - Eksisterende Temu-flyt fungerer uendret.

## Testing

Test følgende scenarier:
1. ✅ Temu import (som før)
2. ✅ Alibaba import med `/product-detail/` URLs
3. ✅ Alibaba import uten `/product-detail/` (skal fungere, men advare)
4. ✅ Provider-bytt (skal cleare produkter)
5. ✅ Feilmeldinger med korrekt provider-navn
6. ✅ Validering av URLs basert på provider

