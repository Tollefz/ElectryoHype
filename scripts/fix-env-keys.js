/**
 * Fix .env Stripe Keys Script
 * 
 * Dette scriptet hjelper deg å fikse ekstra anførselstegn i .env filen
 * 
 * Usage: node scripts/fix-env-keys.js
 */

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env');

console.log('🔍 Sjekker .env filen...\n');

// Sjekk om .env filen eksisterer
if (!fs.existsSync(envPath)) {
  console.error('❌ .env filen finnes ikke!');
  console.error(`   Forventet sti: ${envPath}`);
  console.error('\n💡 Opprett .env filen og kopier innholdet fra ENV_SETUP.md');
  process.exit(1);
}

// Les .env filen
let envContent = fs.readFileSync(envPath, 'utf8');
const originalContent = envContent;

// Fiks Stripe keys
let fixed = false;

// Fiks NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
const publishableKeyRegex = /^NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=(.+)$/m;
const publishableMatch = envContent.match(publishableKeyRegex);

if (publishableMatch) {
  let rawKey = publishableMatch[1].trim();
  let cleanKey = rawKey;
  
  // Fjern alle anførselstegn (både i start og slutt, og ekstra)
  cleanKey = cleanKey.replace(/^["']+|["']+$/g, '');
  
  // Hvis den fortsatt starter med anførselstegn, fjern dem også
  if (cleanKey.startsWith('"') || cleanKey.startsWith("'")) {
    cleanKey = cleanKey.replace(/^["']+/g, '');
  }
  if (cleanKey.endsWith('"') || cleanKey.endsWith("'")) {
    cleanKey = cleanKey.replace(/["']+$/g, '');
  }
  
  cleanKey = cleanKey.trim();
  
  // Sjekk om vi faktisk må fikse noe
  if (rawKey !== `"${cleanKey}"` && rawKey !== cleanKey) {
    envContent = envContent.replace(
      /^NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=.*$/m,
      `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="${cleanKey}"`
    );
    fixed = true;
    console.log('✅ Fikset NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY');
    console.log(`   Før: ${rawKey.substring(0, 20)}...`);
    console.log(`   Etter: "${cleanKey.substring(0, 20)}..."`);
  } else {
    console.log('✅ NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ser bra ut');
  }
} else {
  console.warn('⚠️  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ikke funnet i .env');
}

// Fiks STRIPE_SECRET_KEY
const secretKeyRegex = /^STRIPE_SECRET_KEY=(.+)$/m;
const secretMatch = envContent.match(secretKeyRegex);

if (secretMatch) {
  let rawKey = secretMatch[1].trim();
  let cleanKey = rawKey;
  
  // Fjern alle anførselstegn (både i start og slutt, og ekstra)
  cleanKey = cleanKey.replace(/^["']+|["']+$/g, '');
  
  // Hvis den fortsatt starter med anførselstegn, fjern dem også
  if (cleanKey.startsWith('"') || cleanKey.startsWith("'")) {
    cleanKey = cleanKey.replace(/^["']+/g, '');
  }
  if (cleanKey.endsWith('"') || cleanKey.endsWith("'")) {
    cleanKey = cleanKey.replace(/["']+$/g, '');
  }
  
  cleanKey = cleanKey.trim();
  
  // Sjekk om vi faktisk må fikse noe
  if (rawKey !== `"${cleanKey}"` && rawKey !== cleanKey) {
    envContent = envContent.replace(
      /^STRIPE_SECRET_KEY=.*$/m,
      `STRIPE_SECRET_KEY="${cleanKey}"`
    );
    fixed = true;
    console.log('✅ Fikset STRIPE_SECRET_KEY');
    console.log(`   Før: ${rawKey.substring(0, 20)}...`);
    console.log(`   Etter: "${cleanKey.substring(0, 20)}..."`);
  } else {
    console.log('✅ STRIPE_SECRET_KEY ser bra ut');
  }
} else {
  console.warn('⚠️  STRIPE_SECRET_KEY ikke funnet i .env');
}

// Skriv tilbake hvis noe ble fikset
if (fixed) {
  fs.writeFileSync(envPath, envContent, 'utf8');
  console.log('\n✅ .env filen er oppdatert!');
  console.log('\n⚠️  VIKTIG: Du må RESTARTE dev serveren for at endringene skal tre i kraft!');
  console.log('   Kjør: Ctrl+C for å stoppe serveren, deretter: npm run dev');
} else {
  console.log('\n✅ Ingen fiksing nødvendig - .env filen ser bra ut!');
}

console.log('\n💡 Tips: Kjør dette for å verifisere keys:');
console.log('   node scripts/verify-stripe-keys.js');

