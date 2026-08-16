# Storefront Performance — RC1 Pass (2026-08-10)

Senior Performance Engineer audit + implemented wins. Launch RC1: no new features; Search/Merch/Buyer/Store DNA frozen.

## Before → After (architecture)

| Signal | Before | After |
|--------|--------|-------|
| Homepage HTML | Dynamic (`headers()` in root chrome) | **Static ISR** `○ /` revalidate **1m** |
| Middleware | Ran on nearly all routes + set `x-pathname` | Admin-only matcher |
| Homepage category counts | `noStore()` + full `findMany` of categories | Cache-safe `groupBy` |
| Hero LCP | **2×** `priority` images | **1×** priority + `fetchPriority="high"` |
| Product grids | Full client `ProductCard` + section | RSC cards + media/quick-add islands |
| Root client | ThemeProvider + prod MutationObserver | Light-only; overlay/sourcemap **dev-only** |
| Fonts | Jakarta 400–800 (5 weights) | 400–700 (4 weights) |
| lucide | No package import optimize | `optimizePackageImports: ["lucide-react"]` |
| Search candidates | Full Prisma every `?q=` | `unstable_cache` 60s (ranking unchanged) |
| Sticky header | `backdrop-blur-md` | Solid `bg-white` |
| Hero glow | CSS `filter: blur(64px)` | Static radial gradient (no blur filter) |

Build verified: `npx next build` succeeded. `/` shows `○` with `Revalidate 1m`.

## Estimated performance gain

| Area | Est. gain | Confidence |
|------|-----------|------------|
| **TTFB** (home + static legal/content) | **−200–800ms+** warm/edge vs fully dynamic HTML | High |
| **LCP** (home hero) | **−100–400ms** mobile (no dual priority) | High |
| **Hydration / INP** (home + PLP cards) | **−50–150KB** client JS path; less main-thread on grids | Medium–High |
| **FCP** (fonts + fewer root clients) | **−50–150ms** typical | Medium |
| **Search TTFB** (`?q=`) | Large drop on cache hit; miss still catalog-sized | Medium |
| **Scroll paint** (no header blur) | Modest mobile INP/paint | Medium |

**Business impact:** Faster first paint and product grids → higher mobile conversion / lower bounce; ISR HTML → cheaper origin + snappier SEO crawlers.

## Critical (fixed)

1. Stopped `headers()` storefront dynamiting via `(storefront)` route group + chrome layout.
2. Removed `noStore()` from homepage category counts; switched to `groupBy`.
3. Single LCP hero image.

## High (fixed)

4. RSC `ProductCard` + `ProductCardMedia` / `ProductCardQuickAdd` islands; RSC `HomeProductSection`.
5. Dev-only `AppOverlayGuard` / `SourceMapSuppress`; removed unused `ThemeProvider` from root.
6. Cached search candidate `findMany` (Search RC1 ranking untouched).

## Medium (fixed)

7. `optimizePackageImports` for lucide-react.
8. Dropped font weight 800; storefront `font-extrabold` → `font-bold`.
9. Header blur removed; hero CSS blur removed.
10. Slimmer related-product select on PDP (no unused description fields).

## Remaining bottlenecks (next passes)

| Item | Priority | Notes |
|------|----------|-------|
| Full PDP still one large client tree (`ProductStorefront`) | High | Split RSC shell + gallery/buy islands |
| `react-hot-toast` always in root | Medium | Dynamic import / mount on demand |
| Marketing tags after consent | Medium | Prefer GTM-only; `lazyOnload` |
| Homepage cold miss still multi-query pools | Medium | OK if ISR sticks; optional raise revalidate 120–300s |
| PDP `generateMetadata` + page double fetch | Medium | Share via React `cache()` |
| Dead `framer-motion` / unused `Hero.tsx` | Low | Remove dep when safe |
| Cart/checkout full client | Low | Expected for Stripe |

## Regression checks

- URLs unchanged (route groups).
- `feeds/` + `health` kept **outside** storefront layout (no Header/Footer on XML/health).
- Admin chrome unchanged (own layouts); middleware still gates `/admin/*`.
- SEO metadata in root layout preserved (incl. Google site verification).
- Accessibility: header still a landmark; hero alt retained; cart buttons still labeled.

## How to measure on deploy

1. Lighthouse mobile on `/` and a PDP (incognito, throttling).
2. Confirm HTML has one `google-site-verification` and a single hero `imagesrcset`/`priority` candidate.
3. Check response headers / CDN for ISR on `/` (revalidate ~60s).
4. Compare JS transferred (Network → JS) home before/after.
