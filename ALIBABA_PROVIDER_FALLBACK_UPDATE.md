# AlibabaProvider HTML Fallback Update

## Oversikt

AlibabaProvider er nå utvidet med robust HTML parsing som fallback når strukturert data (JSON-LD/embedded JSON) mangler kritisk informasjon.

## Endringer

### 1. Smart Fallback Strategy

**Før:**
- Prøvde JSON-LD → Embedded JSON → Full HTML parsing (alle felter)

**Nå:**
- Prøver JSON-LD → Embedded JSON
- Sjekker om kritisk data mangler (tittel, bilder, pris)
- Bruker HTML parsing kun for manglende felter
- Full HTML parsing kun hvis strukturert data helt mangler

### 2. Robust HTML Parsing

#### Multiple Fallback Selectors
Hver type data har nå flere alternative selectors for robusthet:

**Tittel (10+ selectors):**
- `.module-pc-detail-heading .title`
- `.product-title`, `.detail-title`
- `h1.product-title`, `h1.detail-title`
- `h1` (første)
- `meta[property="og:title"]`, `meta[name="title"]`
- `.title`, `[class*='title']`

**Pris (7+ selectors):**
- `.price .price-text`
- `.price-range`, `.product-price`, `.detail-price`
- `[class*="price"]`, `[data-price]`

**Bilder (10+ selectors):**
- `.product-image-gallery img`
- `.gallery img`, `.product-images img`
- `[class*='image-gallery'] img`
- `meta[property="og:image"]`
- `[style*="background-image"]` (ekstraherer fra CSS)

**Beskrivelse (6+ selectors):**
- `#J-rich-text-description`
- `.product-description`, `.detail-description`
- `[class*='description']`
- `meta[property="og:description"]`

**Spesifikasjoner (6+ selectors):**
- `.do-entry-list li`
- `.spec-list li`, `.product-specs li`
- `table.specs tr`

### 3. Retry Logic og Rate Limiting

#### Retry Policy
- **Max retries**: 3 forsøk
- **Backoff**: Eksponentiell backoff (1s, 2s, 4s, max 5s)
- **Retry conditions**: 
  - 5xx server errors
  - Network errors
  - Timeout errors
- **No retry**: 4xx client errors

#### Rate Limiting
- Delay mellom retries
- 30 sekunder timeout
- Max 5 redirects

### 4. Bilde-validering

- Sjekker bilde-utvidelser (.jpg, .png, .gif, .webp, .svg)
- Sjekker bilde-nøkkelord (image, img, photo, picture)
- Normaliserer relative URLer
- Fjerner duplikater

## Nye Metoder

### `fetchHtmlWithRetry(url, maxRetries)`
Henter HTML med retry logic og rate limiting.

### `extractTitle($)`
Ekstraherer tittel med multiple fallback selectors.

### `extractPrice($)`
Ekstraherer pris med multiple fallback selectors.

### `extractImages($, baseUrl)`
Ekstraherer bilder med multiple fallback selectors og validering.

### `extractDescription($)`
Ekstraherer beskrivelse med multiple fallback selectors.

### `extractSpecs($)`
Ekstraherer spesifikasjoner med multiple fallback selectors.

### `extractMoqFromHtml($)`
Ekstraherer MOQ fra HTML.

### `extractShipping($)`
Ekstraherer shipping estimate.

### `isValidImageUrl(url)`
Validerer om URL er en gyldig bilde-URL.

## Testing

### Nye Tester

1. **HTML fallback parsing**
   - Tester at produktdata ekstraheres fra HTML når JSON-LD mangler
   - Bruker `alibaba-product-html-only.html` fixture

2. **Multiple selector fallbacks**
   - Tester at tittel ekstraheres med alternative selectors
   - Tester at bilder ekstraheres med alternative selectors
   - Tester at pris ekstraheres med alternative selectors

3. **Retry logic**
   - Tester at retry fungerer ved network errors
   - Tester at retry ikke skjer ved 4xx errors

4. **Smart merging**
   - Tester at HTML data fyller inn manglende felter fra strukturert data
   - Tester at eksisterende data ikke overskrives

## Test Fixtures

### `alibaba-product-html-only.html`
HTML fixture uten JSON-LD eller embedded JSON - tester full HTML parsing.

## Bruk

Provideren fungerer automatisk med smart fallback:

```typescript
const provider = new AlibabaProvider();
const rawProduct = await provider.fetchProduct("https://www.alibaba.com/product-detail/123.html");
// Automatisk: JSON-LD → Embedded JSON → HTML fallback for manglende felter
```

## Fordeler

1. **Robusthet**: Multiple selectors sikrer at data hentes selv om HTML-struktur varierer
2. **Ytelse**: Bruker strukturert data først (raskere)
3. **Pålitelighet**: HTML fallback sikrer at data hentes selv om strukturert data mangler
4. **Defensive**: Try-catch rundt alle selector-operasjoner
5. **Rate limiting**: Retry logic unngår rate limiting issues

## Breaking Changes

**Ingen** - Eksisterende funksjonalitet fungerer uendret, med forbedret robusthet.

