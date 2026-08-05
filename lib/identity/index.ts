/**
 * Store Identity Fit — generic engine driven by Store Profile / DNA.
 * Reusable across store verticals (ElectroHype, BeautyHype, …).
 */

export type {
  StoreIdentitySignalId,
  StoreIdentitySignal,
  StoreIdentityFitResult,
  StoreIdentityContext,
  StoreIdentityProductInput,
  StoreIdentityMissionSnapshot,
} from "./types";

export {
  IDENTITY_FIT_STRONG,
  IDENTITY_FIT_GOOD,
  IDENTITY_FIT_WEAK,
  IDENTITY_FIT_REJECT,
} from "./types";

export {
  scoreStoreIdentityFit,
  emptyIdentityContext,
} from "./store-identity-fit";

export {
  getStoreIdentityContext,
  invalidateStoreIdentityContextCache,
} from "./store-identity-context";

export { getStoreIdentityMissionSnapshot } from "./identity-mission";

export {
  normalizeIdentityText,
  tokenizeIdentity,
  tokenOverlapRatio,
} from "./tokens";
