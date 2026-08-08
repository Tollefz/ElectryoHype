"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CONSENT_COOKIE_NAME,
  CONSENT_STORAGE_KEY,
  type ConsentChoice,
  applyPendingAffiliateCookie,
  clearAffiliateCookie,
  readConsentFromStorage,
} from "@/lib/consent";

/**
 * Minimal ePrivacy/GDPR banner.
 * Shown because non-essential cookies (affiliate attribution + optional GA) need prior consent.
 * Strictly necessary cookies (NextAuth admin session) do not require this banner alone.
 */
export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(readConsentFromStorage() === null);
  }, []);

  const save = (value: ConsentChoice) => {
    try {
      localStorage.setItem(CONSENT_STORAGE_KEY, value);
      document.cookie = `${CONSENT_COOKIE_NAME}=${value};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
    } catch {
      /* ignore */
    }

    if (value === "all") {
      applyPendingAffiliateCookie();
      setVisible(false);
      window.location.reload();
      return;
    }

    clearAffiliateCookie();
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Informasjonskapsler"
      className="fixed inset-x-0 bottom-0 z-[100] border-t border-gray-200 bg-white p-4 sm:p-5"
    >
      <div className="mx-auto flex max-w-screen-xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-gray-700">
          <p className="font-semibold text-gray-900">Informasjonskapsler</p>
          <p className="mt-1 text-gray-600">
            Nødvendige cookies brukes til innlogging (admin) og sikkerhet. Valgfrie cookies brukes til
            affiliate-sporing, statistikk og markedsføring (GA4 / GTM / Meta / TikTok / Clarity når
            aktivert).{" "}
            <Link href="/cookies" className="underline hover:text-green-700">
              Cookie-oversikt
            </Link>
          </p>
        </div>
        <div className="flex flex-shrink-0 flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => save("necessary")}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            Kun nødvendige
          </button>
          <button
            type="button"
            onClick={() => save("all")}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
          >
            Godta alle
          </button>
        </div>
      </div>
    </div>
  );
}
