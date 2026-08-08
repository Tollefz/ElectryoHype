/**
 * One-off: crush studio midtones toward #0b1020 and bake left fade.
 * Source: public/images/hero-campaign.source.png
 * Run: node scripts/polish-hero-image.mjs
 */
import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, "../public/images");
const backup = path.join(dir, "hero-campaign.source.png");

const src = await sharp(backup).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const w = src.info.width;
const h = src.info.height;
const navy = [11, 16, 32];
const out = Buffer.from(src.data);
const fadeW = Math.floor(w * 0.28);

for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    let r = src.data[i];
    let g = src.data[i + 1];
    let b = src.data[i + 2];
    let a = 255;
    const min = Math.min(r, g, b);
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    if (lum > 35 && lum < 240) {
      const peak = Math.exp(-Math.pow((lum - 185) / 65, 2));
      let mix = peak * 0.72;
      if (min > 225) mix *= Math.max(0, 1 - (min - 225) / 30);
      r = Math.round(r * (1 - mix) + navy[0] * mix);
      g = Math.round(g * (1 - mix) + navy[1] * mix);
      b = Math.round(b * (1 - mix) + navy[2] * mix);
      const dim = 1 - peak * 0.18;
      r = Math.round(r * dim);
      g = Math.round(g * dim);
      b = Math.round(b * dim);
    }

    if (x < fadeW) {
      const t = x / fadeW;
      const s = t * t * (3 - 2 * t);
      const colorMix = Math.pow(1 - s, 0.85);
      r = Math.round(r * (1 - colorMix) + navy[0] * colorMix);
      g = Math.round(g * (1 - colorMix) + navy[1] * colorMix);
      b = Math.round(b * (1 - colorMix) + navy[2] * colorMix);
      a = Math.round(255 * Math.min(1, 0.06 + s * 0.94));
    }

    out[i] = Math.min(255, r);
    out[i + 1] = Math.min(255, g);
    out[i + 2] = Math.min(255, b);
    out[i + 3] = a;
  }
}

for (const name of ["hero-campaign", "hero-campaign-v2"]) {
  await sharp(out, { raw: { width: w, height: h, channels: 4 } })
    .webp({ quality: 92, alphaQuality: 100 })
    .toFile(path.join(dir, `${name}.webp`));
  await sharp(out, { raw: { width: w, height: h, channels: 4 } })
    .png()
    .toFile(path.join(dir, `${name}.png`));
  await sharp(out, { raw: { width: w, height: h, channels: 4 } })
    .flatten({ background: { r: 11, g: 16, b: 32 } })
    .jpeg({ quality: 92 })
    .toFile(path.join(dir, `${name}.jpg`));
}

console.log("hero assets updated");
