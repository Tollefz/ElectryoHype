#!/usr/bin/env node

/**
 * Local setup script for ElectryoHype
 * 
 * This script:
 * 1. Copies .env.example to .env if .env doesn't exist
 * 2. Runs prisma generate
 * 3. Runs prisma migrate dev if DATABASE_URL points to local database
 * 4. Provides clear messages about what's happening
 * 
 * Usage: npm run setup
 */

import { existsSync, copyFileSync, readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

const ENV_EXAMPLE = join(projectRoot, ".env.example");
const ENV_FILE = join(projectRoot, ".env");

/**
 * Check if DATABASE_URL points to a local database
 */
function isLocalDatabase(databaseUrl) {
  if (!databaseUrl) return false;
  
  const url = databaseUrl.toLowerCase();
  // Check for localhost, 127.0.0.1, or local database indicators
  return (
    url.includes("localhost") ||
    url.includes("127.0.0.1") ||
    url.includes(":5432") && !url.includes("neon.tech") ||
    url.includes("postgresql://postgres@localhost")
  );
}

/**
 * Read DATABASE_URL from .env file
 */
function getDatabaseUrl() {
  if (!existsSync(ENV_FILE)) {
    return null;
  }
  
  try {
    const envContent = readFileSync(ENV_FILE, "utf-8");
    const match = envContent.match(/^DATABASE_URL\s*=\s*["']?([^"'\n]+)["']?/m);
    return match ? match[1] : null;
  } catch (error) {
    console.error("❌ Failed to read .env file:", error.message);
    return null;
  }
}

/**
 * Run command and handle errors
 */
function runCommand(command, description) {
  try {
    console.log(`\n📦 ${description}...`);
    execSync(command, { 
      stdio: "inherit",
      cwd: projectRoot,
      shell: true,
    });
    console.log(`✅ ${description} completed`);
    return true;
  } catch (error) {
    console.error(`❌ ${description} failed:`, error.message);
    return false;
  }
}

/**
 * Main setup function
 */
function main() {
  console.log("🚀 Starting ElectryoHype setup...\n");

  // Step 1: Copy .env.example to .env if .env doesn't exist
  if (!existsSync(ENV_FILE)) {
    if (existsSync(ENV_EXAMPLE)) {
      console.log("📝 Copying .env.example to .env...");
      try {
        copyFileSync(ENV_EXAMPLE, ENV_FILE);
        console.log("✅ Created .env file from .env.example");
        console.log("⚠️  Please update .env with your actual values!");
      } catch (error) {
        console.error("❌ Failed to copy .env.example:", error.message);
        process.exit(1);
      }
    } else {
      console.log("⚠️  .env.example not found. Creating basic .env file...");
      try {
        const basicEnv = `# Database
# Get your DATABASE_URL from Neon Dashboard → Connection Details
DATABASE_URL="postgresql://user:password@host/database?sslmode=require"

# Store Configuration
DEFAULT_STORE_ID="default-store"

# NextAuth
# Generate a random secret: openssl rand -base64 32
NEXTAUTH_SECRET="your-secret-key-here-minst-32-tegn"
NEXTAUTH_URL="http://localhost:3000"
`;
        writeFileSync(ENV_FILE, basicEnv, "utf-8");
        console.log("✅ Created basic .env file");
        console.log("⚠️  Please update .env with your actual values!");
      } catch (error) {
        console.error("❌ Failed to create .env file:", error.message);
        process.exit(1);
      }
    }
  } else {
    console.log("✅ .env file already exists");
  }

  // Step 2: Check DATABASE_URL
  const databaseUrl = getDatabaseUrl();
  
  if (!databaseUrl || databaseUrl.includes("user:password@host") || databaseUrl.includes("your-")) {
    console.log("\n⚠️  DATABASE_URL is missing or not configured!");
    console.log("📝 To fix:");
    console.log("   1. Open .env file");
    console.log("   2. Set DATABASE_URL to your database connection string");
    console.log("   3. Get your DATABASE_URL from Neon Dashboard → Connection Details");
    console.log("   4. Run 'npm run setup' again\n");
    
    // Still run prisma generate even if DATABASE_URL is missing
    console.log("📦 Running prisma generate (without database connection)...");
    const generateSuccess = runCommand("npx prisma generate", "Prisma generate");
    
    if (!generateSuccess) {
      console.error("\n❌ Setup incomplete. Please configure DATABASE_URL and run 'npm run setup' again.");
      process.exit(1);
    }
    
    console.log("\n✅ Setup partially complete. Configure DATABASE_URL and run 'npm run setup' again to run migrations.");
    process.exit(0);
  }

  console.log("✅ DATABASE_URL is configured");

  // Step 3: Run prisma generate
  const generateSuccess = runCommand("npx prisma generate", "Prisma generate");
  
  if (!generateSuccess) {
    console.error("\n❌ Setup failed at prisma generate step.");
    process.exit(1);
  }

  // Step 4: Run prisma migrate dev if local database
  const isLocal = isLocalDatabase(databaseUrl);
  
  if (isLocal) {
    console.log("\n📦 Detected local database, running migrations...");
    const migrateSuccess = runCommand("npx prisma migrate dev", "Prisma migrate dev");
    
    if (!migrateSuccess) {
      console.error("\n⚠️  Migrations failed, but setup is mostly complete.");
      console.log("💡 You can run 'npm run db:migrate' manually later.");
    }
  } else {
    console.log("\n📦 Remote database detected (Neon/cloud)");
    console.log("💡 For remote databases, run migrations manually:");
    console.log("   npm run db:migrate  (for development)");
    console.log("   npm run db:deploy   (for production)");
  }

  // Final summary
  console.log("\n" + "=".repeat(50));
  console.log("✅ Setup complete!");
  console.log("=".repeat(50));
  console.log("\n📝 Next steps:");
  console.log("   1. Verify .env file has all required values");
  console.log("   2. Run 'npm run dev' to start the development server");
  console.log("   3. If using a remote database, run 'npm run db:migrate' to apply migrations");
  console.log("\n📚 See docs/local-setup.md for detailed instructions\n");
}

// Run setup
main();

