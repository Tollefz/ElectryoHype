const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const root = process.cwd();
const hero = path.join(root, "public/images/hero-campaign.png");
const logoSrc = path.join(root, "public/email-logo.png");

const overlaySvg = Buffer.from(`
<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a" stop-opacity="0.75"/>
      <stop offset="100%" stop-color="#0f172a" stop-opacity="0.55"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <text x="64" y="270" font-family="Arial, Helvetica, sans-serif" font-size="72" font-weight="700" fill="#ffffff">ElectroHypeX</text>
  <text x="64" y="340" font-family="Arial, Helvetica, sans-serif" font-size="30" fill="#cbd5e1">Elektronikk · Gaming · Tech i Norge</text>
  <rect x="64" y="380" width="160" height="8" fill="#16a34a"/>
</svg>
`);

async function main() {
  if (fs.existsSync(hero)) {
    const base = await sharp(hero)
      .resize(1200, 630, { fit: "cover", position: "centre" })
      .toBuffer();
    await sharp(base)
      .composite([{ input: overlaySvg, blend: "over" }])
      .jpeg({ quality: 85 })
      .toFile(path.join(root, "public/og-image.jpg"));
  } else {
    await sharp(overlaySvg)
      .jpeg({ quality: 85 })
      .toFile(path.join(root, "public/og-image.jpg"));
  }

  if (fs.existsSync(logoSrc)) {
    await sharp(logoSrc)
      .resize(512, 512, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .png()
      .toFile(path.join(root, "public/logo.png"));
  } else {
    const logoSvg = Buffer.from(`
<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" fill="#0f172a"/>
  <text x="256" y="300" text-anchor="middle" font-family="Arial" font-size="200" font-weight="700" fill="#16a34a">E</text>
</svg>`);
    await sharp(logoSvg).png().toFile(path.join(root, "public/logo.png"));
  }

  console.log("Wrote public/og-image.jpg and public/logo.png");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
