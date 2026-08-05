/**
 * Process-local TTL cache with in-flight promise deduplication.
 * Safe for Node/Next server — not shared across serverless isolates,
 * but collapses burst traffic within one instance.
 */

export type TtlCacheOptions = {
  /** Cache TTL when last result succeeded */
  ttlOkMs: number;
  /** Cache TTL when last result failed (optional, defaults to ttlOkMs) */
  ttlFailMs?: number;
};

type Entry<T> = {
  value: T;
  expiresAt: number;
  ok: boolean;
};

export function createTtlCache<T>(opts: TtlCacheOptions) {
  const store = new Map<string, Entry<T>>();
  const inflight = new Map<string, Promise<T>>();

  function get(key: string): T | undefined {
    const e = store.get(key);
    if (!e) return undefined;
    if (Date.now() > e.expiresAt) {
      store.delete(key);
      return undefined;
    }
    return e.value;
  }

  function set(key: string, value: T, ok = true) {
    const ttl = ok ? opts.ttlOkMs : opts.ttlFailMs ?? opts.ttlOkMs;
    store.set(key, { value, expiresAt: Date.now() + ttl, ok });
  }

  function invalidate(key?: string) {
    if (key) {
      store.delete(key);
      inflight.delete(key);
    } else {
      store.clear();
      inflight.clear();
    }
  }

  /**
   * Dedup concurrent calls for the same key; respect TTL for hits.
   */
  async function getOrSet(
    key: string,
    factory: () => Promise<T>,
    isOk: (v: T) => boolean = () => true
  ): Promise<T> {
    const hit = get(key);
    if (hit !== undefined) return hit;

    const pending = inflight.get(key);
    if (pending) return pending;

    const p = (async () => {
      try {
        const value = await factory();
        set(key, value, isOk(value));
        return value;
      } finally {
        inflight.delete(key);
      }
    })();

    inflight.set(key, p);
    return p;
  }

  /** Test helpers */
  function size() {
    return store.size;
  }

  function inflightCount() {
    return inflight.size;
  }

  return { get, set, invalidate, getOrSet, size, inflightCount };
}
