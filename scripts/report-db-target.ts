/**
 * Report DATABASE_URL target without printing secrets.
 * Run: npx tsx scripts/report-db-target.ts
 */
import fs from "fs";
import path from "path";

function classify(url: string | undefined): "local" | "remote Neon" | "other/remote" | "missing" {
  if (!url) return "missing";
  const cleaned = url.replace(/^["']|["']$/g, "");
  if (/localhost|127\.0\.0\.1/i.test(cleaned)) return "local";
  if (/neon\.tech/i.test(cleaned)) return "remote Neon";
  return "other/remote";
}

function readEnvFile(file: string): string | undefined {
  const p = path.join(process.cwd(), file);
  if (!fs.existsSync(p)) return undefined;
  const text = fs.readFileSync(p, "utf8");
  const m = text.match(/^DATABASE_URL=(.+)$/m);
  if (!m) return undefined;
  return m[1].trim();
}

console.log("process.env.DATABASE_URL:", classify(process.env.DATABASE_URL));
console.log("process.env.DIRECT_URL set:", Boolean(process.env.DIRECT_URL));
for (const f of [".env", ".env.local", ".env.development.local"]) {
  const v = readEnvFile(f);
  console.log(`${f}:`, v === undefined ? "missing or no DATABASE_URL" : classify(v));
}
