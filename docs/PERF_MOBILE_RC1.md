# Mobile-first Performance Audit — iPhone 13 / Slow 4G / Mid-CPU

Date: 2026-08-10 · Launch RC1 · Desktop deliberately ignored.

## Device model

| Constraint | Implication |
|------------|-------------|
| iPhone 13 viewport ~390×844 | 2-col grids; LCP ≈ above-the-fold hero + header |
| Slow 4G (~1–2 Mbps effective, high RTT) | Every KB before LCP hurts; dual downloads kill |
| Mid-range CPU | Hydration, blur, animations, third-party JS compete with INP |

## Critical (implemented)

| Issue | Why it hurt mobile | Fix | Est. gain |
|-------|-------------------|-----|-----------|
| Hero image on mobile under navy overlay | ~70KB+ decode competed for LCP while barely visible | **No hero image below `lg`** — CSS navy + text | **LCP −300–800ms** on Slow 4G |
| `ehx-fade-up` started at `opacity: 0` | Hero H1 invisible for 450ms → delayed LCP | Animations **desktop-only** (`min-width: 1024px`) | **LCP/FCP −200–450ms** perceived |
| Cookie “Godta alle” → `location.reload()` | Full second navigation on Slow 4G | Event-driven consent; **no reload** | **INP / perceived −1–3s** after consent |
| Marketing tags `afterInteractive` | Steal main thread right after paint | `lazyOnload` | **INP** after consent |

## High (implemented)

| Issue | Fix | Est. gain |
|-------|-----|-----------|
| ~8 home sections × 5 cards ≈ 40 remote images | Cap **`limit={4}`**; `content-visibility: auto` below fold | Less network + **smoother scroll** |
| Card hover image swap | Removed (useless on touch) | Less JS + no second decode |
| Card image quality 70 → 65 | Slightly smaller PLP/home payloads | Modest bytes on 4G |
| Sticky buy `backdrop-blur` | Solid `bg-white` | Cheaper compositing while scrolling PDP |
| Card lift transitions on touch | Only `@media (hover: hover)` | Less main-thread on scroll |

## Ignored (negligible on this device)

- Desktop hero glow / desktop blur
- Font micro-tuning already done
- lucide icon count in trust strip (RSC, tiny)
- Prefetch tweaks without measuring
- Desktop hover polish

## Remaining mobile bottlenecks

| Item | Priority | Why |
|------|----------|-----|
| Entire `ProductStorefront` client tree | **Critical next** | PDP LCP image + INP blocked by large hydrate |
| Full client `Header` (search + menu) | High | Hydrates on every page before cart tap feels instant |
| First-fold still loads 8 product images (2 sections × 4) | Medium | Acceptable; could blur-up / LQIP later |
| Third-party after consent still heavy | Medium | Prefer GTM-only in env |
| PLP `?q=` catalog rank on mid-CPU | Medium | Cached candidates help TTFB; rank JS still costs |

## Before → After (mobile home)

| | Before | After |
|--|--------|-------|
| Hero LCP candidate | Priority WebP (~70KB+) | **Text on navy** (0 image bytes) |
| Hero text | Animated from opacity 0 | Immediate |
| Consent accept | Full reload | In-place |
| Below-fold sections | Eager layout/paint | `content-visibility: auto` |
| Card media | Hover dual-image client | Single lazy image |

## How to verify

1. Chrome DevTools → iPhone 13 + Slow 4G throttling → Lighthouse Performance on `/`.
2. Network: confirm **no** `hero-campaign` request on mobile viewport width.
3. Performance panel: H1 visible in first paint without waiting on image.
4. Tap “Godta alle” — page must **not** reload.

Report companion: `docs/PERF_RC1_STOREFRONT.md` (general) + this mobile pass.
