# Produktdata-migrasjon - Notater

## Problem identifisert

- `/products` viste treningsklær-produkter i stedet for originale elektronikk-produkter
- Demo-produkter fra `prisma/seed.ts` ble opprettet med `storeId: "default-store"`
- Seed-skriptet slettet ALLE eksisterende produkter (`deleteMany()`)

## Løsninger implementert

### 1. Seed-skript oppdatert (`prisma/seed.ts`)
- **Før:** Slettet alle produkter og opprettet demo-produkter med `storeId: "default-store"`
- **Etter:** 
  - Demo-produkter bruker nå `storeId: "demo-store"` (ikke "default-store")
  - Sjekker om demo-produkter allerede eksisterer før opprettelse
  - Sletter IKKE eksisterende produkter lenger

### 2. DEFAULT_STORE_ID oppdatert (`lib/store.ts`)
- **Før:** `"default-store"` (som inneholdt demo-produkter)
- **Etter:** `"electrohype"` (forventet storeId for originale produkter)

### 3. Produktsider oppdatert
- **`/products`:** Ekskluderer "demo-store" produkter, prøver "electrohype" først, fallback til "default-store"
- **`/` (homepage):** Samme logikk
- **`/tilbud`:** Samme logikk

### 4. Debug-endpoint opprettet
- **`/api/debug/store-ids`:** Viser alle storeId-er i databasen med eksempler

## Neste steg

1. **Kjør debug-endpoint** for å se faktiske storeId-er:
   ```
   GET /api/debug/store-ids
   ```

2. **Hvis originale produkter har annen storeId:**
   - Oppdater `DEFAULT_STORE_ID` i `lib/store.ts` til riktig verdi
   - Eller sett miljøvariabel `DEFAULT_STORE_ID` i `.env`

3. **Hvis originale produkter mangler:**
   - Sjekk om de har blitt slettet av seed-skriptet
   - Vurder å gjenopprette fra backup eller re-import

4. **For bildevisning:**
   - ProductCard håndterer allerede `product.images` (JSON array)
   - Hvis produkter har `imageUrl` i stedet, legg til støtte i ProductCard

## Demo-produkter

Demo-produkter (treningsklær, sport, etc.) ligger nå på `storeId: "demo-store"` og vil IKKE vises på `/products` med mindre eksplisitt query.

## Testing

Test følgende:
1. `/products` skal vise originale produkter (ikke treningsklær)
2. `/api/debug/store-ids` skal vise hvilke storeId-er som finnes
3. Bildevisning skal fungere for produkter med `images` array

