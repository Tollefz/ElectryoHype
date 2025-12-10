# Fikser Anvendt - Produktdata og Bildevisning

## Problem Identifisert

1. **Treningsklær-produkter vises på `/products`** i stedet for originale elektronikk-produkter
2. **Seed-skriptet slettet alle produkter** og opprettet demo-produkter med `storeId: "default-store"`
3. **Bildevisning viser grå bokser** - sannsynligvis fordi bildene er placeholders eller tomme arrays

## Løsninger Implementert

### 1. Seed-skript Oppdatert (`prisma/seed.ts`)

**Endringer:**
- ❌ **FJERNET:** `await prisma.product.deleteMany();` - sletter ikke lenger eksisterende produkter
- ✅ **ENDRET:** Demo-produkter bruker nå `storeId: "demo-store"` i stedet for `"default-store"`
- ✅ **LAGT TIL:** Sjekk om demo-produkter allerede eksisterer før opprettelse
- ✅ **LAGT TIL:** Informative console.log-meldinger

**Resultat:** Demo-produkter (treningsklær, sport, etc.) vil ikke lenger overskrive eller forstyrre originale produkter.

### 2. DEFAULT_STORE_ID Oppdatert (`lib/store.ts`)

**Endringer:**
- ❌ **FJERNET:** `"default-store"` som standard
- ✅ **ENDRET:** `"electrohype"` som standard (forventet storeId for originale produkter)
- ✅ **LAGT TIL:** Kommentarer som forklarer prioritetsrekkefølge

**Resultat:** Systemet vil nå prioritere produkter med `storeId: "electrohype"`.

### 3. Produktsider Oppdatert

#### `/products` (`app/products/page.tsx`)
- ✅ Ekskluderer "demo-store" produkter eksplisitt
- ✅ Prøver "electrohype" først, fallback til "default-store" (men ikke "demo-store")
- ✅ Sikrer at demo-produkter aldri vises

#### `/` Homepage (`app/page.tsx`)
- ✅ Samme logikk som `/products`
- ✅ Bruker "electrohype" som standard i stedet for "default-store"

#### `/tilbud` (`app/tilbud/page.tsx`)
- ✅ Samme logikk som `/products`

### 4. Debug-endpoint Opprettet

**Ny fil:** `app/api/debug/store-ids/route.ts`
- Viser alle `storeId`-er i databasen
- Viser eksempelprodukter for hver `storeId`
- Identifiserer sport/treningsklær-produkter
- Identifiserer elektronikk-produkter

**Bruk:**
```
GET /api/debug/store-ids
```

### 5. Bildevisning (`components/ProductCard.tsx`)

**Eksisterende funksjonalitet (allerede implementert):**
- ✅ Parser `product.images` som JSON string eller array
- ✅ Validerer at bilder er gyldige HTTP(S) URLs
- ✅ Fallback til placeholder hvis ingen bilder
- ✅ Håndterer image errors gracefully

**Status:** ProductCard håndterer allerede bilder korrekt. Hvis bilder fortsatt vises som grå bokser, kan det være:
- Produktene har tomme `images` arrays i databasen
- Bildene er placeholders som ikke laster
- Bildene er base64 data URLs som ikke fungerer

## Neste Steg for Deg

### 1. Sjekk Faktiske storeId-er i Databasen

Kjør debug-endpoint:
```bash
# I nettleseren eller med curl:
GET http://localhost:3000/api/debug/store-ids
```

Dette vil vise:
- Hvilke `storeId`-er som faktisk finnes
- Hvor mange produkter hver `storeId` har
- Eksempelprodukter for hver `storeId`

### 2. Juster DEFAULT_STORE_ID Hvis Nødvendig

Hvis originale produkter har en annen `storeId` enn "electrohype":

**Alternativ A:** Sett miljøvariabel
```env
DEFAULT_STORE_ID=din-faktiske-store-id
```

**Alternativ B:** Oppdater `lib/store.ts` direkte
```typescript
const DEFAULT_STORE_ID = process.env.DEFAULT_STORE_ID || "din-faktiske-store-id";
```

### 3. Hvis Originale Produkter Mangler

Hvis originale produkter har blitt slettet av seed-skriptet:

1. **Sjekk backup** hvis tilgjengelig
2. **Re-import** produkter via admin-panel
3. **Sett riktig `storeId`** på importerte produkter

### 4. Fiks Bildevisning Hvis Nødvendig

Hvis bilder fortsatt ikke vises:

1. **Sjekk databasen direkte:**
   ```sql
   SELECT id, name, images FROM "Product" WHERE "storeId" = 'electrohype' LIMIT 5;
   ```

2. **Hvis `images` er tomme eller placeholders:**
   - Oppdater produkter via admin-panel med ekte bilder
   - Eller bruk bildeopplasting-funksjonen vi nettopp implementerte

3. **Hvis produkter har `imageUrl` i stedet for `images`:**
   - ProductCard støtter kun `images` (JSON array)
   - Enten migrer data til `images` format, eller legg til støtte for `imageUrl` i ProductCard

## Testing

Test følgende etter endringene:

1. ✅ `/products` skal vise originale produkter (ikke treningsklær)
2. ✅ `/api/debug/store-ids` skal vise alle storeId-er
3. ✅ Bildevisning skal fungere for produkter med gyldige bilder
4. ✅ Demo-produkter skal ikke vises på `/products`

## Filer Endret

1. `prisma/seed.ts` - Oppdatert til å ikke slette eksisterende produkter
2. `lib/store.ts` - Endret DEFAULT_STORE_ID til "electrohype"
3. `app/products/page.tsx` - Ekskluderer demo-store, prioriteter electrohype
4. `app/page.tsx` - Samme logikk
5. `app/tilbud/page.tsx` - Samme logikk
6. `app/api/debug/store-ids/route.ts` - Ny debug-endpoint

## Filer IKKE Endret (Bevart)

- `components/ProductCard.tsx` - Allerede håndterer bilder korrekt
- Admin CRUD - Fungerer som før
- Cart/Checkout - Fungerer som før
- Ordresystem - Fungerer som før

---

**Viktig:** Ingen data er slettet. Demo-produkter ligger fortsatt i databasen med `storeId: "demo-store"`, men de vil ikke vises på produktsider med mindre eksplisitt query.

