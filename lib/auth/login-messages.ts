/**
 * Client-safe auth UI codes/messages — no bcrypt/prisma.
 */

export const AUTH_ERROR_CODES = {
  DATABASE_UNAVAILABLE: "DatabaseUnavailable",
  SERVICE_UNAVAILABLE: "AuthServiceUnavailable",
  AUTH_INTERNAL: "AuthInternalError",
} as const;

export function loginUiMessage(errorCode: string | undefined | null): string {
  if (
    errorCode === AUTH_ERROR_CODES.DATABASE_UNAVAILABLE ||
    errorCode === AUTH_ERROR_CODES.SERVICE_UNAVAILABLE
  ) {
    return "Kan ikke logge inn akkurat nå fordi databasen er utilgjengelig. Prøv igjen om litt.";
  }
  if (errorCode === AUTH_ERROR_CODES.AUTH_INTERNAL) {
    return "Innlogging feilet midlertidig. Prøv igjen om litt.";
  }
  return "Feil e-post eller passord";
}
