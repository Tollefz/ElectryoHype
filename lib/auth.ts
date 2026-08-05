import { compare } from "bcrypt";
import NextAuth, { type NextAuthOptions, getServerSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "./prisma";
import {
  nextAuthErrorCode,
  verifyCredentials,
} from "@/lib/auth/verify-credentials";
import { logAdminError } from "@/lib/admin/admin-logger";

export const authOptions: NextAuthOptions = {
  pages: {
    signIn: "/admin/login",
  },
  session: {
    strategy: "jwt",
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const result = await verifyCredentials(
          credentials?.email,
          credentials?.password,
          {
            findUserByEmail: async (email) => {
              const user = await prisma.user.findUnique({
                where: { email },
                select: {
                  id: true,
                  email: true,
                  name: true,
                  role: true,
                  password: true,
                },
              });
              if (!user) return null;
              return {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                password: user.password,
              };
            },
            comparePassword: (plain, hash) => compare(plain, hash),
          }
        );

        if (result.ok) {
          return {
            id: result.user.id,
            email: result.user.email,
            name: result.user.name,
            role: result.user.role,
          };
        }

        const throwCode = nextAuthErrorCode(result);
        if (throwCode) {
          // NextAuth v4 passes error.message to client when authorize throws
          logAdminError(result.code, {
            label: "auth:authorize",
            api: "credentials",
          });
          throw new Error(throwCode);
        }

        // Invalid credentials — return null → CredentialsSignin (no user enumeration)
        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user && "role" in user) {
        token.role = (user as { role?: string }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
};

export const { handlers: authHandlers } = NextAuth(authOptions);

export const getAuthSession = () => getServerSession(authOptions);
