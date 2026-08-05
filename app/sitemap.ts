import { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';
import { SITE_CONFIG } from '@/lib/site';
import { DEFAULT_STORE_ID } from '@/lib/store';
import { getAllCategorySlugs } from '@/lib/categories';

export const revalidate = 3600; // Revalidate every hour

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = SITE_CONFIG.siteUrl;
  const now = new Date();

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${baseUrl}/products`,
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/tilbud`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/kontakt`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/faq`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/frakt`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/retur`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/personvern`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/vilkar`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/om-oss`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    {
      url: `${baseUrl}/kundeservice`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/garanti`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    {
      url: `${baseUrl}/cookies`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.2,
    },
  ];

  // Category pages
  const categoryPages: MetadataRoute.Sitemap = getAllCategorySlugs().map(slug => ({
    url: `${baseUrl}/products?category=${slug}`,
    lastModified: now,
    changeFrequency: 'daily',
    priority: 0.7,
  }));

  // Product pages
  let productPages: MetadataRoute.Sitemap = [];
  try {
    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        storeId: DEFAULT_STORE_ID,
        // Exclude Sport/Klær categories
        category: { notIn: ['Sport', 'Klær', 'Sport & Trening'] },
      },
      select: {
        slug: true,
        updatedAt: true,
      },
      take: 10000, // Limit to prevent timeout
    });

    productPages = products.map(product => ({
      url: `${baseUrl}/products/${product.slug}`,
      lastModified: product.updatedAt,
      changeFrequency: 'weekly',
      priority: 0.8,
    }));
  } catch (error) {
    console.error('[sitemap] Error fetching products:', error);
    // Continue without product pages if DB fails
  }

  return [...staticPages, ...categoryPages, ...productPages];
}

