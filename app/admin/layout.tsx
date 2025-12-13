import { ReactNode } from "react";

/**
 * Root admin layout - No auth check here
 * 
 * This layout applies to ALL /admin routes, but does NOT perform auth checks.
 * 
 * Auth protection is handled by:
 * - (panel)/layout.tsx - protects all routes in (panel) group
 * - (auth)/login - is public and never checked
 * 
 * This prevents redirect loops because:
 * - No competing auth checks (only (panel)/layout.tsx checks auth)
 * - Login page in (auth) group never triggers (panel)/layout.tsx
 * - Middleware explicitly excludes /admin/login
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  // No auth check - let route groups handle it
  return <>{children}</>;
}
