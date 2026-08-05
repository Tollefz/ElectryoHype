// Diagnostic: print exactly what Node sees for DATABASE_URL
// Usage: node scripts/print-database-url.mjs
// Expect output like: "postgresql://....."
import "dotenv/config";
console.log(JSON.stringify(process.env.DATABASE_URL));
