import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Edge gate for admin UI: require a NextAuth session cookie.
 * Role === admin is enforced in (panel)/layout.tsx and /api/admin/* handlers.
 *
 * Storefront chrome no longer reads x-pathname — admin is outside (storefront)
 * route group, so we do not force dynamic rendering via headers() on HTML.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isAdminPath =
    pathname.startsWith("/admin") &&
    pathname !== "/admin/login" &&
    !pathname.startsWith("/admin/login/");

  if (!isAdminPath) {
    return NextResponse.next();
  }

  const sessionToken =
    request.cookies.get("authjs.session-token")?.value ||
    request.cookies.get("__Secure-authjs.session-token")?.value ||
    request.cookies.get("next-auth.session-token")?.value ||
    request.cookies.get("__Secure-next-auth.session-token")?.value;

  if (!sessionToken) {
    const login = new URL("/admin/login", request.url);
    login.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
