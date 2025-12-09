import { prisma } from '@/lib/prisma';
import ProductCard from '@/components/ProductCard';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronRight, Truck, Shield, CreditCard, Headphones } from 'lucide-react';
import { getCategoriesWithCounts } from '@/lib/utils/product-count';
import { getStoreIdFromHeaders } from '@/lib/store';
import { headers } from 'next/headers';

export default async function HomePage() {
  const headersList = await headers();
  const storeId = getStoreIdFromHeaders(headersList);
  const products = await prisma.product.findMany({
    where: { isActive: true, storeId },
    take: 8,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      slug: true,
      price: true,
      compareAtPrice: true,
      images: true,
      category: true,
      isActive: true,
    },
  });

  const featuredProducts = await prisma.product.findMany({
    where: { 
      isActive: true,
      storeId,
      compareAtPrice: { not: null }
    },
    take: 4,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      slug: true,
      price: true,
      compareAtPrice: true,
      images: true,
      category: true,
      isActive: true,
    },
  });

  // Get real categories with actual product counts
  const categoriesWithCounts = await getCategoriesWithCounts(storeId);
  
  // Map category names to placeholder images (can be replaced with real images later)
  const categoryImageMap: Record<string, string> = {
    'PC & Data': 'https://placehold.co/300x200/f5f5f5/333?text=PC',
    'Gaming': 'https://placehold.co/300x200/f5f5f5/333?text=Gaming',
    'TV & Lyd': 'https://placehold.co/300x200/f5f5f5/333?text=TV',
    'Mobil': 'https://placehold.co/300x200/f5f5f5/333?text=Mobil',
    'Mobil & Tilbehør': 'https://placehold.co/300x200/f5f5f5/333?text=Mobil',
    'Hvitevarer': 'https://placehold.co/300x200/f5f5f5/333?text=Hvitevarer',
    'Smart Home': 'https://placehold.co/300x200/f5f5f5/333?text=SmartHome',
    'Elektronikk': 'https://placehold.co/300x200/f5f5f5/333?text=Elektronikk',
    'Datamaskiner': 'https://placehold.co/300x200/f5f5f5/333?text=PC',
  };
  
  // Get top 6 categories by product count
  const categories = categoriesWithCounts
    .slice(0, 6)
    .map((cat) => ({
      name: cat.name,
      image: categoryImageMap[cat.name] || 'https://placehold.co/300x200/f5f5f5/333?text=' + encodeURIComponent(cat.name),
      count: cat.count,
    }));

  return (
    <main className="min-h-screen bg-gray-light">
      
      {/* HERO BANNER */}
      <section className="bg-gradient-to-r from-dark to-dark-secondary">
        <div className="mx-auto max-w-7xl px-4 py-12">
          <div className="grid items-center gap-8 md:grid-cols-2">
            <div>
              <span className="mb-4 inline-block rounded-full bg-brand px-4 py-1 text-sm font-semibold text-white">
                🔥 Ukens kampanje
              </span>
              <h1 className="mb-4 text-4xl font-bold text-white md:text-5xl">
                Opptil 40% rabatt på <span className="text-brand">gaming-utstyr</span>
              </h1>
              <p className="mb-6 text-lg text-gray-300">
                Oppgrader gaming-opplevelsen din med våre beste tilbud. 
                Begrenset tid!
              </p>
              <div className="flex gap-4">
                <Link
                  href="/products?category=gaming"
                  className="rounded-lg bg-brand px-6 py-3 font-semibold text-white hover:bg-brand-dark transition-colors"
                >
                  Se tilbud
                </Link>
                <Link
                  href="/products"
                  className="rounded-lg border-2 border-white px-6 py-3 font-semibold text-white hover:bg-white hover:text-dark transition-colors"
                >
                  Alle produkter
                </Link>
              </div>
            </div>
            <div className="relative h-64 md:h-80">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-9xl">🎮</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* USP BAR */}
      <section className="border-b border-gray-border bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="flex items-center gap-3">
              <Truck className="h-8 w-8 text-brand" />
              <div>
                <p className="text-sm font-semibold text-dark">Fri frakt</p>
                <p className="text-xs text-gray-medium">Over 500,-</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Shield className="h-8 w-8 text-brand" />
              <div>
                <p className="text-sm font-semibold text-dark">Trygg handel</p>
                <p className="text-xs text-gray-medium">Sikker betaling</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <CreditCard className="h-8 w-8 text-brand" />
              <div>
                <p className="text-sm font-semibold text-dark">Delbetaling</p>
                <p className="text-xs text-gray-medium">Med Klarna</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Headphones className="h-8 w-8 text-brand" />
              <div>
                <p className="text-sm font-semibold text-dark">Kundeservice</p>
                <p className="text-xs text-gray-medium">Man-Fre 09-18</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* KATEGORIER */}
      <section className="py-10">
        <div className="mx-auto max-w-7xl px-4">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-dark">Handle etter kategori</h2>
            <Link href="/categories" className="flex items-center text-sm font-semibold text-brand hover:underline">
              Se alle <ChevronRight size={16} />
            </Link>
          </div>
          {categories.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
              {categories.map((cat) => (
                <Link
                  key={cat.name}
                  href={`/products?category=${encodeURIComponent(cat.name)}`}
                  className="group overflow-hidden rounded-xl border border-gray-border bg-white transition-all hover:border-brand hover:shadow-lg"
                >
                  <div className="relative h-32 bg-gray-light">
                    <Image
                      src={cat.image}
                      alt={cat.name}
                      fill
                      className="object-cover transition-transform group-hover:scale-105"
                    />
                  </div>
                  <div className="p-3 text-center">
                    <h3 className="font-semibold text-dark group-hover:text-brand transition-colors">
                      {cat.name}
                    </h3>
                    <p className="text-xs text-gray-medium">
                      {cat.count} {cat.count === 1 ? 'produkt' : 'produkter'}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-gray-border bg-white p-8 text-center text-secondary">
              <p>Ingen kategorier tilgjengelig for øyeblikket.</p>
            </div>
          )}
        </div>
      </section>

      {/* UKENS TILBUD */}
      <section className="py-10">
        <div className="mx-auto max-w-7xl px-4">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔥</span>
              <h2 className="text-2xl font-bold text-dark">Ukens tilbud</h2>
              <span className="rounded-full bg-sale px-3 py-1 text-xs font-bold text-white">
                SPAR OPP TIL 40%
              </span>
            </div>
            <Link href="/tilbud" className="flex items-center text-sm font-semibold text-brand hover:underline">
              Se alle tilbud <ChevronRight size={16} />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {(featuredProducts.length > 0 ? featuredProducts : products.slice(0, 4)).map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      </section>

      {/* POPULÆRE PRODUKTER */}
      <section className="py-10">
        <div className="mx-auto max-w-7xl px-4">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-dark">Populære produkter</h2>
            <Link href="/products" className="flex items-center text-sm font-semibold text-brand hover:underline">
              Se alle produkter <ChevronRight size={16} />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </div>
      </section>

      {/* NYHETSBREV */}
      <section className="bg-dark py-12">
        <div className="mx-auto max-w-7xl px-4 text-center">
          <h2 className="mb-2 text-2xl font-bold text-white">
            Få eksklusive tilbud rett i innboksen
          </h2>
          <p className="mb-6 text-gray-400">
            Meld deg på vårt nyhetsbrev og få 10% rabatt på første ordre!
          </p>
          <div className="mx-auto flex max-w-md gap-2">
            <input
              type="email"
              placeholder="Din e-postadresse"
              className="flex-1 rounded-lg border-0 px-4 py-3 text-dark focus:outline-none focus:ring-2 focus:ring-brand"
            />
            <button className="rounded-lg bg-brand px-6 py-3 font-semibold text-white hover:bg-brand-dark transition-colors">
              Meld på
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
