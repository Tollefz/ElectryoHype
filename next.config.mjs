/** @type {import('next').NextConfig} */
const nextConfig = {
  // NOTE: This project uses Webpack (not Turbopack) for development.
  // Turbopack is disabled via --webpack flag in package.json "dev" script.
  
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "placehold.co",
      },
      {
        protocol: "https",
        hostname: "www.alibaba.com",
      },
      {
        protocol: "https",
        hostname: "sc01.alicdn.com",
      },
      {
        protocol: "https",
        hostname: "sc02.alicdn.com",
      },
      {
        protocol: "https",
        hostname: "**.alicdn.com",
      },
      {
        protocol: "https",
        hostname: "i.ebayimg.com",
      },
      {
        protocol: "https",
        hostname: "www.ebay.com",
      },
      {
        protocol: "https",
        hostname: "www.temu.com",
      },
      {
        protocol: "https",
        hostname: "img.kwcdn.com",
      },
      {
        protocol: "https",
        hostname: "**.temu.com",
      },
      {
        protocol: "https",
        hostname: "**.ebayimg.com",
      },
      {
        protocol: "https",
        hostname: "incover.no",
      },
      {
        protocol: "https",
        hostname: "**.incover.no",
      },
      {
        protocol: "https",
        hostname: "cdn.shopify.com",
      },
      {
        protocol: "https",
        hostname: "**.shopifycdn.com",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "**.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "plus.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "unsplash.com",
      },
      {
        protocol: "https",
        hostname: "via.placeholder.com",
      },
      {
        protocol: "https",
        hostname: "placehold.co",
      },
    ],
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
};

export default nextConfig;
