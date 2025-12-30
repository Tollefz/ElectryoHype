# AlibabaProvider Dokumentasjon

## Oversikt

`AlibabaProvider` implementerer `ImportProvider` interface for å importere produkter fra Alibaba. Provideren prioriterer strukturert data (JSON-LD, embedded JSON) før full HTML scraping.

## Datahenting - Prioritering

### 1. JSON-LD (Schema.org) - Førstevalg

Provideren søker først etter JSON-LD strukturert data. Hvis kritisk data mangler (tittel, bilder, pris), brukes HTML parsing for å fylle inn manglende felter.

Provideren søker etter JSON-LD strukturert data i `<script type="application/ld+json">` tags.

**JSON Paths:**
- `@type`: Må være `"Product"` eller `"http://schema.org/Product"`
- `name` / `title`: Produkttittel
- `description`: Produktbeskrivelse
- `image`: Array eller enkelt objekt med bilde-URLer
- `offers`: Array eller objekt med prisinformasjon
  - `price`: Pris (string eller number)
  - `priceCurrency`: Valuta (default: "USD")
  - `eligibleQuantity.minValue`: MOQ (Minimum Order Quantity)
- `additionalProperty`: Array med spesifikasjoner
  - `name`: Spesifikasjonsnavn
  - `value`: Spesifikasjonsverdi

**Eksempel:**
```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Product Name",
  "offers": {
    "@type": "Offer",
    "price": "19.99",
    "priceCurrency": "USD"
  }
}
```

### 2. Embedded JSON - Andrevalg

Hvis JSON-LD ikke gir nok data, søker provideren etter embedded JSON i script tags.

**Patterns som søkes:**
- `window.__INITIAL_STATE__`
- `window.__NEXT_DATA__`
- `window.productData`
- `var productData`
- `"productInfo": {...}`
- `"product": {...}`

**JSON Paths (rekursivt søk):**
- `title` / `name` / `productName`
- `description` / `desc` / `productDescription`
- `images` / `imageList` / `gallery` / `productImages`
- `price` / `productPrice` / `unitPrice` / `salePrice`
- `variants` / `options` / `skuList` / `productOptions`
- `moq` / `minOrderQuantity` / `minimumOrderQuantity`
- `specs` / `specifications` / `attributes`

### 3. HTML Scraping - Fallback

Hvis strukturert data mangler kritisk informasjon (tittel, bilder, eller pris), brukes HTML parsing for å fylle inn manglende felter. Hvis strukturert data helt mangler, brukes full HTML parsing.

**Robust parsing med multiple fallback selectors:**

#### Tittel
- `.module-pc-detail-heading .title`
- `.product-title`, `.detail-title`
- `h1.product-title`, `h1.detail-title`
- `h1` (første)
- `meta[property="og:title"]`, `meta[name="title"]`
- `.title`, `[class*='title']`

#### Pris
- `.price .price-text`
- `.price-range`, `.product-price`, `.detail-price`, `.unit-price`
- `[class*="price"]`, `[data-price]`

#### Bilder
- `.product-image-gallery img`
- `.gallery img`, `.product-images img`, `.detail-images img`
- `[class*='image-gallery'] img`, `[class*='product-image'] img`
- `[class*='gallery'] img`, `[class*='image'] img`
- `.swiper-slide img`, `.carousel img`
- `meta[property="og:image"]`
- `[style*="background-image"]` (ekstraherer fra CSS)

**Bilde-validering:**
- Sjekker at URL inneholder bilde-utvidelser (.jpg, .png, etc.)
- Sjekker at URL inneholder bilde-nøkkelord (image, img, photo, picture)
- Normaliserer relative URLer til absolutte
- Fjerner duplikater

**Selectors:**
- **Tittel**: 
  - `.module-pc-detail-heading .title`
  - `h1` (første)
  - `meta[property="og:title"]`
  
- **Pris**:
  - `.price .price-text`
  - `.price-range`
  - `[class*="price"]` (første)
  
- **Bilder**:
  - `.product-image-gallery img`
  - `.gallery img`
  - `[class*='image'] img`
  - `meta[property="og:image"]`
  
- **Beskrivelse**:
  - `#J-rich-text-description`
  - `.product-description`
  - `meta[property="og:description"]`
  
- **Spesifikasjoner**:
  - `.do-entry-list li`
    - `.do-entry-item` (nøkkel)
    - `.do-entry-value` (verdi)
  
