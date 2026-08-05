import Link from "next/link";
import Image from "next/image";

/**
 * Campaign hero — single illustration right, copy left.
 * Fasit: Komplett/Elkjøp campaign banner proportions.
 */
export default function HomeHero() {
  return (
    <section className="pt-2 sm:pt-2.5 lg:pt-3">
      <div className="ehx-container">
        <div className="relative overflow-hidden rounded-[1.125rem] bg-[#0b1220] shadow-[var(--ehx-shadow-lg)]">
          <div
            className="pointer-events-none absolute inset-0"
            aria-hidden
            style={{
              background:
                "radial-gradient(ellipse 65% 85% at 78% 48%, rgba(55,70,105,0.5), transparent 60%), radial-gradient(ellipse 45% 55% at 15% 75%, rgba(0,184,74,0.07), transparent 55%), linear-gradient(118deg, #09101a 0%, #0c1424 42%, #121b30 100%)",
            }}
          />

          <div className="relative grid min-h-[300px] items-center sm:min-h-[340px] lg:min-h-[380px] lg:grid-cols-[0.92fr_1.08fr] xl:min-h-[420px]">
            {/* Left — campaign copy (vertically centered) */}
            <div className="ehx-fade-up relative z-10 flex flex-col justify-center px-6 py-9 sm:px-10 sm:py-11 lg:px-12 lg:py-12 xl:pl-14 xl:pr-6">
              <span className="mb-4 inline-flex w-fit items-center rounded-md bg-[var(--brand)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.05em] text-white sm:mb-5 sm:text-[11px]">
                Opptil 25% på utvalgte produkter
              </span>
              <h1 className="text-[clamp(2.1rem,4.4vw,3.35rem)] font-extrabold leading-[1.06] tracking-tight text-white">
                Smart teknologi
                <br />
                til hverdagen
              </h1>
              <p className="mt-3.5 max-w-md text-[0.9375rem] leading-relaxed text-slate-300 sm:mt-4 sm:text-base">
                Kvalitetsprodukter til konkurransedyktige priser.
              </p>
              <div className="mt-5 flex flex-col gap-2.5 sm:mt-6 sm:flex-row sm:items-center sm:gap-3">
                <Link
                  href="/tilbud"
                  className="ehx-btn ehx-btn-primary h-11 min-w-[148px] px-7 text-sm sm:h-12 sm:px-8"
                >
                  Se alle tilbud
                </Link>
                <Link
                  href="/products"
                  className="ehx-btn inline-flex h-11 min-w-[148px] border border-white/40 bg-transparent px-7 text-sm text-white hover:border-white/60 hover:bg-white/10 sm:h-12 sm:px-8"
                >
                  Utforsk kategorier
                </Link>
              </div>
            </div>

            {/* Right — ONE campaign illustration */}
            <div className="ehx-fade-up-delay-1 relative hidden h-full self-stretch lg:block">
              <div
                className="pointer-events-none absolute left-[10%] top-[12%] h-[76%] w-[80%] rounded-full opacity-50"
                aria-hidden
                style={{
                  background:
                    "radial-gradient(circle, rgba(130,150,190,0.28) 0%, transparent 68%)",
                }}
              />
              <Image
                src="/images/hero-campaign.webp"
                alt="Gaming-utstyr — kampanje"
                fill
                priority
                sizes="(max-width: 1280px) 55vw, 700px"
                className="scale-[1.08] object-contain object-[center_55%] xl:scale-[1.12]"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
