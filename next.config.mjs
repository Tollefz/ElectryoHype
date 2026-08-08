/** @type {import('next').NextConfig} */
const nextConfig = {
  // NOTE: This project uses Webpack (not Turbopack) for development.
  // Turbopack is disabled via --webpack flag in package.json "dev" script.

  // Puppeteer and its plugins must not be bundled by webpack/Turbopack:
  // puppeteer-extra pulls in clone-deep, whose dynamic require() cannot be
  // statically analysed. Externalizing them makes Next.js load them with
  // native require() at runtime (server-only).
  serverExternalPackages: [
    "puppeteer",
    "puppeteer-extra",
    "puppeteer-extra-plugin",
    "puppeteer-extra-plugin-stealth",
  ],

  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 60 * 60 * 24 * 30,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "placehold.co",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "www.alibaba.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "sc01.alicdn.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "sc02.alicdn.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**.alicdn.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "i.ebayimg.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "www.ebay.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**.ebayimg.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "www.temu.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "img.kwcdn.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**.kwcdn.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**.temu.com",
        pathname: "/**",
      },
      // CJ Dropshipping CDNs (product images after import)
      {
        protocol: "https",
        hostname: "cf.cjdropshipping.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "oss-cf.cjdropshipping.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "oss.cjdropshipping.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "www.cjdropshipping.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "cjdropshipping.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**.cjdropshipping.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "incover.no",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**.incover.no",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "cdn.shopify.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**.shopifycdn.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "**.unsplash.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "plus.unsplash.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "unsplash.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "via.placeholder.com",
        pathname: "/**",
      },
    ],
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },

  async redirects() {
    return [
      { source: "/about", destination: "/om-oss", permanent: true },
      { source: "/contact", destination: "/kontakt", permanent: true },
      { source: "/privacy", destination: "/personvern", permanent: true },
      { source: "/shipping", destination: "/frakt", permanent: true },
      { source: "/terms", destination: "/vilkar", permanent: true },
      { source: "/search", destination: "/products", permanent: false },
    ];
  },
};

export default nextConfig;
