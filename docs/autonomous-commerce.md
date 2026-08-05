# Autonomous Commerce Engine

Orkestreringslag som får ElectroHypeX-motorene til å samarbeide.

**Aldri automatisk publisering.** Admin godkjenner alltid storefront-publisering.

## Motors coordinated

- Supplier Engine (search / import / sync / workers)
- AI Merchandiser (find + score)
- Store Intelligence (catalog health + gaps)
- Import pipeline (enrich / SEO / pricing / categorize)
- Review (auto-approve high completeness)
- Health + change events
- Store Memory (preference learning)

## Modes

| Mode | Behavior |
|------|----------|
| **OFF** | Scan + propose only |
| **SEMI** | Import to queue; admin processes/publishes |
| **AUTO** | Import + process to Review/Approved; admin publishes |

## Schedule (Inngest)

- `0 3 * * *` — full nightly cycle
- `15 * * * *` — hourly light (tasks)
- After catalog sync (every 6h) — light cycle

## Admin

- `/admin/autonomy` — policy, Quality Gate, Store Goal, brief, tasks
- Rob’s Desk — Morgenbrief

## Code

`lib/autonomy/`
