# Discovery Scheduler — validation logging

**Purpose:** Document that Discovery builds search smarter than raw score sorting.  
**Rule:** Logging and analysis only — the pick algorithm is unchanged.

## Pipeline

```
resolveNextDiscoverySeed (unchanged choice)
  → buildDiscoveryDecisionRecord (explain after the fact)
  → console.log [buyer/discovery]
  → request.discoveryValidation.decisions[]
finalizeBuyerScan
  → buildDiscoverySummary
  → console.log [buyer/discovery-summary]
  → request.discoveryValidation.summary
```

## Per decision (logged)

| Field | Source |
|-------|--------|
| Tid, familie, kategori/gruppe, query | Scheduler state |
| Valgt fordi (✔) | Catalog gap, fokus★, fatigue, gruppekvote, stay/switch |
| Utsatt + årsak | Need-score diff, fatigue, cooldown, gruppekvote |
| Cooldown / Fatigue / Sortiment / Fokus | `scoreFamilyNeedV3` inputs |
| Butikkmatch / Profit / Margin / Levering / … | **Observed yield** from candidates already kept for that family — **not** used to choose |

Product pillars are labeled explicitly as observed yield so they are never mistaken for scheduler inputs.

## Summary (end of hunt)

- Mest prioriterte / utsatte grupper
- Høy / lav fatigue-familier
- Gruppefordeling vs `HUNT_GROUP_QUOTAS`
- `behavedAsExpected` + factual notes (dominance, over-kvote, stuck fatigue)

## Where to read

- Server log: `[buyer/discovery]` and `[buyer/discovery-summary]`
- DB: `BuyerScanRun.request.discoveryValidation`
- Admin: «AI planlegger neste søk» shows `lastDecision`; Mission Control shows summary when present

## Files

- `lib/buyer/discovery-validation.ts` — records + summary
- `lib/buyer/discovery-scheduler.ts` — post-choice log hook
- `lib/buyer/scan.ts` — persist decisions + observed averages
