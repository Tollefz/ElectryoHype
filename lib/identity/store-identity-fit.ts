/**
 * scoreStoreIdentityFit — pure, profile-driven.
 * Question: would a customer expect this product in this store?
 */

import { familyLabel, matchFamily } from "@/lib/intelligence/families";
import {
  IDENTITY_FIT_GOOD,
  IDENTITY_FIT_REJECT,
  IDENTITY_FIT_STRONG,
  IDENTITY_FIT_WEAK,
  type StoreIdentityContext,
  type StoreIdentityFitResult,
  type StoreIdentityProductInput,
  type StoreIdentitySignal,
} from "./types";
import {
  normalizeIdentityText,
  tagsToList,
  tokenizeIdentity,
  tokenOverlapRatio,
  tokenSet,
} from "./tokens";

function clamp(n: number, lo = 0, hi = 100): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function bandFor(score: number): StoreIdentityFitResult["band"] {
  if (score >= IDENTITY_FIT_STRONG) return "strong";
  if (score >= IDENTITY_FIT_GOOD) return "good";
  if (score >= IDENTITY_FIT_WEAK) return "weak";
  return "reject";
}

function explainLow(
  storeName: string,
  score: number,
  reasons: string[]
): string {
  if (score <= IDENTITY_FIT_REJECT) {
    return (
      reasons[0] ||
      `AI vurderer at kunder ikke forventer å finne dette hos ${storeName}.`
    );
  }
  if (score < IDENTITY_FIT_GOOD) {
    return (
      reasons[0] ||
      `Dette produktet passer dårlig med ${storeName}s profil.`
    );
  }
  return reasons[0] || `Passer ${storeName}s identitet.`;
}

/**
 * Multi-signal identity fit. Does not hardcode vertical-specific product names.
 */
