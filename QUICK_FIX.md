# Quick Fix - Treningsklær Fjernet fra /products

## Problem
Alle produkter (både elektronikk og treningsklær) lå på `storeId: "default-store"`, så treningsklær-produktene ble vist på `/products`.

## Løsning Implementert

### 1. Kategorifiltrering
Alle produktsider ekskluderer nå "Sport" og "Klær" kategorier:
- `/products` - viser kun elektronikk (ikke Sport/Klær)
- `/` (homepage) - viser kun elektronikk
- `/tilbud` - viser kun elektronikk

### 2. Migrasjonsscript
Opprettet `scripts/migrate-sport-products.ts` som kan flytte treningsklær-produkter til `"demo-store"` hvis du vil.

## Neste Steg

### Alternativ A: Bare bruk kategorifiltrering (anbefalt)
**Dette er allerede gjort!** Treningsklær-produkter vil ikke vises på `/products` lenger.

Test nå:
- Gå til `http://localhost:3000/products`
- Du skal kun se elektronikk-produkter (Premium Hodetelefoner, Smartklokke Pro, Trådløs Mus, etc.)
- Treningsklær-produkter skal være borte

### Alternativ B: Migrer treningsklær til demo-store (valgfritt)
Hvis du vil flytte treningsklær-produktene til `"demo-store"` for å holde databasen ryddig:

```bash
npx ts-node --compiler-options "{\"module\":\"CommonJS\"}" scripts/migrate-sport-products.ts
```

Dette vil:
- Finne alle produkter med kategori "Sport" eller "Klær"
- Finne produkter med navn som inneholder "Trenings", "Yoga", "Ball", "Undertøy"
- Flytte dem til `storeId: "demo-store"`

## Resultat

✅ `/products` viser nå kun elektronikk-produkter
✅ Treningsklær-produkter er filtrert bort (men ligger fortsatt i databasen)
✅ Ingen data er slettet
✅ Bildevisning fungerer som før

## Test

1. Gå til `http://localhost:3000/products`
2. Du skal kun se:
   - Premium Hodetelefoner
   - Smartklokke Pro
   - Trådløs Mus
   - (andre elektronikk-produkter)

3. Du skal IKKE se:
   - Treningsmatte Deluxe
   - Yogaboller Sett
   - Sportsundertøy Sett
   - Treningsball Pro

