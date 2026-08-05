/**
 * Static Event QA — verifies ecommerce events are wired in source.
 * Runtime pixel firing requires consent + env IDs in the browser.
 */
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const checks = [
  {
    event: "page_view",
    file: "components/analytics/AnalyticsRouter.tsx",
    needle: "trackPageView",
  },
  {
    event: "view_item",
    file: "app/products/[slug]/page.tsx",
    needle: "TrackViewItem",
  },
  {
    event: "add_to_cart",
    file: "lib/cart-context.tsx",
    needle: '"add_to_cart"',
  },
  {
    event: "begin_checkout",
    file: "app/cart/page.tsx",
    needle: '"begin_checkout"',
  },
  {
    event: "purchase",
    file: "app/order-confirmation/OrderConfirmationClient.tsx",
    needle: "TrackPurchaseOnce",
  },
  {
    event: "purchase_server",
    file: "app/api/webhooks/stripe/route.ts",
    needle: "firePurchaseAnalytics",
  },
  {
    event: "merchant_feed",
    file: "app/feeds/google-merchant.xml/route.ts",
    needle: "buildGoogleMerchantRss",
  },
];

let ok = true;
for (const c of checks) {
  const full = path.join(root, c.file);
  const exists = fs.existsSync(full);
  const body = exists ? fs.readFileSync(full, "utf8") : "";
  const pass = exists && body.includes(c.needle);
  console.log(`${pass ? "PASS" : "FAIL"}  ${c.event}  (${c.file})`);
  if (!pass) ok = false;
}

process.exit(ok ? 0 : 1);
