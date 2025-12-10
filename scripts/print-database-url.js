// Diagnostic: print exactly what Node sees for DATABASE_URL
// Usage: node scripts/print-database-url.js
// Expect output like: "postgresql://....."
require("dotenv").config();
console.log(JSON.stringify(process.env.DATABASE_URL));

