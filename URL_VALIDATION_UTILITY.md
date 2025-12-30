# URL Validation Utility - Dokumentasjon

## Oversikt

Felles utility-modul for URL-validering og normalisering for Temu og Alibaba. Deles mellom frontend og backend.

## Fil

`lib/utils/url-validation.ts`

## Funksjoner

### `normalizeUrl(url: string): string`

Normaliserer en URL ved å:
- Trimme whitespace
- Fjerne tracking query-parametere
- Beholde nødvendige parametere (for Temu: goods_id, top_gallery_url, spec_gallery_id)
- Normalisere protokoll til https
- Normalisere domene (www.temu.com, www.alibaba.com, www.1688.com)
- Legge til https:// hvis mangler

**Tracking parametere som fjernes:**
- `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`
- `ref`, `referrer`
- `affiliate_id`, `aff_id`, `click_id`
- `gclid`, `fbclid`, `twclid`, `li_fat_id`
- `mc_cid`, `mc_eid`
- `_ga`, `_gid`
- `spm`, `scm`, `trace`, `tracelog` (Alibaba-spesifikke)

**Nødvendige parametere som beholdes (Temu):**
- `goods_id` - Produkt ID
- `top_gallery_url` - Hovedbilde URL
- `spec_gallery_id` - Variant bilde ID

### `isValidTemuUrl(url: string): boolean`

Sjekker om URL er en gyldig Temu URL:
- Hostname må inneholde `temu.com` eller `temu.`
- Håndterer URLs uten protokoll
- Håndterer whitespace

### `isValidAlibabaUrl(url: string): boolean`

Sjekker om URL er en gyldig Alibaba URL:
- Hostname må inneholde `alibaba.com` eller `1688.com`
- Path må inneholde `/product-detail/` (best effort)
- Håndterer URLs uten protokoll
- Håndterer whitespace

### `validateAndNormalizeUrl(url: string, provider: "temu" | "alibaba"): string | null`

Validerer og normaliserer URL for spesifikk provider:
- Returnerer normalisert URL hvis gyldig
- Returnerer `null` hvis ugyldig

### `extractTemuParams(url: string): { goodsId?, topGalleryUrl?, specGalleryId? }`

Ekstraherer nødvendige parametere fra Temu URL.

### `extractAlibabaProductId(url: string): string | null`

Ekstraherer produkt ID fra Alibaba URL (fra `/product-detail/123.html` pattern).

## Bruk

### Backend

```typescript
import { normalizeUrl, isValidTemuUrl, isValidAlibabaUrl } from "@/lib/utils/url-validation";

// Normalize URL
const normalized = normalizeUrl("  https://www.temu.com/goods.html?goods_id=123&utm_source=google  ");

// Validate
if (isValidTemuUrl(url)) {
  // Process Temu URL
}
```

### Frontend

```typescript
import { normalizeUrl, isValidTemuUrl, isValidAlibabaUrl } from "@/lib/utils/url-validation";

// Validate in UI
const isValid = provider === 'temu' 
  ? isValidTemuUrl(url) 
  : isValidAlibabaUrl(url);

// Normalize before sending
const normalized = normalizeUrl(url);
```

## Testing

Kjør tester med:
```bash
npm test lib/utils/__tests__/url-validation.test.ts
```

### Test Coverage

Tester dekker:
- ✅ Whitespace trimming
- ✅ Tracking parameter removal
- ✅ Essential parameter preservation (Temu)
- ✅ Protocol normalization
- ✅ Domain normalization
- ✅ URLs without protocol
- ✅ Large query strings
- ✅ Invalid domains
- ✅ Special characters
- ✅ URL fragments
- ✅ Edge cases (empty, null, undefined)

## Integrasjon

### Oppdaterte Filer

1. **`lib/providers/temu-provider.ts`**
   - Bruker `normalizeUrl` og `isValidTemuUrl` fra utility

2. **`lib/providers/alibaba-provider.ts`**
   - Bruker `normalizeUrl` og `isValidAlibabaUrl` fra utility

3. **`app/admin/(panel)/products/temu-import/TemuImportClient.tsx`**
   - Bruker `isValidTemuUrl`, `isValidAlibabaUrl`, og `normalizeUrl` fra utility

### Fordeler

- **DRY**: Ingen duplisert logikk
- **Konsistens**: Samme normalisering i frontend og backend
- **Testbarhet**: Enkelt å teste isolert
- **Vedlikehold**: Endringer på ett sted

## Eksempler

### Normalisering

```typescript
// Input
"  https://www.temu.com/goods.html?goods_id=123&utm_source=google&ref=abc  "

// Output
"https://www.temu.com/goods.html?goods_id=123"
```

### Validering

```typescript
isValidTemuUrl("https://www.temu.com/goods.html") // true
isValidTemuUrl("www.temu.com/goods.html") // true
isValidTemuUrl("https://www.alibaba.com/product.html") // false

isValidAlibabaUrl("https://www.alibaba.com/product-detail/123.html") // true
isValidAlibabaUrl("https://www.alibaba.com/product.html") // false (mangler /product-detail/)
```

## Edge Cases Håndtert

- ✅ Whitespace (leading/trailing)
- ✅ URLs uten protokoll
- ✅ Store query strings (100+ parametere)
- ✅ Invalid domains
- ✅ Special characters (URL-encoded)
- ✅ URL fragments (#section)
- ✅ Empty/null/undefined input

