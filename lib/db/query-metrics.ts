/**
 * DEV-only Prisma query metrics — no SQL/PII to clients.
 * Enable: DB_QUERY_METRICS=1 or NODE_ENV=development
 */

const enabled =
  process.env.DB_QUERY_METRICS === "1" ||
  process.env.NODE_ENV === "development";

const globalStore = globalThis as unknown as {
  __ehDbMetrics?: {
    total: number;
    byLabel: Map<string, { queries: number; durationMs: number }>;
    activeRoute: string | null;
  };
};

function store() {
  if (!globalStore.__ehDbMetrics) {
    globalStore.__ehDbMetrics = {
      total: 0,
      byLabel: new Map(),
      activeRoute: null,
    };
  }
  return globalStore.__ehDbMetrics;
}

export function dbMetricsEnabled() {
  return enabled;
}

export function beginDbRoute(label: string): () => void {
  if (!enabled) return () => undefined;
  const s = store();
  const prev = s.activeRoute;
  s.activeRoute = label;
  const started = Date.now();
  const startCount = s.total;
  return () => {
    const queries = s.total - startCount;
    const duration = Date.now() - started;
    const prevStats = s.byLabel.get(label) || { queries: 0, durationMs: 0 };
    s.byLabel.set(label, {
      queries: prevStats.queries + queries,
      durationMs: prevStats.durationMs + duration,
    });
    if (queries > 0) {
      console.warn(
        `[DB] ${label} queries=${queries} duration=${duration}ms`
      );
    }
    s.activeRoute = prev;
  };
}

export function recordDbQuery(model?: string, action?: string) {
  if (!enabled) return;
  store().total += 1;
  if (process.env.DB_QUERY_METRICS_VERBOSE === "1" && model) {
    console.warn(`[DB:q] ${model}.${action || "?"}`);
  }
}

export function getDbMetricsSnapshot() {
  const s = store();
  return {
    total: s.total,
    byLabel: Object.fromEntries(s.byLabel.entries()),
  };
}

export function resetDbMetrics() {
  const s = store();
  s.total = 0;
  s.byLabel.clear();
}
