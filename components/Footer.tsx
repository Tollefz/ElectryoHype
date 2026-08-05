import Link from "next/link";
import {
  Mail,
  Phone,
  ShieldCheck,
  Truck,
  RotateCcw,
} from "lucide-react";
import { SITE_CONFIG } from "@/lib/site";

export function Footer() {
  return (
    <footer className="border-t border-[var(--border)] bg-white">
      <div className="border-b border-[var(--border)] bg-[var(--surface-muted)]">
        <div className="ehx-container">
          <div className="grid grid-cols-1 gap-6 py-8 sm:grid-cols-3 sm:gap-8 sm:py-10">
            <div className="flex items-start gap-3.5">
              <ShieldCheck
                className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand-dark)]"
                strokeWidth={1.75}
              />
              <div>
                <p className="text-sm font-semibold text-[var(--text)]">
                  Trygg handel
                </p>
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                  Sikker betaling via Stripe
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3.5">
              <Truck
                className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand-dark)]"
                strokeWidth={1.75}
              />
              <div>
                <p className="text-sm font-semibold text-[var(--text)]">Frakt</p>
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                  Fri frakt over {SITE_CONFIG.freeShippingThreshold},– ·{" "}
                  {SITE_CONFIG.deliveryPromise}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3.5">
              <RotateCcw
                className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand-dark)]"
                strokeWidth={1.75}
              />
              <div>
                <p className="text-sm font-semibold text-[var(--text)]">
                  30 dagers åpent kjøp
                </p>
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                  Enkel retur og bytte
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="ehx-container">
        <div className="grid gap-10 py-12 sm:py-14 md:grid-cols-2 lg:grid-cols-4 lg:gap-12">
          <div>
            <h3 className="mb-5 text-sm font-semibold uppercase tracking-wide text-[var(--text)]">
              Kundeservice
            </h3>
            <ul className="space-y-3 text-sm text-[var(--text-secondary)]">
              <li>
                <Link
                  href="/kontakt"
                  className="transition hover:text-[var(--brand-dark)]"
                >
                  Kontakt oss
                </Link>
              </li>
              <li>
                <Link
                  href="/faq"
                  className="transition hover:text-[var(--brand-dark)]"
                >
                  Ofte stilte spørsmål
                </Link>
              </li>
              <li>
                <Link
                  href="/retur"
                  className="transition hover:text-[var(--brand-dark)]"
                >
                  Retur &amp; bytte
                </Link>
              </li>
              <li>
                <Link
                  href="/frakt"
                  className="transition hover:text-[var(--brand-dark)]"
                >
                  Frakt &amp; levering
                </Link>
              </li>
              <li>
                <Link
                  href="/garanti"
                  className="transition hover:text-[var(--brand-dark)]"
                >
                  Garanti
                </Link>
              </li>
            </ul>
            <div className="mt-6 space-y-3 text-sm text-[var(--text-secondary)]">
              <a
                href={`mailto:${SITE_CONFIG.supportEmail}`}
                className="flex items-center gap-2 transition hover:text-[var(--brand-dark)]"
              >
                <Mail size={15} className="shrink-0" />
                <span className="break-all">{SITE_CONFIG.supportEmail}</span>
              </a>
              <a
                href={`tel:${SITE_CONFIG.supportPhoneTel}`}
                className="flex items-center gap-2 transition hover:text-[var(--brand-dark)]"
              >
                <Phone size={15} className="shrink-0" />
                <span>{SITE_CONFIG.supportPhoneDisplay}</span>
              </a>
            </div>
          </div>

          <div>
            <h3 className="mb-5 text-sm font-semibold uppercase tracking-wide text-[var(--text)]">
              Informasjon
            </h3>
            <ul className="space-y-3 text-sm text-[var(--text-secondary)]">
              <li>
                <Link
                  href="/om-oss"
                  className="transition hover:text-[var(--brand-dark)]"
                >
                  Om oss
                </Link>
              </li>
              <li>
                <Link
                  href="/personvern"
                  className="transition hover:text-[var(--brand-dark)]"
                >
                  Personvern
                </Link>
              </li>
              <li>
                <Link
                  href="/cookies"
                  className="transition hover:text-[var(--brand-dark)]"
                >
                  Cookies
                </Link>
              </li>
              <li>
                <Link
                  href="/vilkar"
                  className="transition hover:text-[var(--brand-dark)]"
                >
                  Vilkår
                </Link>
              </li>
              <li>
                <Link
                  href="/kundeservice"
                  className="transition hover:text-[var(--brand-dark)]"
                >
                  Kundeservice
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-5 text-sm font-semibold uppercase tracking-wide text-[var(--text)]">
              Kategorier
            </h3>
            <ul className="space-y-3 text-sm text-[var(--text-secondary)]">
              <li>
                <Link
                  href="/products?category=data"
                  className="transition hover:text-[var(--brand-dark)]"
                >
                  Data &amp; IT
                </Link>
              </li>
              <li>
                <Link
                  href="/products?category=gaming"
                  className="transition hover:text-[var(--brand-dark)]"
                >
                  Gaming
                </Link>
              </li>
              <li>
                <Link
                  href="/products?category=mobil"
                  className="transition hover:text-[var(--brand-dark)]"
                >
                  Mobil &amp; Tilbehør
                </Link>
              </li>
              <li>
                <Link
                  href="/products?category=tv"
                  className="transition hover:text-[var(--brand-dark)]"
                >
                  TV, Lyd &amp; Bilde
                </Link>
              </li>
              <li>
                <Link
                  href="/products"
                  className="transition hover:text-[var(--brand-dark)]"
                >
                  Se alle kategorier
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <div className="mb-4 flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-[var(--ehx-radius-sm)] bg-[var(--brand)]">
                <span className="text-lg font-black text-white">E</span>
              </div>
              <div>
                <span className="text-lg font-bold text-[var(--text)]">
                  Electro
                </span>
                <span className="text-lg font-bold text-[var(--brand-dark)]">
                  HypeX
                </span>
              </div>
            </div>
            <p className="ehx-body mb-5 max-w-xs text-sm">
              Din destinasjon for elektronikk, gaming og tech. Kvalitet til
              konkurransedyktige priser med{" "}
              {SITE_CONFIG.deliveryPromise.toLowerCase()} i hele Norge.
            </p>
            <div className="mb-5 flex flex-wrap gap-1.5">
              <span className="rounded-[var(--ehx-radius-sm)] border border-[var(--border)] bg-white px-2 py-1 text-[10px] font-semibold text-[var(--text-secondary)]">
                Visa
              </span>
              <span className="rounded-[var(--ehx-radius-sm)] border border-[var(--border)] bg-white px-2 py-1 text-[10px] font-semibold text-[var(--text-secondary)]">
                Mastercard
              </span>
              <span className="rounded-[var(--ehx-radius-sm)] border border-[var(--border)] bg-white px-2 py-1 text-[10px] font-semibold text-[var(--text-secondary)]">
                Stripe
              </span>
              <span className="rounded-[var(--ehx-radius-sm)] border border-[var(--border)] bg-white px-2 py-1 text-[10px] font-semibold text-[var(--text-secondary)]">
                SSL
              </span>
            </div>
            {SITE_CONFIG.orgNumber ? (
              <p className="mb-4 text-xs text-[var(--text-muted)]">
                Org.nr: {SITE_CONFIG.orgNumber}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="border-t border-[var(--border)] bg-[var(--navy)]">
        <div className="ehx-container py-5">
          <p className="text-center text-xs text-slate-400 sm:text-sm">
            © {new Date().getFullYear()} {SITE_CONFIG.siteName}
            {SITE_CONFIG.orgNumber ? ` · Org.nr ${SITE_CONFIG.orgNumber}` : ""}.
            Alle rettigheter reservert.
          </p>
        </div>
      </div>
    </footer>
  );
}
