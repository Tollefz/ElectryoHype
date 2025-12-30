# Bulk Import Guide - Admin Dokumentasjon

## Oversikt

Bulk Import lar deg importere flere produkter samtidig fra **Temu** eller **Alibaba**. Systemet støtter automatisk deteksjon av provider per URL, eller du kan velge provider manuelt.

## Hvordan Bruke

### 1. Velg Provider

I admin-panelet, velg provider fra dropdown:
- **Temu** - For produkter fra temu.com
- **Alibaba** - For produkter fra alibaba.com

### 2. Lim inn URLs

Lim inn produkt-URLer i textarea (én per linje):

```
https://www.temu.com/goods.html?goods_id=123456789
https://www.temu.com/goods.html?goods_id=987654321
```

### 3. Last eller Parse URLs

- **"Last URLs"** - Laster tidligere lagrede URLs for valgt provider
- **"Parse URLs"** - Validerer og normaliserer URLs i textarea

### 4. Importer Produkter

Klikk **"Importer Alle"** for å starte import. Systemet vil:
- Hente produktdata fra hver URL
- Vise forhåndsvisning av produkter
- Vente 2-3 sekunder mellom hver import (rate limiting)

### 5. Lagre Produkter

Etter import, klikk **"Lagre X Produkter"** for å lagre til database.

## URL-format

### Temu URLs

**Støttet format:**
```
https://www.temu.com/goods.html?goods_id=123456789
https://temu.com/goods.html?goods_id=123456789
```

**Viktig:**
- Må inneholde `temu.com` i hostname
- `goods_id` parameter er nødvendig for produktidentifikasjon
- Tracking parametere (utm_*, ref, etc.) fjernes automatisk

**Eksempel:**
```
✅ https://www.temu.com/goods.html?goods_id=123456789
✅ https://www.temu.com/goods.html?goods_id=123&utm_source=google (utm_source fjernes)
❌ https://www.temu.com/product.html (mangler goods_id)
```

### Alibaba URLs

**Støttet format:**
```
https://www.alibaba.com/product-detail/123456789.html
https://www.alibaba.com/product-detail/123456789.html?spm=abc
https://www.1688.com/product-detail/123456789.html
```

**Viktig:**
- Må inneholde `alibaba.com` eller `1688.com` i hostname
- Anbefalt: URL skal inneholde `/product-detail/` i path
- Tracking parametere (spm, utm_*, etc.) fjernes automatisk

**Eksempel:**
```
✅ https://www.alibaba.com/product-detail/123456789.html
✅ https://www.alibaba.com/product-detail/123.html?spm=abc (spm fjernes)
⚠️ https://www.alibaba.com/product.html (fungerer, men ikke anbefalt)
```

## Begrensninger og Spesielle Tilfeller

### Alibaba - Prisintervall

Alibaba-produkter kan ha **prisintervall** (fra-pris til pris):
- **Eksempel:** $10.00 - $50.00 per stk
- **Håndtering:** Systemet bruker laveste pris som standard pris
- **Metadata:** Prisintervallet lagres i produktmetadata
- **Visning:** Intervall vises i produktbeskrivelse hvis tilgjengelig

### Alibaba - MOQ (Minimum Order Quantity)

Alibaba-produkter kan ha **MOQ** (Minimum Order Quantity):
- **Eksempel:** MOQ: 10 stk
- **Håndtering:** MOQ lagres i produktmetadata og/eller spesifikasjoner
- **Viktig:** MOQ påvirker ikke import, men bør vurderes før salg

### Produkter uten Varianter

Noen produkter kan importeres **uten varianter**:
- **Temu:** Noen produkter har kun én variant (Standard)
- **Alibaba:** Noen produkter har ikke variantdata tilgjengelig
- **Håndtering:** Systemet oppretter automatisk en "Standard" variant hvis ingen varianter finnes
- **Viktig:** Produktet importeres likevel, men kan ha begrenset variantinformasjon

### Manglende Data