- **MOQ**:
  - `[class*="moq"]`
  - `[class*="MOQ"]`
  - `[class*="min"]`
  
- **Shipping**:
  - `.trade-detail-main-wrap .module-pc-ship .text`
  - `[class*="shipping"]`

## URL Normalisering

Fjerner følgende tracking-parametere:
- `utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`
- `ref`, `referrer`
- `affiliate_id`, `aff_id`, `click_id`
- `gclid`, `fbclid`, `twclid`, `li_fat_id`
- `mc_cid`, `mc_eid`
- `_ga`, `_gid`
- `spm`, `scm`, `trace`, `tracelog` (Alibaba-spesifikke)

Normaliserer:
- Domene til `www.alibaba.com` eller `www.1688.com`
- Protokoll til `https:`

## Pris-håndtering

### Pris-intervaller

Hvis pris er et intervall (f.eks. "$10.00 - $20.00"):
- `fromPrice`: Laveste pris
- `toPrice`: Høyeste pris
- `amount`: Bruker laveste pris som standard
- `currency`: Valuta (default: "USD")

Pris-intervallet lagres også i `specs.Prisintervall` for visning.

### Single Price

Hvis kun én pris finnes, brukes den direkte.

## MOQ (Minimum Order Quantity)

MOQ ekstraheres fra:
- JSON-LD: `offers[].eligibleQuantity.minValue`
- Embedded JSON: `moq` / `minOrderQuantity` / `minimumOrderQuantity`
- HTML: Tekst som matcher "MOQ: X" eller "Min. Order: X"

MOQ lagres i:
- `specs.MOQ` (som string)
- `metadata.moq` (som number)

## Variants/Options

Variants ekstraheres fra:
- JSON-LD: `offers[]` array (hvis flere offers)
- Embedded JSON: `variants` / `options` / `skuList` / `productOptions`

Hvis ingen variants finnes, opprettes en standard variant med navn "Standard".

## Mapping til MappedProduct

```typescript
{
  supplier: "alibaba",
  url: originalUrl,
  title: string,
  description: string,
  price: { amount: number, currency: string },
  images: string[],
  specs: Record<string, string>, // Inkluderer MOQ og prisintervall
  shippingEstimate?: string,
  availability: boolean,
  variants: ProductVariant[]
}
```

## Feilhåndtering

### Ingen data
Hvis ingen data kan hentes, kastes en feil:
```
"Feil ved henting av Alibaba-produkt: Kunne ikke hente nok produktdata fra Alibaba-siden"
```

### Delvis data
Hvis bare delvis data hentes:
- Produktet importeres likevel
- Warnings lagres i `metadata.warnings`
- Minimum krav: `title` eller `name` må finnes

## Testing

Se `lib/providers/__tests__/alibaba-provider.test.ts` for eksempler.

Test fixture: `lib/providers/__tests__/fixtures/alibaba-product-sample.html`

## Bruk

```typescript
import { AlibabaProvider } from "@/lib/providers";

const provider = new AlibabaProvider();
const normalizedUrl = provider.normalizeUrl("https://www.alibaba.com/product-detail/123.html?utm_source=google");
const rawProduct = await provider.fetchProduct(normalizedUrl);
const mappedProduct = provider.mapToProduct(rawProduct, normalizedUrl);
```

## Rate Limiting og Retry Policy

### Retry Logic
- **Max retries**: 3 forsøk
- **Backoff**: Eksponentiell backoff (1s, 2s, 4s, max 5s)
- **Retry conditions**: 
  - 5xx server errors
  - Network errors
  - Timeout errors
- **No retry**: 4xx client errors (ikke retry)

### Rate Limiting
- Delay mellom retries for å unngå rate limiting
- Bruker standard axios timeout (30 sekunder)
- Max 5 redirects

## Notater

- Provideren bruker `axios` og `cheerio` for HTTP requests og HTML parsing (ikke Puppeteer)
- Strukturert data prioriteres for bedre ytelse og pålitelighet
- HTML parsing brukes som fallback når strukturert data mangler kritisk informasjon
- **Smart merging**: Kun manglende felter fylles inn fra HTML (ikke overskriver eksisterende data)
- Alle bilder normaliseres til absolutte URLer
- Pris-intervaller håndteres automatisk med laveste pris som standard
- **Robust parsing**: Multiple alternative selectors for hver type data
- **Defensive coding**: Try-catch rundt alle selector-operasjoner

