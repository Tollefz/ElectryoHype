import { headers } from "next/headers";
import type { ReactNode } from "react";

/**
 * Storefront chrome (header/footer/consent) must not wrap /admin.
 * Admin has its own shell via app/admin/(panel)/layout.tsx.
 *
 * Server Component: uses x-pathname from middleware so SSR never leaks
 * storefront chrome into the admin HTML (client usePathname was too late).
 */
export async function StorefrontChrome({
  children,
  header,
  footer,
  extras,
}: {
  children: ReactNode;
  header: ReactNode;
  footer: ReactNode;
  /** Cookie banner, analytics, etc. — skipped on admin */
  extras?: ReactNode;
}) {
  const headerList = await headers();
  const pathname = headerList.get("x-pathname") || "";
  const isAdmin = pathname.startsWith("/admin");

  if (isAdmin) {
    return <>{children}</>;
  }

  return (
    <>
      <div className="flex min-h-screen flex-col">
        {header}
        <main className="flex-1">{children}</main>
        {footer}
      </div>
      {extras}
    </>
  );
}
