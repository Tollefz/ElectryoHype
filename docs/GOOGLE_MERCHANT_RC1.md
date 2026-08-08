# Google Merchant Center — Launch RC1 readiness

**Dato:** 2026-08-08  
**Feed-URL:** `https://www.electrohypex.com/feeds/google-merchant.xml`  
**Lokal:** `http://localhost:3000/feeds/google-merchant.xml`

## Status per krav

| # | Krav | Status | Evidens |
|---|------|--------|---------|
| 1 | Product JSON-LD | **PASS** | `generateProductJSONLD` på PDP (`app/products/[slug]/page.tsx`) — Offer, priceCurrency NOK, shipping, return policy |
| 2 | GTIN / MPN / Brand | **PASS*** | Brand = ElectroHypeX. MPN = sku/supplierSku/id. GTIN kun ved **gyldig** GS1 sjekksiffer (ugyldige strekkoder droppes → `identifier_exists=false`) |
| 3 | Pris | **PASS** | `g:price` som `NN.NN NOK` |
| 4 | Salgspris | **PASS** | `g:sale_price` når compareAt > price og rabatt 5–40 % |
| 5 | Lagerstatus | **PASS** | Align med dropship: aktiv = `in_stock` (`getAvailability`) |
| 6 | Frakt | **PASS** | `g:shipping` NO / Standard / 99.00 NOK |
| 7 | Valuta | **PASS** | NOK i feed + JSON-LD |
| 8 | Produktbilder | **PASS** | 397/397 aktive med `image_link` (http) |
| 9 | Canonical URL | **PASS** | PDP `canonical: /products/{slug}` via `generateSEOMetadata` |
| 10 | sitemap.xml | **PASS** | `GET /sitemap.xml` → 200 |
| 11 | robots.txt | **PASS** | Allow `/` + `/feeds/`; sitemap-peker satt |

\*Se WARNING under GTIN/brand.

## Feed-eksport

| Sjekk | Status |
|-------|--------|
| Endpoint `/feeds/google-merchant.xml` | **PASS** (200, `application/xml`) |
| Format RSS 2.0 + `xmlns:g` | **PASS** |
| Felter: id, title, description, link, image_link, availability, price, brand, condition, gtin/mpn | **PASS** |
| Aktive produkter i feed | **PASS** (397 items bygget, 0 skipped) |

## WARNING

| Tema | Alvorlighet | Merknad |
|------|-------------|---------|
| Ugyldige leverandør-GTINer | Middels | ~90 % av strekkoder feiler GS1-sjekk. De ekskluderes nå. Få produkter har ekte GTIN (~66). |
| Brand = ElectroHypeX på alle | Lav | Akseptabelt for private label; Google kan be om mer spesifikk merkevare senere. |
| Nesten alle har sale_price | Middels | Katalog har gjennomgående compareAt. Overvåk Merchant «misleading price»-policy. |
| Fri frakt ≥ 500 kr | Lav | Ikke per linje i feed (kurvavhengig). Sett konto-regel i Merchant Center. |
| `google_product_category` | Lav | Mangler — `product_type` (butikkategori) er satt. Kan mappes i Merchant Center. |

## FAIL

Ingen åpne FAIL etter rettelser i denne runden.

### Rettelser gjort (Launch RC1-kompatible)

1. **GTIN-validering** — kun gyldige sjekksiffer i feed + JSON-LD  
2. **Availability** — følger storefront dropship-policy (`isActive` ⇒ in_stock)  
3. **robots** — eksplisitt `Allow: /feeds/`  

## Oppsett i Google Merchant Center

1. Products → Feeds → Add feed  
2. Input method: Scheduled fetch  
3. URL: `https://www.electrohypex.com/feeds/google-merchant.xml`  
4. Fetch daily  
5. Sett fraktregel: gratis over 500 NOK (matcher butikk)  
6. Bekreft nettsteds-URL + eierskap  

## Kode

- `lib/merchant/google-feed.ts`  
- `app/feeds/google-merchant.xml/route.ts`  
- `lib/seo.ts` (JSON-LD)  
- `app/robots.ts` · `app/sitemap.ts`
