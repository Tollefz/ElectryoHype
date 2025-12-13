import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Middleware for admin routes
 * 
 * IMPORTANT: We explicitly exclude /admin/login to prevent redirect loops.
 * 
 * Why this works:
 * - /admin/login is in the (auth) route group and is public
 * - Auth protection is handled by (panel)/layout.tsx, not middleware
 * - Middleware only handles edge cases, not the main auth flow
 * - Explicit exclusion of /admin/login prevents any redirect loops
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Explicitly exclude login page - this prevents redirect loops
  // Login page is in (auth) route group and protected by (panel)/layout.tsx
  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  // For other admin routes, we let the (panel)/layout.tsx handle auth
  // This middleware can be used for additional checks if needed
  // For now, we just pass through to let NextAuth and layout handle auth

  return NextResponse.next();
}

export const config = {
  // Match all admin routes except login (which is explicitly excluded above)
  matcher: ["/admin/:path*"],
};
