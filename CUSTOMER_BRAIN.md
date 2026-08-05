# AI Customer Brain

ElektroHypeX **AI CRM / Customer Brain** — forstå **kundene**, ikke bare ordrene.

**Full CRM-dokumentasjon:** [`CUSTOMER_CRM.md`](./CUSTOMER_CRM.md)

**Separat fra Buyer, Marketing, Order og Finance.**  
**Kun anbefalinger. Aldri automatisk e-post eller CRM-skriving.**

---

## Formål

Lære av kjøpshistorikk + locale + kilde:

- Personas (Gaming-entusiast, Apple-bruker, Prisjeger, …)  
- AOV, LTV, favorittkategori, kjøpshistorikk  
- Språk (`Customer.locale`)  
- Trafikkilde (når MarketingEvent knyttes til ordre)

---

## Mission Control (Rob’s Desk)

**AI CRM · Customer Brain** viser:

- Nye · Tilbakevendende · VIP · Churn · Høy LTV  
- **AI anbefaler:** «Denne kunden passer best med: Gaming · ikke Mobil»

API: `GET/POST /api/admin/customers/brain`

---

## Hardregler

1. Ingen auto-e-post / auto-rabatt.  
2. Ikke markedsføring — kun forståelse.  
3. Separat fra Buyer Store DNA (katalog) — CRM er **person**.  
