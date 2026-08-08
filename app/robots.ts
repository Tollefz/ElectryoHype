import { MetadataRoute } from 'next';
import { SITE_CONFIG } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = SITE_CONFIG.siteUrl;

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/feeds/'],
        disallow: [
          '/admin/',
          '/api/',
          '/checkout/',
          '/orders/',
          '/cart/',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  };
}

