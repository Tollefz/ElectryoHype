"use client";

import { motion } from "framer-motion";
import Link from "next/link";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-r from-elkjop-blue to-primary-dark px-8 py-20 text-white">
      <div className="container">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-2xl space-y-6"
        >
          <p className="inline-block rounded-full bg-white/20 px-4 py-1 text-sm font-semibold uppercase tracking-widest backdrop-blur-sm">
            Elektronikk & Tilbehør
          </p>
          <h1 className="text-4xl font-bold md:text-6xl">Velkommen til ElectroHypeX</h1>
          <p className="text-xl text-white/95">
            Oppdag vårt store utvalg av iPhone-tilbehør og elektronikk. Kvalitetsprodukter til gode priser med rask levering.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link
              href="/products"
              className="rounded-lg bg-elkjop-orange px-8 py-4 text-lg font-semibold text-white transition hover:bg-orange-600 shadow-lg"
            >
              Handle nå
            </Link>
            <Link 
              href="/products" 
              className="rounded-lg border-2 border-white bg-transparent px-8 py-4 text-lg font-semibold text-white transition hover:bg-white/10"
            >
              Se alle kategorier
            </Link>
          </div>
        </motion.div>
      </div>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 0.3, scale: 1 }}
        transition={{ duration: 0.8 }}
        className="pointer-events-none absolute -right-20 top-1/2 hidden h-[500px] w-[700px] -translate-y-1/2 rounded-full bg-white/10 blur-3xl md:block"
      />
    </section>
  );
}

