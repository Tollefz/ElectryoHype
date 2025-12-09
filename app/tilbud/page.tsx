import { prisma } from '@/lib/prisma';
import ProductCard from '@/components/ProductCard';
import Link from 'next/link';
import { ChevronRight, Tag } from 'lucide-react';

export default async function TilbudPage() {
  // Hent alle produkter med rabatt (compareAtPrice > price)
  const discountedProducts = await prisma.product.findMany({
    where: {
      isActive: true,
      compareAtPrice: {
        not: null,
        gt: 0,
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
    select: {
      id: true,
      name: true,
      slug: true,
      price: true,
      compareAtPrice: true,
      images: true,
      category: true,
    },
  });

  // Filtrer produkter hvor compareAtPrice faktisk er høyere enn price
  const actualDiscounted = discountedProducts.filter((product) => {
    if (!product.compareAtPrice) return false;
    return Number(product.compareAtPrice) > Number(product.price);
  });

  // Beregn gjennomsnittlig rabatt
  const averageDiscount = actualDiscounted.length > 0
    ? Math.round(
        actualDiscounted.reduce((sum, p) => {
          const discount = ((Number(p.compareAtPrice) - Number(p.price)) / Number(p.compareAtPrice)) * 100;
          return sum + discount;
        }, 0) / actualDiscounted.length
      )
    : 0;

  return (
    <main className="min-h-screen bg-gray-light py-8">
      <div className="mx-auto max-w-7xl px-4">
        {/* Breadcrumbs */}
        <nav className="mb-6 text-sm text-gray-medium">
          <Link href="/" className="hover:text-brand">Hjem</Link>
          <span className="mx-2">/</span>
          <span className="text-dark">Ukens tilbud</span>
        </nav>

        {/* Header */}
        <div className="mb-8">
          <div className="mb-4 flex items-center gap-3">
            <Tag className="h-8 w-8 text-brand" />
            <h1 className="text-4xl font-bold text-dark">Ukens tilbud</h1>
          </div>
          <p className="text-lg text-gray-medium">
            Opptil {averageDiscount}% rabatt på utvalgte produkter. Begrenset tid!
          </p>
        </div>

        {/* Antall produkter */}
        <div className="mb-6 rounded-lg bg-brand-light p-4">
          <p className="text-sm font-semibold text-brand">
            {actualDiscounted.length} produkt{actualDiscounted.length !== 1 ? 'er' : ''} på tilbud
          </p>
        </div>

        {/* Produkter */}
        {actualDiscounted.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {actualDiscounted.map((product) => {
              const images = typeof product.images === 'string' 
                ? JSON.parse(product.images) 
                : product.images || [];
              
              const discount = Math.round(
                ((Number(product.compareAtPrice) - Number(product.price)) / Number(product.compareAtPrice)) * 100
              );

              return (
                <div key={product.id} className="relative">
                  {/* Stor rabatt-badge */}
                  <div className="absolute -left-2 -top-2 z-10 rounded-full bg-sale px-3 py-1 text-sm font-bold text-white shadow-lg">
                    -{discount}%
                  </div>
                  <ProductCard
                    product={{
                      id: product.id,
                      name: product.name,
                      slug: product.slug,
                      price: Number(product.price),
                      compareAtPrice: product.compareAtPrice ? Number(product.compareAtPrice) : null,
                      images: images,
                      category: product.category,
                    }}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl bg-white p-12 text-center">
            <Tag className="mx-auto mb-4 h-16 w-16 text-gray-border" />
            <h2 className="mb-2 text-2xl font-bold text-dark">Ingen tilbud akkurat nå</h2>
            <p className="mb-6 text-gray-medium">
              Sjekk tilbake senere for nye tilbud!
            </p>
            <Link
              href="/products"
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-6 py-3 font-semibold text-white hover:bg-brand-dark transition-colors"
            >
              Se alle produkter
              <ChevronRight size={20} />
            </Link>
          </div>
        )}

        {/* Call to action */}
        {actualDiscounted.length > 0 && (
          <section className="mt-12 rounded-xl bg-gradient-to-r from-dark to-dark-secondary p-8 text-center text-white">
            <h2 className="mb-2 text-3xl font-bold">Glemt å sjekke noe?</h2>
            <p className="mb-6 text-gray-300">
              Se vårt fulle utvalg av elektronikk og tech-produkter
            </p>
            <Link
              href="/products"
              className="inline-flex items-center gap-2 rounded-lg border-2 border-white px-6 py-3 font-semibold text-white hover:bg-white hover:text-dark transition-colors"
            >
              Se alle produkter
              <ChevronRight size={20} />
            </Link>
          </section>
        )}
      </div>
    </main>
  );
}

