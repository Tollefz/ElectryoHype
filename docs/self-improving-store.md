# Self-Improving Store

Not a new AI module — continuous store improvement surfaced on **Rob’s Desk only**.

## Principle

> Hver dag skal butikken være litt bedre enn i går.

Admin godkjenner viktige endringer. AI oppdager og foreslår.

## Surfaces

| What | Where |
|------|--------|
| Goals / nightly summary / approvals / missions | Rob’s Desk |
| API | `POST/GET /api/admin/improve` |
| Code | `lib/improve/` |

**No new admin menu.**

## Capabilities

- **Store objectives** — measurable targets (margin, SEO, quality, reduce low-quality…)
- **Living quality score** on every product (images, SEO, description, specs, category, price, supplier, margin, stock, confidence)
- **Nightly discovery** — SEO / beskrivelse / bilder / pris / kategori / pensjonering
- **Approve → apply** with before/after impact
- **AI missions** — kick Digital Buyer toward a concrete goal
- **Inngest** `0 4 * * *` self-improve-nightly
