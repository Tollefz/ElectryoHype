/**
 * Credentials verification — injectable for unit tests.
 * Do not import from Client Components (uses bcrypt). Use login-messages.ts on the client.
 * Never logs passwords. Never returns Prisma/Neon details.
 */

import { compare } from "bcrypt";
import { classifyAdminError } from "@/lib/admin/data-errors";
import { AUTH_ERROR_CODES } from "@/lib/auth/login-messages";

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  password: string;
};

export type VerifyCredentialsOk = {
  ok: true;
  user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
  };
};

export type VerifyCredentialsFail = {
  ok: false;
  code:
    | "INVALID_CREDENTIALS"
    | "DATABASE_UNAVAILABLE"
    | "SERVICE_UNAVAILABLE"
    | "AUTH_INTERNAL";
  message: string;
};

export type VerifyCredentialsResult = VerifyCredentialsOk | VerifyCredentialsFail;

export type VerifyCredentialsDeps = {
  findUserByEmail: (email: string) => Promise<AuthUser | null>;
  comparePassword?: (plain: string, hash: string) => Promise<boolean>;
};

export { AUTH_ERROR_CODES };

export function normalizeAuthEmail(email: string): string {
  return email.trim().toLowerCase();
}

function mapInfraCode(
  kind: string
): Extract<
  VerifyCredentialsFail["code"],
  "DATABASE_UNAVAILABLE" | "SERVICE_UNAVAILABLE"
> {
  if (kind === "timeout" || kind === "network") return "SERVICE_UNAVAILABLE";
  return "DATABASE_UNAVAILABLE";
}

export async function verifyCredentials(
  emailRaw: string | undefined,
  password: string | undefined,
  deps: VerifyCredentialsDeps
): Promise<VerifyCredentialsResult> {
  if (!emailRaw?.trim() || !password) {
    return {
      ok: false,
      code: "INVALID_CREDENTIALS",
      message: "Feil e-post eller passord",
    };
  }

  const email = normalizeAuthEmail(emailRaw);
  const comparePassword = deps.comparePassword ?? compare;

  let user: AuthUser | null;
  try {
    user = await deps.findUserByEmail(email);
  } catch (error: unknown) {
    const classified = classifyAdminError(error);
    if (
      classified.kind === "database" ||
      classified.kind === "quota" ||
      classified.kind === "timeout" ||
      classified.kind === "network"
    ) {
      const code = mapInfraCode(classified.kind);
      return {
        ok: false,
        code,
        message:
          "Kan ikke logge inn akkurat nå fordi databasen er utilgjengelig. Prøv igjen om litt.",
      };
    }
    return {
      ok: false,
      code: "AUTH_INTERNAL",
      message: "Innlogging feilet midlertidig. Prøv igjen om litt.",
    };
  }

  if (!user?.password) {
    return {
      ok: false,
      code: "INVALID_CREDENTIALS",
      message: "Feil e-post eller passord",
    };
  }

  let valid: boolean;
  try {
    valid = await comparePassword(password, user.password);
  } catch {
    return {
      ok: false,
      code: "AUTH_INTERNAL",
      message: "Innlogging feilet midlertidig. Prøv igjen om litt.",
    };
  }

  if (!valid) {
    return {
      ok: false,
      code: "INVALID_CREDENTIALS",
      message: "Feil e-post eller passord",
    };
  }

  return {
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  };
}

export function nextAuthErrorCode(
  result: VerifyCredentialsFail
): string | null {
  if (result.code === "INVALID_CREDENTIALS") return null;
  if (result.code === "DATABASE_UNAVAILABLE") {
    return AUTH_ERROR_CODES.DATABASE_UNAVAILABLE;
  }
  if (result.code === "SERVICE_UNAVAILABLE") {
    return AUTH_ERROR_CODES.SERVICE_UNAVAILABLE;
  }
  return AUTH_ERROR_CODES.AUTH_INTERNAL;
}
