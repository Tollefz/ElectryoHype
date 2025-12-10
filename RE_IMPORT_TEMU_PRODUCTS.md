# Re-import Temu-produkter

## Status fra debug-route

Basert på `/api/debug/products-all`:
- **Total produkter:** 6 (kun demo-produkter)
- **Temu-produkter:** 0
- **Anbefaling:** "Very few products found. Temu products may not be in this database."

**Konklusjon:** Temu-produktene finnes ikke i nåværende database. De må re-importeres.

## Steg-for-steg: Re-import via Admin

### 1. Forbered Temu URLs

Du trenger listen med Temu URLs som du tidligere importerte. Disse kan være:
- I en fil (CSV, TXT, Excel)
- I en backup
- I browser history
- I admin-logger (hvis tilgjengelig)

**Format:** Én URL per linje, for eksempel:
```
https://www.temu.com/goods.html?goods_id=123456789
https://www.temu.com/goods.html?goods_id=987654321
https://www.temu.com/product-abc.html
```

### 2. Gå til Temu Bulk Import

1. Logg inn på admin: `/admin/login`
   - Email: `rob.tol@hotmail.com`
   - Passord: `Tollef220900`

2. Naviger til: `/admin/products/temu-import`

3. Du vil se et tekstfelt for "Temu Produkt URLs"

### 3. Importer produkter

1. **Lim inn URLs:**
   - Kopier alle Temu URLs (én per linje)
   - Lim inn i tekstfeltet

2. **Parse URLs:**
   - Klikk "Parse URLs"-knappen
   - Systemet validerer og teller URLs

3. **Scrape produktdata:**
   - Klikk "Import All"-knappen
   - Systemet scraper produktdata fra hver URL
   - Dette kan ta tid (2 sekunder mellom hver import for å unngå rate limiting)
   - Du vil se status for hvert produkt (loading, success, error)

4. **Lagre til database:**
   - Når scraping er ferdig, klikk "Save All"
   - Systemet lagrer alle produkter til databasen
   - Produkter får automatisk:
     - `storeId = DEFAULT_STORE_ID` (så de vises i frontend)
     - `isActive = true`
     - `supplierName = "temu"`
     - `sku = "TEMU-..."`

### 4. Verifiser import

Etter import, sjekk:

1. **Debug-route:**
   ```
   http://localhost:3000/api/debug/products-all
   ```
   - `total` skal nå være høyere
   - `temu` skal vise antall importerte produkter

2. **Admin-liste:**
   ```
   http://localhost:3000/admin/products
   ```
   - Alle nye produkter skal vises

3. **Frontend:**
   ```
   http://localhost:3000/products
   ```
   - Produktene skal vises i butikken

## Alternativ: Bulk Import API

Hvis du har en stor liste med URLs, kan du også bruke bulk import API direkte:

```bash
# Eksempel med curl
curl -X POST http://localhost:3000/api/admin/products/bulk-import \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=YOUR_SESSION_TOKEN" \
  -d '{
    "urls": [
      "https://www.temu.com/goods.html?goods_id=123456789",
      "https://www.temu.com/goods.html?goods_id=987654321"
    ]
  }'
```

**Viktig:** Du må være autentisert (logget inn) for å bruke API-et.

## Troubleshooting

### Problem: "Ustøttet leverandør" feil

**Løsning:**
- Sjekk at URL-en er en gyldig Temu URL
- URL må inneholde "temu.com" eller "temu."
- Eksempel: `https://www.temu.com/goods.html?goods_id=123456789`

### Problem: Scraping feiler for noen produkter

**Mulige årsaker:**
- Produktet er ikke lenger tilgjengelig på Temu
- URL-en er ugyldig eller utløpt
- Rate limiting fra Temu

**Løsning:**
- Prøv å importere på nytt
- Vent litt mellom imports (systemet gjør dette automatisk)
- Sjekk at URL-en fortsatt fungerer i nettleseren

### Problem: Produkter vises ikke i admin etter import

**Løsning:**
1. Hard refresh admin-siden (Ctrl+Shift+R)
2. Sjekk `/api/debug/products-all` for å se om produktene faktisk er lagret
3. Sjekk at produktene har `isActive = true` og `storeId = DEFAULT_STORE_ID`

### Problem: Produkter vises ikke i frontend

**Løsning:**
1. Sjekk at produktene har `storeId = DEFAULT_STORE_ID`
2. Sjekk at produktene har `isActive = true`
3. Kjør `npm run fix:temu-storeid` hvis nødvendig

## Tips

1. **Start med små batches:**
   - Test med 5-10 URLs først
   - Verifiser at alt fungerer
   - Importer deretter resten

2. **Bruk "Parse URLs" først:**
   - Dette validerer URLs uten å scrape
   - Du kan se hvor mange gyldige URLs du har

3. **Sjekk status under import:**
   - Hvert produkt viser status (loading, success, error)
   - Du kan se hvilke som feiler og prøve på nytt

4. **Lag backup:**
   - Lagre listen med URLs i en fil
   - Dette gjør det enkelt å re-importe senere

## Neste steg

1. ✅ Samle alle Temu URLs du tidligere importerte
2. ⏳ Gå til `/admin/products/temu-import`
3. ⏳ Lim inn URLs og følg import-prosessen
4. ⏳ Verifiser at produktene vises i admin og frontend

## Hvis du ikke har URLs

Hvis du ikke har listen med Temu URLs:

1. **Sjekk browser history:**
   - Søk etter "temu.com" i browser history
   - Dette kan gi deg noen av URL-ene

2. **Sjekk backup-filer:**
   - Se etter CSV, TXT, eller Excel-filer med URLs
   - Sjekk Downloads-mappen

3. **Sjekk admin-logger:**
   - Hvis systemet logger imports, kan du finne URLs der

4. **Start på nytt:**
   - Gå til Temu og finn produktene du vil selge
   - Kopier URLs og importer på nytt

