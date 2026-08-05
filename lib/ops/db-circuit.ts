/**
 * Database circuit breaker — one cheap probe, then skip expensive loaders.
 * Prevents N× findMany → N× exceptions → React Issues when Neon is down.
 */

import { prisma } from "@/lib/prisma";
import { asResult, errFromKind, type Result } from "@/lib/result";

type CircuitState = {
  available: boolean;
  checkedAt: number;
  reason?: string;
  kind?: "database" | "quota" | "timeout";
};

const TTL_MS = 15_000;
let state: CircuitState | null = null;

export function peekDatabaseCircuit(): CircuitState | null {
  return state;
}

export function resetDatabaseCircuit() {
  state = null;
}

/**
 * Probe DB once per TTL. Returns false when unavailable — callers must not
 * run product/order queries.
 */
export async function isDatabaseAvailable(): Promise<boolean> {
  if (state && Date.now() - state.checkedAt < TTL_MS) {
    console.warn(
      `[circuit] cache hit available=${state.available} ageMs=${Date.now() - state.checkedAt}`
    );
    return state.available;
  }

  let prismaError: unknown = null;
  const probe = await asResult(async () => {
    const query = prisma.$queryRaw`SELECT 1`.catch((e: unknown) => {
      prismaError = e;
      throw e;
    });
    try {
      await Promise.race([
        query,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("__circuit_deadline__")), 5000)
        ),
      ]);
    } catch (e: unknown) {
      if (
        e instanceof Error &&
        e.message === "__circuit_deadline__" &&
        !prismaError
      ) {
        await new Promise((r) => setTimeout(r, 800));
      }
      throw prismaError ?? e;
    }
  }, "circuit:db");

  if (probe.ok) {
    state = { available: true, checkedAt: Date.now() };
    console.warn("[circuit] SELECT 1 OK → available=true");
    return true;
  }

  state = {
    available: false,
    checkedAt: Date.now(),
    reason: probe.error.reason,
    kind:
      probe.error.kind === "quota" || probe.error.kind === "timeout"
        ? probe.error.kind
        : "database",
  };
  console.warn(
    `[circuit] SELECT 1 FAIL → available=false kind=${probe.error.kind} reason=${probe.error.reason}`
  );
  return false;
}

/**
 * Run loader only if circuit is closed (DB up). Otherwise return typed failure
 * without touching Prisma again.
 */
export async function withDatabaseCircuit<T>(
  label: string,
  fn: () => Promise<T>
): Promise<Result<T>> {
  const up = await isDatabaseAvailable();
  if (!up) {
    return errFromKind(
      state?.kind || "database",
      state?.reason || "Databasen er midlertidig utilgjengelig."
    );
  }
  const result = await asResult(fn, label);
  if (
    !result.ok &&
    (result.error.kind === "database" ||
      result.error.kind === "quota" ||
      result.error.kind === "timeout")
  ) {
    state = {
      available: false,
      checkedAt: Date.now(),
      reason: result.error.reason,
      kind:
        result.error.kind === "quota" || result.error.kind === "timeout"
          ? result.error.kind
          : "database",
    };
  }
  return result;
}
