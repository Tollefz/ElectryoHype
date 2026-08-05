/**
 * Product hunt targets — pure helpers (safe for scripts / client display).
 */

/** Raw-scan ceiling when hunting for N good candidates (batched, checkpointed). */
export function scanCeilingForKeptTarget(targetKept: number): number {
  const k = Math.max(10, Math.round(targetKept));
  return Math.min(1_000_000, Math.max(k * 25, k + 2_000));
}
