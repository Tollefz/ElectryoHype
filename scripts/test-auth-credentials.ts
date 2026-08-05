/**
 * Auth credential verification tests (mocked DB — no Neon).
 * Run: npx tsx scripts/test-auth-credentials.ts
 */
import {
  AUTH_ERROR_CODES,
  loginUiMessage,
} from "../lib/auth/login-messages";
import {
  nextAuthErrorCode,
  verifyCredentials,
  type AuthUser,
  type VerifyCredentialsFail,
} from "../lib/auth/verify-credentials";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`PASS: ${msg}`);
}

const HASH = "$2b$12$fakehashfortestsxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";

const adminUser: AuthUser = {
  id: "u1",
  email: "admin@example.com",
  name: "Admin",
  role: "admin",
  password: HASH,
};

async function main() {
  {
    const r = await verifyCredentials("Admin@Example.com ", "correct", {
      findUserByEmail: async () => adminUser,
      comparePassword: async (p) => p === "correct",
    });
    assert(r.ok === true, "A: DB OK + correct → success");
    if (r.ok) assert(r.user.role === "admin", "A: role admin preserved");
  }

  {
    const r = await verifyCredentials("admin@example.com", "wrong", {
      findUserByEmail: async () => adminUser,
      comparePassword: async () => false,
    });
    assert(
      r.ok === false && r.code === "INVALID_CREDENTIALS",
      "B: wrong password"
    );
    assert(
      nextAuthErrorCode(r as VerifyCredentialsFail) === null,
      "B: no throw code (null → CredentialsSignin)"
    );
    assert(
      loginUiMessage("CredentialsSignin") === "Feil e-post eller passord",
      "B: UI says wrong credentials"
    );
  }

  {
    const r = await verifyCredentials("nobody@example.com", "x", {
      findUserByEmail: async () => null,
      comparePassword: async () => false,
    });
    assert(
      r.ok === false && r.code === "INVALID_CREDENTIALS",
      "C: unknown user"
    );
  }

  {
    const r = await verifyCredentials("admin@example.com", "x", {
      findUserByEmail: async () => {
        throw new Error(
          "Your project has exceeded the data transfer quota. Upgrade your plan."
        );
      },
    });
    assert(
      r.ok === false && r.code === "DATABASE_UNAVAILABLE",
      "D: quota → DB unavailable"
    );
    assert(
      nextAuthErrorCode(r as VerifyCredentialsFail) ===
        AUTH_ERROR_CODES.DATABASE_UNAVAILABLE,
      "D: NextAuth throw code DatabaseUnavailable"
    );
    assert(
      !/quota|prisma|neon/i.test(r.message),
      "D: UI message has no Neon/Prisma leak"
    );
    assert(
      loginUiMessage(AUTH_ERROR_CODES.DATABASE_UNAVAILABLE).includes(
        "databasen er utilgjengelig"
      ),
      "D: login UI maps correctly"
    );
  }

  {
    const r = await verifyCredentials("admin@example.com", "x", {
      findUserByEmail: async () => {
        throw new Error("timeout");
      },
    });
    assert(r.ok === false && r.code === "SERVICE_UNAVAILABLE", "E: timeout");
    assert(
      nextAuthErrorCode(r as VerifyCredentialsFail) ===
        AUTH_ERROR_CODES.SERVICE_UNAVAILABLE,
      "E: throw AuthServiceUnavailable"
    );
  }

  {
    const r = await verifyCredentials("admin@example.com", "x", {
      findUserByEmail: async () => {
        throw new Error(
          "Can't reach database server at ep-xxx.neon.tech:5432"
        );
      },
    });
    assert(
      r.ok === false && r.code === "DATABASE_UNAVAILABLE",
      "F: connection error"
    );
    assert(!/neon\.tech|ep-/i.test(r.message), "F: no hostname in UI message");
  }

  {
    const r = await verifyCredentials("admin@example.com", "x", {
      findUserByEmail: async () => adminUser,
      comparePassword: async () => {
        throw new Error("bcrypt panic");
      },
    });
    assert(
      r.ok === false && r.code === "AUTH_INTERNAL",
      "G: compare throw → AUTH_INTERNAL"
    );
    assert(
      loginUiMessage(AUTH_ERROR_CODES.AUTH_INTERNAL).includes("midlertidig"),
      "G: UI not wrong-password"
    );
  }

  const fs = await import("fs");
  const path = await import("path");
  const middleware = fs.readFileSync(
    path.join(__dirname, "../middleware.ts"),
    "utf8"
  );
  assert(
    middleware.includes("session-token") && middleware.includes("/admin/login"),
    "Unauthenticated /admin still gated by middleware cookie check"
  );
  const layout = fs.readFileSync(
    path.join(__dirname, "../app/admin/(panel)/layout.tsx"),
    "utf8"
  );
  assert(
    layout.includes('role !== "admin"'),
    "Non-admin role still blocked in panel layout"
  );
  const authSrc = fs.readFileSync(
    path.join(__dirname, "../lib/auth.ts"),
    "utf8"
  );
  assert(
    !authSrc.includes("bypass") && !/if\s*\(.*localhost/i.test(authSrc),
    "No auth bypass / localhost allow"
  );
  assert(
    !fs
      .readFileSync(path.join(__dirname, "../scripts/update-admin.ts"), "utf8")
      .includes("Tollef"),
    "update-admin has no hardcoded password"
  );
  assert(
    fs
      .readFileSync(path.join(__dirname, "../scripts/seed.ts"), "utf8")
      .includes("ADMIN_PASSWORD"),
    "Admin seed finnes (env-based bcrypt upsert)"
  );

  console.log("\nAll auth credential tests passed.");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
