import "dotenv/config";
import { hash } from "bcrypt";
import { prisma } from "../lib/prisma";

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env");
  }

  const passwordHash = await hash(adminPassword, 12);

  await prisma.user.upsert({
    where: { email: adminEmail.toLowerCase() },
    create: {
      email: adminEmail.toLowerCase(),
      password: passwordHash,
      role: "admin",
      name: "Super Admin",
    },
    update: {
      password: passwordHash,
    },
  });

  const sampleProducts = [
    {
      name: "Premium Hodetelefoner",
      slug: "premium-hodetelefoner",
      shortDescription: "Støydempende hodetelefoner med 30 timer batteritid.",
      description:
        "<p>Opplev musikk uten distraksjoner med våre premium hodetelefoner med aktiv støydemping.</p>",
      category: "Elektronikk",
      images: ["https://placehold.co/600x600?text=Ingen+bilde"],
      price: 599,
      compareAtPrice: 899,
      isActive: true,
      specs: { Tilkobling: "Bluetooth 5.0", Batteri: "30 timer", Vekt: "220g" },
    },
    {
      name: "Minimalistisk Bordlampe",
      slug: "minimalistisk-bordlampe",
      shortDescription: "LED-bordlampe som passer perfekt i nordiske hjem.",
      description: "<p>Juster lysstyrken med ett trykk og skap perfekt stemning.</p>",
      category: "Hjem",
      images: ["https://placehold.co/600x600?text=Ingen+bilde"],
      price: 449,
      compareAtPrice: 599,
      isActive: true,
      specs: { Høyde: "40cm", Materiale: "Aluminium", Lyskilde: "LED" },
    },
    {
      name: "ActiveWear Treningssett",
      slug: "activewear-treningssett",
      shortDescription: "Pustende treningssett i resirkulerte materialer.",
      description: "<p>Sett bestående av tights og topp med høy komfort.</p>",
      category: "Klær",
      images: ["https://placehold.co/600x600?text=Ingen+bilde"],
      price: 799,
      compareAtPrice: 999,
      isActive: true,
      specs: { Materiale: "Resirkulert polyester", Størrelser: "XS-XL" },
    },
    {
      name: "Multisport Smartklokke",
      slug: "multisport-smartklokke",
      shortDescription: "Hold oversikt over trening og helse med stil.",
      description: "<p>GPS, pulsmåling og 7 dagers batteritid.</p>",
      category: "Sport",
      images: ["https://placehold.co/600x600?text=Ingen+bilde"],
      price: 1299,
      compareAtPrice: 1599,
      isActive: true,
      specs: { Batteri: "7 dager", Vannbestandig: "5 ATM" },
    },
  ];

  for (const product of sampleProducts) {
    await prisma.product.upsert({
      where: { slug: product.slug },
      update: {},
      create: {
        name: product.name,
        slug: product.slug,
        shortDescription: product.shortDescription,
        description: product.description,
        price: product.price,
        compareAtPrice: product.compareAtPrice,
        images: JSON.stringify(product.images),
        category: product.category,
        isActive: product.isActive,
        specs: JSON.stringify(product.specs),
        tags: JSON.stringify([]),
      },
    });
  }

  console.log("✅ Seed data inserted");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