export function scoreStoreIdentityFit(
  product: StoreIdentityProductInput,
  ctx: StoreIdentityContext
): StoreIdentityFitResult {
  const title = product.title || "";
  const familyId =
    product.familyId ??
    (matchFamily(title, product.categoryHint || undefined) || null);
  const famLabel = familyId ? familyLabel(familyId) : null;

  const tagList = tagsToList(product.tags);
  const productTokens = tokenSet([
    title,
    product.categoryHint,
    product.subcategoryHint,
    product.supplierCategory,
    product.description?.slice(0, 400),
    famLabel,
    ...tagList.slice(0, 12),
  ]);

  const identityTokens = new Set(ctx.identityTokens);
  const avoidTokens = new Set(ctx.avoidTokens);
  const signals: StoreIdentitySignal[] = [];
  const reasons: string[] = [];

  // Start neutral-low: must earn fit from store identity signals
  let score = 38;

  // --- Avoid categories (strong demotion) ---
  const avoidOverlap = tokenOverlapRatio(productTokens, avoidTokens);
  if (avoidOverlap >= 0.25) {
    const delta = -Math.round(35 + avoidOverlap * 40);
    score += delta;
    signals.push({
      id: "avoid_category",
      delta,
      detail: `Treffer unngå-kategori i butikkprofil (${Math.round(avoidOverlap * 100)}% overlap)`,
    });
    reasons.push(
      `Produktet tilhører en kategori vi normalt ikke selger (${ctx.storeName}).`
    );
  }

  // --- Profile category / strategy token overlap ---
  const profileOverlap = tokenOverlapRatio(productTokens, identityTokens);
  if (profileOverlap >= 0.35) {
    const delta = Math.round(18 + profileOverlap * 28);
    score += delta;
    signals.push({
      id: "profile_category",
      delta,
      detail: `Overlapper butikkprofilens kategorier/strategi (${Math.round(profileOverlap * 100)}%)`,
    });
  } else if (profileOverlap >= 0.15) {
    const delta = Math.round(8 + profileOverlap * 20);
    score += delta;
    signals.push({
      id: "profile_category",
      delta,
      detail: `Svak overlap mot butikkprofil (${Math.round(profileOverlap * 100)}%)`,
    });
  } else {
    const delta = -12;
    score += delta;
    signals.push({
      id: "profile_category",
      delta,
      detail: "Liten eller ingen overlap mot butikkprofilens kategorier",
    });
  }

  // --- Strategy phrase soft boost (audience/strategy already in identityTokens) ---
  if (profileOverlap >= 0.45) {
    signals.push({
      id: "strategy_token",
      delta: 4,
      detail: "Sterk språklig match mot produktstrategi/publikum",
    });
    score += 4;
  }

  // --- Product Focus stars ---
  const stars = familyId ? Number(ctx.focusStarsByFamily[familyId] ?? 0) : 0;
  if (familyId && stars >= 4) {
    const delta = 22 + (stars - 4) * 4;
    score += delta;
    signals.push({
      id: "product_focus",
      delta,
      detail: `Produktfokus ${"★".repeat(stars)} (${famLabel})`,
    });
  } else if (familyId && stars >= 2) {
    const delta = 10 + stars * 2;
    score += delta;
    signals.push({
      id: "product_focus",
      delta,
      detail: `Produktfokus ${"★".repeat(stars)} (${famLabel})`,
    });
  } else if (familyId && stars === 1) {
    score += 4;
    signals.push({
      id: "product_focus",
      delta: 4,
      detail: `Lavt produktfokus ★ (${famLabel})`,
    });
  } else if (familyId && stars <= 0) {
    const delta = -18;
    score += delta;
    signals.push({
      id: "product_focus",
      delta,
      detail: `Familien ${famLabel || familyId} er ikke prioritert i Produktfokus`,
    });
    reasons.push(
      `Produktet tilhører en kategori vi normalt ikke selger (${famLabel || familyId}).`
    );
  } else {
    const delta = -22;
    score += delta;
    signals.push({
      id: "unknown_family",
      delta,
      detail: "Ukjent produktfamilie — ikke i butikkens fokuskart",
    });
    reasons.push(
      `AI vurderer at kunder ikke forventer å finne dette hos ${ctx.storeName}.`
    );
  }

  // --- Catalog family presence (observed assortment) ---
  const share = familyId ? Number(ctx.catalogFamilyShare[familyId] ?? 0) : 0;
  const famCount = familyId ? Number(ctx.catalogFamilyCount[familyId] ?? 0) : 0;
  if (familyId && share >= 3) {
    const delta = Math.min(20, Math.round(6 + share));
    score += delta;
    signals.push({
      id: "catalog_family",
      delta,
      detail: `Finnes allerede i katalogen (${famCount} stk, ${share}% andel)`,
    });
  } else if (familyId && famCount >= 1) {
    score += 5;
    signals.push({
      id: "catalog_family",
      delta: 5,
      detail: `Litt katalog-erfaring (${famCount} stk)`,
    });
  } else if (familyId && ctx.catalogProductCount >= 8) {
    const delta = -10;
    score += delta;
    signals.push({
      id: "catalog_family",
      delta,
      detail: "Familien finnes ikke i aktiv katalog",
    });
  }

  // --- Living profile categories ---
  if (ctx.livingCategories.length > 0) {
    const livingTokens = tokenSet(ctx.livingCategories.map((c) => c.category));
    const liveOverlap = tokenOverlapRatio(productTokens, livingTokens);
    if (liveOverlap >= 0.3) {
      const delta = Math.round(8 + liveOverlap * 12);
      score += delta;
      signals.push({
        id: "living_focus",
        delta,
        detail: `Matcher levende kategori-fokus (${Math.round(liveOverlap * 100)}%)`,
      });
    } else if (liveOverlap < 0.08 && stars <= 0) {
      score -= 6;
      signals.push({
        id: "living_focus",
        delta: -6,
        detail: "Matcher ikke butikkens observerte kategori-fokus",
      });
    }
  }

  // --- DNA traits (observed identity) ---
  const strongTraits = ctx.dnaTraits.filter((t) => t.pct >= 12);
  if (strongTraits.length > 0) {
    const traitTokens = tokenSet(strongTraits.map((t) => `${t.id} ${t.label}`));
    // Also map family / title against trait ids loosely via normalize
    const text = normalizeIdentityText(
      [title, product.categoryHint, famLabel].filter(Boolean).join(" ")
    );
    let traitHits = 0;
    for (const t of strongTraits) {
      const id = normalizeIdentityText(t.id).replace(/_/g, " ");
      const label = normalizeIdentityText(t.label);
      if (
        (id && text.includes(id.replace(/\s+/g, ""))) ||
        (label && text.includes(label)) ||
        [...tokenizeIdentity(t.label)].some((tok) => productTokens.has(tok))
      ) {
        traitHits += 1;
      }
    }
    // token overlap with trait vocabulary
    const traitOverlap = tokenOverlapRatio(productTokens, traitTokens);
    if (traitHits > 0 || traitOverlap >= 0.2) {
      const delta = Math.min(16, 6 + traitHits * 4 + Math.round(traitOverlap * 10));
      score += delta;
      signals.push({
        id: "dna_trait",
        delta,
        detail: `Styrker Store DNA (${traitHits || "token"} treff)`,
      });
    } else if (stars <= 0 && share < 1) {
      score -= 8;
      signals.push({
        id: "dna_trait",
        delta: -8,
        detail: "Styrker ikke butikkens observerte DNA-trekk",
      });
    }
  }

  // --- Memory (publish/reject experience) ---
  if (familyId) {
    const exp = Number(ctx.memoryFamilyExperience[familyId] ?? 0);
    if (exp >= 25) {
      const delta = Math.min(12, Math.round(exp / 12));
      score += delta;
      signals.push({
        id: "memory",
        delta,
        detail: `Positiv butikk-erfaring for ${famLabel}`,
      });
    } else if (exp <= -25 || ctx.memoryRejectFamilies.includes(familyId)) {
      const delta = -Math.min(20, Math.round(Math.abs(exp) / 8) + 8);
      score += delta;
      signals.push({
        id: "memory",
        delta,
        detail: `Tidligere avvisninger/negativ erfaring for ${famLabel}`,
      });
      reasons.push(
        `Dette produktet passer dårlig med ${ctx.storeName}s profil (læring fra tidligere valg).`
      );
    }
  }

  // Soft shop-match hint (already computed elsewhere — never sole signal)
  if (product.shopMatchPct != null && product.shopMatchPct >= 80 && score >= 50) {
    score += 3;
  } else if (
    product.shopMatchPct != null &&
    product.shopMatchPct < 55 &&
    stars <= 0
  ) {
    score -= 5;
  }

  score = clamp(Math.round(score));
  const band = bandFor(score);

  if (band === "reject" || band === "weak") {
    if (!reasons.length) {
      reasons.push(
        band === "reject"
          ? `AI vurderer at kunder ikke forventer å finne dette hos ${ctx.storeName}.`
          : `Dette produktet passer dårlig med ${ctx.storeName}s profil.`
      );
    }
  } else if (!reasons.length) {
    reasons.push(
      score >= IDENTITY_FIT_STRONG
        ? `Styrker ${ctx.storeName}s profil — kunden forventer denne typen produkt.`
        : `Passer ${ctx.storeName}s identitet.`
    );
  }

  const normallyBlockPublish = score < IDENTITY_FIT_REJECT;
  return {
    score,
    band,
    why: explainLow(ctx.storeName, score, reasons),
    reasons: reasons.slice(0, 4),
    signals,
    familyId,
    familyLabel: famLabel,
    normallyBlockPublish,
    /** Exceptions are rare — only admin override with rationale */
    exceptionAllowed: normallyBlockPublish,
  };
}

/** Empty/neutral context for tests or cold start. */
export function emptyIdentityContext(
  storeName = "Butikken"
): StoreIdentityContext {
  return {
    version: 1,
    storeId: null,
    storeName,
    rebuiltAt: new Date().toISOString(),
    profileCategories: [],
    avoidCategories: [],
    audience: "",
    productStrategy: "",
    identityTokens: [],
    avoidTokens: [],
    focusStarsByFamily: {},
    catalogFamilyShare: {},
    catalogFamilyCount: {},
    catalogProductCount: 0,
    dnaTraits: [],
    livingCategories: [],
    memoryFamilyExperience: {},
    memoryRejectFamilies: [],
  };
}
