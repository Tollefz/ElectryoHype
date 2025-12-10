/**
 * Run a Prisma/database query safely without crashing the app.
 * On failure it logs and returns the provided fallback value.
 */
export async function safeQuery<T>(
  fn: () => Promise<T>,
  fallback: T,
  label?: string
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.error(
      `Failed to run query${label ? ` (${label})` : ''}`,
      error
    );
    return fallback;
  }
}

