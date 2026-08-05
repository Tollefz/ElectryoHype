import Link from "next/link";
import Image from "next/image";
import {
  Gamepad2,
  Smartphone,
  Monitor,
  Laptop,
  Home,
  Speaker,
  Refrigerator,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { shouldUnoptimizeRemoteImage } from "@/lib/utils/supplier-image";

export type HomeCategoryCard = {
  name: string;
  count: number;
  href: string;
  imageUrl?: string | null;
};

const CATEGORY_META: Record<string, { Icon: LucideIcon }> = {
  Gaming: { Icon: Gamepad2 },
  "Mobil & Tilbehør": { Icon: Smartphone },
  Mobil: { Icon: Smartphone },
  "TV, Lyd & Bilde": { Icon: Monitor },
  "TV & Lyd": { Icon: Speaker },
  "Data & IT": { Icon: Laptop },
  "PC & Data": { Icon: Laptop },
  "Hjem & Fritid": { Icon: Home },
  Hvitevarer: { Icon: Refrigerator },
};

function metaFor(name: string) {
  return CATEGORY_META[name] || { Icon: Monitor };
}

interface HomeCategoryGridProps {
  categories: HomeCategoryCard[];
}

export default function HomeCategoryGrid({ categories }: HomeCategoryGridProps) {
  return (
    <section className="ehx-section bg-white">
      <div className="ehx-container">
        <div className="mb-3.5 flex items-center justify-between gap-4 sm:mb-4">
          <h2 className="ehx-heading-2">Populære kategorier</h2>
          <Link
            href="/products"
            className="hidden items-center gap-0.5 text-sm font-semibold text-[var(--brand-dark)] transition hover:underline sm:flex"
          >
            Se alle kategorier <ChevronRight size={16} />
          </Link>
        </div>

        {categories.length === 0 ? (
          <div className="rounded-[var(--ehx-radius-lg)] border border-[var(--border)] bg-[var(--surface-muted)] p-6 text-center text-[var(--text-secondary)]">
            Ingen kategorier tilgjengelig for øyeblikket.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 lg:grid-cols-5">
            {categories.slice(0, 5).map((cat) => {
              const { Icon } = metaFor(cat.name);
              return (
                <Link
                  key={cat.name}
                  href={cat.href}
                  className="ehx-cat-card group flex flex-col overflow-hidden rounded-[1rem] border border-[var(--border)] bg-white shadow-[var(--ehx-shadow-sm)]"
                >
                  <div
                    className="relative flex aspect-[5/4] items-center justify-center overflow-hidden"
                    style={{ background: "var(--ehx-image-bg)" }}
                  >
                    <span className="absolute left-2.5 top-2.5 z-10 flex h-7 w-7 items-center justify-center rounded-lg bg-white/95 text-[var(--navy)] shadow-sm ring-1 ring-black/5">
                      <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                    </span>
                    {cat.imageUrl ? (
                      <Image
                        src={cat.imageUrl}
                        alt={cat.name}
                        fill
                        sizes="(max-width: 768px) 45vw, 18vw"
                        className="object-contain p-2 transition-transform duration-300 group-hover:scale-[1.06] sm:p-2.5"
                        unoptimized={shouldUnoptimizeRemoteImage(cat.imageUrl)}
                      />
                    ) : (
                      <Icon
                        className="h-12 w-12 text-[var(--navy)] transition-colors group-hover:text-[var(--brand-dark)] sm:h-14 sm:w-14"
                        strokeWidth={1.4}
                      />
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 px-3 py-2.5 sm:px-3.5 sm:py-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-bold text-[var(--text)] transition-colors group-hover:text-[var(--brand-dark)]">
                        {cat.name}
                      </h3>
                      <p className="mt-0.5 text-[11px] font-medium text-[var(--text-muted)]">
                        {cat.count} {cat.count === 1 ? "produkt" : "produkter"}
                      </p>
                    </div>
                    <ChevronRight
                      size={16}
                      className="shrink-0 text-[var(--text-muted)] opacity-0 transition group-hover:translate-x-0.5 group-hover:opacity-100"
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        <div className="mt-3 sm:hidden">
          <Link
            href="/products"
            className="inline-flex items-center gap-0.5 text-sm font-semibold text-[var(--brand-dark)]"
          >
            Se alle kategorier <ChevronRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}
