/**
 * Stripe Keys Verification Script
 * Kjør denne for å sjekke at Stripe keys er riktig konfigurert
 * 
 * Usage: node scripts/verify-stripe-keys.mjs
 */

import "dotenv/config";
import Stripe from 'stripe';

console.log('🔍 Verifiserer Stripe keys...\n');

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();
const secretKey = process.env.STRIPE_SECRET_KEY?.trim();

let hasErrors = false;

// Sjekk Publishable Key
if (!publishableKey) {
  console.error('❌ NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY er ikke satt');
  hasErrors = true;
} else {
  console.log('✅ NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY funnet');
  console.log(`   Lengde: ${publishableKey.length} tegn`);
  console.log(`   Starter med: ${publishableKey.substring(0, 10)}...`);
  
  if (!publishableKey.startsWith('pk_test_') && !publishableKey.startsWith('pk_live_')) {
    console.error('   ❌ Key starter ikke med pk_test_ eller pk_live_');
    hasErrors = true;
  } else {
    console.log(`   ✅ Key har riktig format (${publishableKey.startsWith('pk_test_') ? 'test' : 'live'})`);
  }
  
  if (/\s/.test(publishableKey)) {
    console.error('   ❌ Key inneholder whitespace (mellomrom eller linjeskift)');
    hasErrors = true;
  } else {
    console.log('   ✅ Key har ingen whitespace');
  }
}

console.log('');

// Sjekk Secret Key
if (!secretKey) {
  console.error('❌ STRIPE_SECRET_KEY er ikke satt');
  hasErrors = true;
} else {
  console.log('✅ STRIPE_SECRET_KEY funnet');
  console.log(`   Lengde: ${secretKey.length} tegn`);
  console.log(`   Starter med: ${secretKey.substring(0, 10)}...`);
  
  if (!secretKey.startsWith('sk_test_') && !secretKey.startsWith('sk_live_')) {
    console.error('   ❌ Key starter ikke med sk_test_ eller sk_live_');
    hasErrors = true;
  } else {
    console.log(`   ✅ Key har riktig format (${secretKey.startsWith('sk_test_') ? 'test' : 'live'})`);
  }
  
  if (/\s/.test(secretKey)) {
    console.error('   ❌ Key inneholder whitespace (mellomrom eller linjeskift)');
    hasErrors = true;
  } else {
    console.log('   ✅ Key har ingen whitespace');
  }
}

console.log('');

// Test Stripe API connection
if (!hasErrors && secretKey) {
  const stripe = new Stripe(secretKey, {
    apiVersion: '2024-11-20.acacia',
  });
  
  console.log('🔌 Tester Stripe API connection...');
  
  // Prøv en enkel API call (min 3 kr = 300 øre for NOK)
  stripe.paymentIntents
    .create({
      amount: 300, // 3 kr - minimum for NOK
      currency: 'nok',
      metadata: { test: 'true' },
    })
    .then((intent) => {
      console.log('✅ Stripe API connection OK!');
      console.log(`   PaymentIntent ID: ${intent.id}`);
      console.log('\n🎉 Alle Stripe keys er riktig konfigurert!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Stripe API feil:');
      console.error(`   Type: ${error.type}`);
      console.error(`   Code: ${error.code}`);
      console.error(`   Message: ${error.message}`);
      console.error('\n💡 Tips:');
      if (error.code === 'invalid_api_key') {
        console.error('   - Key-en er ugyldig eller utløpt');
        console.error('   - Kopier key-en på nytt fra Stripe Dashboard');
        console.error('   - Sjekk at du har kopiert hele key-en');
      } else {
        console.error('   - Sjekk at key-en er riktig kopiert');
        console.error('   - Verifiser at du er logget inn på riktig Stripe konto');
      }
      process.exit(1);
    });
} else {
  console.error('\n❌ Fiks errors over før du tester Stripe API');
  console.error('\n💡 Tips for .env filen:');
  console.error('   NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."');
  console.error('   STRIPE_SECRET_KEY="sk_test_..."');
  console.error('   - Ingen mellomrom rundt =');
  console.error('   - Ingen mellomrom eller linjeskift i key-en');
  console.error('   - Hver key skal være på én linje');
  process.exit(1);
}
