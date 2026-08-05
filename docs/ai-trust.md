# AI Trust & Continuous Improvement

Mål, forklar og lær — uten nye AI-moduler.

## Surfaces

| Surface | Path |
|---------|------|
| Admin | `/admin/trust` |
| API | `/api/admin/trust` |
| Code | `lib/trust/` |

## What it measures

- **Scorecard** per engine: beslutninger, godkjenning/avvisning, treffprosent, confidence, behandlingstid
- **Store KPIs**: tid spart, analysert/importert/publisert, margin, treffprosent, 30d forbedring
- **Human overrides**: AI foreslo X → admin valgte Y
- **Weekly self-eval** (Inngest søndag 04:00 + manuell knapp)

## Learning loop

Feedback hooks (uten å erstatte eksisterende decision-tabeller):

- Merchandiser accept/reject/dismiss
- Import publish
- Buyer alt offers
- Store Intelligence decisions (+ override når `metadata.aiValue` ≠ `humanValue`)

Store Memory + ShopProfile oppdateres i self-eval.
