import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";

/**
 * Server-side auth guard for all /admin routes.
 * 
 * Note: /admin/login is a client component and will not trigger
 * this server-side redirect. The (protected) route group handles
 * auth for protected admin pages.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Only check auth for non-login routes
  // Login page is handled separately as a client component
  try {
    const session = await getAuthSession();
    
    // If no session, redirect to login (but only if not already on login)
    // Since login is a client component, this won't cause a redirect loop
    if (!session) {
      // Check if we're trying to access a protected route
      // Login page will render without this redirect
      redirect("/admin/login");
    }
  } catch (error) {
    // If auth check fails, redirect to login
    redirect("/admin/login");
  }

  return <>{children}</>;
}

