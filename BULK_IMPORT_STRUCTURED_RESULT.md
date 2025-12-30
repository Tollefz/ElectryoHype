# Bulk Import - Strukturert Resultat per URL

## Oversikt

Bulk-import endpoint/service er oppdatert til å returnere strukturert resultat per URL med autodeteksjon av provider og robust feilhåndtering.

## Endringer

### Request Body

```typescript
{
  provider?: "temu" | "alibaba",  // Valgfri - autodetekteres per URL hvis utelatt
  urls: string[]                  // Array med produkt-URLer
}
```

### Response Format

```typescript
{
  results: BulkImportResult[]
}
```

### BulkImportResult Interface

```typescript
interface BulkImportResult {
  inputUrl: string;              // Original URL fra request
  normalizedUrl: string;         // Normalisert URL (uten tracking params)
  providerUsed: string;          // Provider som ble brukt ("temu", "alibaba", "none", "unknown")
  status: "success" | "error" | "warning";
  message: string;               // Beskrivende melding
  createdProductId?: string;     // ID til opprettet produkt (hvis success)
  warnings?: string[];            // Valgfrie advarsler
}
```

## Funksjonalitet

### Autodeteksjon per URL

- Hvis `provider` ikke sendes, autodetekteres provider per URL
- Hver URL kan ha forskjellig provider (Temu/Alibaba)
- Mixed URLs støttes: `["temu-url", "alibaba-url", "temu-url"]`

### Feilhåndtering

- **Ikke stopp ved feil**: Hvis én URL feiler, fortsetter importen med resten
- **Strukturert feilmelding**: Hver URL får eget resultat med status og melding
- **Server-side logging**: Detaljerte feil logges server-side
- **Trygg client-melding**: Klient får trygg, generell melding (ikke sensitive detaljer)

### Status-typer

1. **success**: Produktet ble importert uten problemer
2. **warning**: Produktet ble importert, men med advarsler (f.eks. manglende bilder)
3. **error**: Import feilet (f.eks. ugyldig URL, manglende data, database-feil)

### Warnings

Warnings kan inkludere:
- "Ingen bilder funnet for produktet"
- "Pris ser ut til å være ugyldig eller manglende"
- "Produktet ble ikke opprettet fordi det allerede finnes i databasen"
- Provider-spesifikke warnings fra metadata

## Eksempel

### Request

```json
POST /api/admin/products/bulk-import
{
  "urls": [
    "https://www.temu.com/goods.html?goods_id=123&utm_source=google",
    "https://www.alibaba.com/product-detail/456.html?spm=abc",
    "https://www.example.com/invalid-url.html"
  ]
}
```

### Response

```json
{
  "results": [
    {
      "inputUrl": "https://www.temu.com/goods.html?goods_id=123&utm_source=google",
      "normalizedUrl": "https://www.temu.com/goods.html?goods_id=123",
      "providerUsed": "temu",
      "status": "success",
      "message": "Produkt importert: Wireless Headphones",
      "createdProductId": "product-abc123"
    },
    {
      "inputUrl": "https://www.alibaba.com/product-detail/456.html?spm=abc",
      "normalizedUrl": "https://www.alibaba.com/product-detail/456.html",
      "providerUsed": "alibaba",
      "status": "warning",
      "message": "Produkt importert: Bluetooth Speaker",
      "createdProductId": "product-def456",
      "warnings": ["Ingen bilder funnet for produktet"]
    },
    {
      "inputUrl": "https://www.example.com/invalid-url.html",
      "normalizedUrl": "https://www.example.com/invalid-url.html",
      "providerUsed": "none",
      "status": "error",
      "message": "Ustøttet leverandør. Støttede: temu, alibaba"
    }
  ]
}
```

## Endrede Filer

### 1. `lib/providers/types.ts`
- Lagt til `BulkImportResult` interface

### 2. `app/api/admin/products/bulk-import/route.ts`
- Oppdatert `importProduct()` til å returnere `BulkImportResult`
- Oppdatert `POST` handler til å håndtere autodeteksjon per URL
- Feilhåndtering: fortsetter ved individuelle feil
- Server-side logging av detaljerte feil
- Trygg client-melding

### 3. `app/admin/(panel)/products/bulk-import/actions.ts`
- Samme oppdateringer som route.ts
- Bruker samme `BulkImportResult` format

### 4. `app/api/admin/products/bulk-import/__tests__/bulk-import.test.ts`
- Enhetstester for provider routing
- Tester mixed URL routing
- Tester feilhåndtering per URL
- Tester autodeteksjon

## Testing

Kjør tester med:
```bash
npm test app/api/admin/products/bulk-import/__tests__/bulk-import.test.ts
```

Tester dekker:
- ✅ Provider auto-deteksjon per URL
- ✅ Mixed Temu/Alibaba URL routing
- ✅ Feilhåndtering uten å stoppe importen
- ✅ Strukturert resultat format
- ✅ Warnings håndtering

## Breaking Changes

**Potensielt breaking change** - Response format er endret fra:
```typescript
{ success: boolean, url: string, ... }
```

Til:
```typescript
{ inputUrl: string, normalizedUrl: string, providerUsed: string, status: "success"|"error"|"warning", ... }
```

Frontend-komponenter som bruker bulk-import må oppdateres til å bruke det nye formatet.

## Migrasjon

For frontend-komponenter:
- Oppdater `ImportResult` interface til `BulkImportResult`
- Oppdater `result.success` til `result.status === "success"`
- Bruk `result.providerUsed` for å vise hvilken provider som ble brukt
- Håndter `result.warnings` array
- Vis `result.normalizedUrl` i stedet for `result.url`

