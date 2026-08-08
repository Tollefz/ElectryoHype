import Link from "next/link";
import Image from "next/image";

/**
 * Campaign hero — product art stays full-opacity; only navy overlays dissolve into copy.
 */
export default function HomeHero() {
  return (
    <section className="pt-2 sm:pt-2.5 lg:pt-3">
      <div className="ehx-container">
        <div className="relative overflow-hidden rounded-[1.125rem] bg-[#0b1020] shadow-[var(--ehx-shadow-lg)]">
          {/* Mobile: full-opacity art + overlay for text contrast only */}
          <div className="pointer-events-none absolute inset-0 z-[1] lg:hidden">
            <Image
              src="/images/hero-campaign-v2.webp"
              alt=""
              fill
              priority
              sizes="100vw"
              quality={70}
              className="object-cover object-[62%_42%]"
            />
            <div
              className="absolute inset-0"
              aria-hidden
              style={{
                background:
                  "linear-gradient(180deg, rgba(11,16,32,0.88) 0%, rgba(11,16,32,0.72) 42%, rgba(11,16,32,0.9) 100%)",
              }}
            />
          </div>

          {/* Desktop: product on the right at 100% opacity — no mask / no image opacity */}
          <div className="pointer-events-none absolute inset-0 z-[1] hidden lg:block">
            <div
              className="absolute right-[6%] top-[4%] h-[92%] w-[58%] rounded-full"
              aria-hidden
              style={{
                background:
                  "radial-gradient(ellipse at 42% 48%, rgba(85,140,235,0.45) 0%, rgba(50,100,190,0.14) 42%, transparent 70%)",
                filter: "blur(64px)",
              }}
            />

            <div
              className="absolute right-[16%] top-[12%] h-[65%] w-[36%] rounded-full"
              aria-hidden
              style={{
                background:
                  "radial-gradient(ellipse at 50% 50%, rgba(120,165,255,0.2) 0%, transparent 70%)",
                filter: "blur(34px)",
              }}
            />

            {/* Product art — full opacity, never masked or faded */}
            <div className="absolute inset-y-0 right-0 w-[60%]">
              <Image
                src="/images/hero-campaign-v2.webp"
                alt="Gaming-utstyr — kampanje"
                fill
                priority
                sizes="(max-width: 1280px) 60vw, 840px"
                className="origin-[40%_48%] scale-[1.08] object-cover object-[42%_47%] xl:scale-[1.1] xl:object-[40%_46%]"
              />
            </div>

            {/* Navy dissolve for copy only — gone before the product zone */}
            <div
              className="absolute inset-0"
              aria-hidden
              style={{
                background:
                  "linear-gradient(90deg, #0b1020 0%, #0b1020 34%, rgba(11,16,32,0.88) 42%, transparent 50%)",
              }}
            />
          </div>

          <div className="relative z-10 grid min-h-[300px] items-center sm:min-h-[340px] lg:min-h-[400px] lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] xl:min-h-[440px]">
            <div className="ehx-fade-up relative flex flex-col justify-center px-6 py-9 sm:px-10 sm:py-11 lg:px-12 lg:py-12 xl:pl-14 xl:pr-4">
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

            <div className="ehx-fade-up-delay-1 relative hidden h-full min-h-[inherit] self-stretch lg:block" />
          </div>
        </div>
      </div>
    </section>
  );
}