Systemet håndterer manglende data gracefully:
- **Manglende bilder:** Produktet importeres med advarsel
- **Manglende pris:** Standard pris settes (9.99 NOK)
- **Manglende beskrivelse:** Kort beskrivelse genereres fra tittel

## Feilmeldinger og Status

### Status-typer

Hver URL får en status etter import:

#### ✅ Success
**Betydning:** Produktet ble importert uten problemer

**Eksempel melding:**
```
Produkt importert: Wireless Bluetooth Headphones
```

#### ⚠️ Warning
**Betydning:** Produktet ble importert, men med advarsler

**Vanlige advarsler:**
- `"Ingen bilder funnet for produktet"` - Produktet har ingen bilder
- `"Pris ser ut til å være ugyldig eller manglende"` - Pris er < 1 NOK
- `"Produktet ble ikke opprettet fordi det allerede finnes i databasen"` - Duplikat

**Eksempel melding:**
```
Produkt importert: Bluetooth Speaker
Warnings: ["Ingen bilder funnet for produktet"]
```

#### ❌ Error
**Betydning:** Import feilet

**Vanlige feilmeldinger:**

1. **"Ustøttet leverandør. Støttede: temu, alibaba"**
   - **Årsak:** URL-en er ikke fra støttet provider
   - **Løsning:** Sjekk at URL-en er fra Temu eller Alibaba

2. **"Kunne ikke hente produktdata. Sjekk at URL-en er korrekt og at produktet eksisterer."**
   - **Årsak:** Kunne ikke hente data fra URL-en
   - **Løsning:** 
     - Sjekk at URL-en er korrekt
     - Sjekk at produktet fortsatt eksisterer
     - Prøv å åpne URL-en i nettleser
     - Vent litt og prøv igjen (rate limiting)

3. **"Produktet eksisterer allerede: [Produktnavn]"**
   - **Årsak:** Produktet finnes allerede i databasen (samme supplierUrl)
   - **Løsning:** Sjekk eksisterende produkter før import

4. **"Kunne ikke lagre produktet i databasen. Prøv igjen senere."**
   - **Årsak:** Database-feil under lagring
   - **Løsning:** 
     - Sjekk database-tilkobling
     - Prøv igjen senere
     - Kontakt utvikler hvis problemet vedvarer

5. **"En uventet feil oppstod under import. Prøv igjen senere."**
   - **Årsak:** Ukjent feil
   - **Løsning:** 
     - Sjekk server logs for detaljer
     - Prøv igjen senere
     - Kontakt utvikler hvis problemet vedvarer

## Tips og Best Practices

### 1. Valider URLs først
- Bruk "Parse URLs" før import for å validere URLs
- Sjekk at alle URLs er gyldige før du starter import

### 2. Importer i batches
- Ikke importer for mange produkter samtidig (max 50-100 per batch)
- Vent mellom batches for å unngå rate limiting

### 3. Sjekk for duplikater
- Sjekk eksisterende produkter før import
- Bruk normaliserte URLs for å unngå duplikater

### 4. Alibaba-spesifikke tips
- Foretrekk URLs med `/product-detail/` i path
- Sjekk MOQ før import (kan påvirke salg)
- Vær oppmerksom på prisintervall (bruk laveste pris)

### 5. Lagre URLs
- URLs lagres automatisk per provider
- Bruk "Last URLs" for å fortsette der du slapp

## Automatisk Lagring

Systemet lagrer automatisk URLs per provider:
- **Temu URLs:** Lagres i `bulk-import-urls-temu`
- **Alibaba URLs:** Lagres i `bulk-import-urls-alibaba`

URLs lastes automatisk når du bytter provider.

## Rate Limiting

Systemet venter automatisk mellom imports:
- **2 sekunder** mellom hver URL i bulk-import
- **3 sekunder** mellom hver scraping i preview-mode

Dette unngår rate limiting fra Temu/Alibaba.

## Support

Hvis du opplever problemer:
1. Sjekk feilmeldinger ovenfor
2. Sjekk server logs for detaljerte feil
3. Kontakt utvikler med:
   - URL-en som feilet
   - Feilmelding
   - Screenshot av feilen

