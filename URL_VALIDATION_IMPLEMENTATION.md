# URL Validation Utility - Implementasjon

## Oversikt

Felles URL-validering og normalisering utility-modul for Temu og Alibaba. Deles mellom frontend og backend for konsistens.

## Filstruktur

```
lib/utils/
  ├── url-validation.ts          # Utility-modul
  └── __tests__/
      └── url-validation.test.ts # Enhetstester
```

## Implementerte Funksjoner

### 1. `normalizeUrl(url: string): string`

Normaliserer URL ved å:
- ✅ Trimme whitespace (leading/trailing)
- ✅ Fjerne tracking query-parametere
- ✅ Beholde nødvendige parametere (Temu: goods_id, top_gallery_url, spec_gallery_id)
- ✅ Normalisere protokoll til https
- ✅ Legge til https:// hvis mangler
- ✅ Normalisere domene (www.temu.com, www.alibaba.com, www.1688.com)

**Tracking parametere som fjernes:**
- UTM parametere: `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`
- Referrer: `ref`, `referrer`
- Affiliate: `affiliate_id`, `aff_id`, `click_id`
- Social: `gclid`, `fbclid`, `twclid`, `li_fat_id`
- Analytics: `mc_cid`, `mc_eid`, `_ga`, `_gid`
- Alibaba-spesifikke: `spm`, `scm`, `trace`, `tracelog`

**Nødvendige parametere som beholdes (Temu):**
- `goods_id` - Produkt ID
- `top_gallery_url` - Hovedbilde URL
- `spec_gallery_id` - Variant bilde ID

### 2. `isValidTemuUrl(url: string): boolean`

Validerer Temu URL:
- ✅ Sjekker at hostname inneholder `temu.com` eller `temu.`
- ✅ Håndterer URLs uten protokoll
- ✅ Håndterer whitespace
- ✅ Returnerer false for ugyldig input

### 3. `isValidAlibabaUrl(url: string): boolean`

Validerer Alibaba URL:
- ✅ Sjekker at hostname inneholder `alibaba.com` eller `1688.com`
- ✅ Håndterer URLs uten protokoll
- ✅ Håndterer whitespace
- ✅ Returnerer false for ugyldig input
- ⚠️ Krever ikke `/product-detail/` (best effort)

### 4. `isAlibabaProductUrl(url: string): boolean`

Sjekker om Alibaba URL ser ut som produkt-URL:
- ✅ Sjekker at path inneholder `/product-detail/`
- ✅ Brukes for advarsler i frontend

### 5. `validateAndNormalizeUrl(url: string, provider: "temu" | "alibaba"): string | null`

Validerer og normaliserer URL for spesifikk provider:
- ✅ Returnerer normalisert URL hvis gyldig
- ✅ Returnerer `null` hvis ugyldig

### 6. `extractTemuParams(url: string): { goodsId?, topGalleryUrl?, specGalleryId? }`

Ekstraherer nødvendige parametere fra Temu URL.

### 7. `extractAlibabaProductId(url: string): string | null`

Ekstraherer produkt ID fra Alibaba URL (fra `/product-detail/123.html` pattern).

## Integrasjon

### Backend

**Oppdaterte filer:**
- `lib/providers/temu-provider.ts` - Bruker `normalizeUrl` og `isValidTemuUrl`
- `lib/providers/alibaba-provider.ts` - Bruker `normalizeUrl` og `isValidAlibabaUrl`

**Før:**
```typescript
normalizeUrl(url: string): string {
  // Duplisert logikk
}
```

**Nå:**
```typescript
normalizeUrl(url: string): string {
  return normalizeUrlUtil(url);
}
```

### Frontend

**Oppdaterte filer:**
- `app/admin/(panel)/products/temu-import/TemuImportClient.tsx`
  - Bruker `isValidTemuUrl`, `isValidAlibabaUrl`, `isAlibabaProductUrl`
  - Bruker `normalizeUrl` for å normalisere URLs før import

## Testing

### Test Coverage

Tester dekker alle edge cases:

1. **Whitespace**
   - ✅ Leading/trailing whitespace
   - ✅ Kun whitespace

2. **URLs uten protokoll**
   - ✅ URLs uten http:// eller https://
   - ✅ Legger til https:// automatisk

3. **Store query strings**
   - ✅ 100+ parametere
   - ✅ Tracking params fjernes korrekt

4. **Invalid domain**
   - ✅ Håndterer gracefully
   - ✅ Returnerer normalisert versjon

5. **Special characters**
   - ✅ URL-encoded characters
   - ✅ Fragments (#section)

6. **Empty/null/undefined**
   - ✅ Håndterer alle edge cases

### Kjør Tester

```bash
npm test lib/utils/__tests__/url-validation.test.ts
```

## Eksempler

### Normalisering

```typescript
// Input med whitespace og tracking params
"  https://www.temu.com/goods.html?goods_id=123&utm_source=google&ref=abc  "

// Output
"https://www.temu.com/goods.html?goods_id=123"
```

### Validering

```typescript
// Temu
isValidTemuUrl("https://www.temu.com/goods.html") // true
isValidTemuUrl("www.temu.com/goods.html") // true (legger til https://)
isValidTemuUrl("  https://www.temu.com/goods.html  ") // true (trim)

// Alibaba
isValidAlibabaUrl("https://www.alibaba.com/product-detail/123.html") // true
isValidAlibabaUrl("https://www.alibaba.com/product.html") // true (best effort)
isAlibabaProductUrl("https://www.alibaba.com/product-detail/123.html") // true
isAlibabaProductUrl("https://www.alibaba.com/product.html") // false
```

## Fordeler

1. **DRY Principle**: Ingen duplisert logikk
2. **Konsistens**: Samme normalisering i frontend og backend
3. **Testbarhet**: Enkelt å teste isolert
4. **Vedlikehold**: Endringer på ett sted
5. **Type Safety**: TypeScript types for alle funksjoner

## Breaking Changes

**Ingen** - Eksisterende funksjonalitet fungerer uendret, med forbedret konsistens.

## Notater

- Utility-modulen er ren logikk uten avhengigheter (unntatt native URL API)
- Kan brukes både i frontend og backend
- Alle funksjoner er pure functions (ingen side effects)
- Defensive coding: håndterer alle edge cases gracefully

