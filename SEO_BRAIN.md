# AI SEO Brain

ElektroHypeX SEO Brain — **overvåker** SEO. Genererer **ikke** innhold automatisk.

**Separat fra Buyer, Marketing, Order, Finance og Customer.**

---

## Formål

Følge:

- Indeksering (readiness, ikke GSC-crawl)  
- Metadata (title / description)  
- Canonical-mønster  
- Schema (Product JSON-LD readiness)  
- Intern linking via kategori  
- Kategori-SEO / Produkt-SEO  
- 404-risiko (manglende slug)  

Oppdage:

- Produkter uten metadata  
- Duplikate meta titles  
- Manglende / korte beskrivelser  
- Manglende FAQ-signal  
- Manglende lagret alt-tekst  

---

## Arkitektur

```
lib/seo-brain/
  seo-score.ts
  seo-insights.ts
  seo-memory.ts
  seo-brain.ts
  seo-desk-status.ts
  index.ts
```

Relatert (uendret): `lib/seo.ts` (metadata + JSON-LD helpers).

---

## Dashboard (Rob’s Desk)

| Felt | Betydning |
|------|-----------|
| SEO Score | Snitt 0–100 over aktive PDP-er |
| Indexering | Sider med slug + bilde + tittel |
| Warnings | Kritiske + advarsler |
| Opportunities | FAQ, alt, lange titles, osv. |

**Rob forklarer:** «Hvorfor denne siden bør forbedres» med fakta-grunnlag.

---

## Hardregler

1. **Ingen auto-generering** av titles/descriptions/FAQ.  
2. Kun observasjon + forklaring.  
3. Mennesket fikser innhold manuelt (eller via eksisterende improve-flyt med godkjenning).  

API: `GET/POST /api/admin/seo/brain`  
