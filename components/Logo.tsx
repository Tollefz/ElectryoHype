/**
 * Logo-komponenter for ElektroHype
 * 
 * SVG (Scalable Vector Graphics) = Vektorbasert bildeformat
 * - Skalerer perfekt på alle skjermstørrelser (ikke pixeler)
 * - Mindre filstørrelse enn PNG/JPG
 * - Kan farges og animeres med CSS
 * - Perfekt for logoer og ikoner
 */

import React from 'react';

// LOGO 1: Minimalistisk "E" med Lyn (Anbefalt)
export function LogoV1({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-brand">
        <span className="text-xl font-black text-white">E</span>
        {/* Lyn-ikon */}
        <svg 
          className="absolute -right-1 -top-1" 
          width="14" 
          height="14" 
          viewBox="0 0 24 24" 
          fill="#00C853"
        >
          <path d="M13 3L4 14h7l-2 7 9-11h-7l2-7z"/>
        </svg>
      </div>
      <div>
        <span className="text-xl font-bold text-dark">Elektro</span>
        <span className="text-xl font-bold text-brand">Hype</span>
      </div>
    </div>
  );
}

// LOGO 2: "E" i Sirkel med Lyn
export function LogoV2({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="relative flex h-12 w-12 items-center justify-center rounded-full border-4 border-brand bg-white">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          {/* Lyn */}
          <path 
            d="M13 2L3 14h8l-1 8 10-12h-8l2-8z" 
            fill="#00C853"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          />
          {/* E bokstav */}
          <text 
            x="12" 
            y="18" 
            textAnchor="middle" 
            className="text-2xl font-black fill-dark"
            fontFamily="Inter, sans-serif"
            fontSize="16"
            fontWeight="900"
          >
            E
          </text>
        </svg>
      </div>
      <div>
        <span className="text-xl font-bold text-dark">Elektro</span>
        <span className="text-xl font-bold text-brand">Hype</span>
      </div>
    </div>
  );
}

// LOGO 3: Split-tekst med Lyn (Moderne)
export function LogoV3({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-2xl font-bold text-dark">ELEKTRO</span>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="#00C853">
        <path d="M13 2L3 14h8l-1 8 10-12h-8l2-8z"/>
      </svg>
      <span className="text-2xl font-bold text-brand">HYPE</span>
    </div>
  );
}

// LOGO 4: Enkel E med Lyn til høyre (Clean)
export function LogoV4({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-dark shadow-lg">
        <span className="text-2xl font-black text-white">E</span>
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="#00C853" className="relative -left-2 -top-1">
        <path d="M13 2L3 14h8l-1 8 10-12h-8l2-8z"/>
      </svg>
      <div>
        <div className="text-lg font-bold text-dark leading-tight">Elektro</div>
        <div className="text-lg font-bold text-brand leading-tight">Hype</div>
      </div>
    </div>
  );
}

// LOGO 5: Monogram med Lyn (Elegant)
export function LogoV5({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="relative flex h-12 w-12 items-center justify-center rounded-lg bg-brand">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          {/* Lyn inni E */}
          <path 
            d="M12 3L6 12h6l-2 8 8-10h-6l2-10z" 
            fill="white"
            opacity="0.9"
          />
        </svg>
      </div>
      <div>
        <div className="text-lg font-bold text-dark">ELEKTRO</div>
        <div className="text-lg font-bold text-brand">HYPE</div>
      </div>
    </div>
  );
}

// LOGO 6: Full Logo med Ikon (Profesjonell)
export function LogoV6({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Ikon-komponent */}
      <div className="relative flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand to-brand-dark shadow-lg">
        {/* Lyn-ikon */}
        <svg width="24" height="24" viewBox="0 0 24 24" fill="white" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <path d="M13 2L3 14h8l-1 8 10-12h-8l2-8z"/>
        </svg>
        {/* E bokstav */}
        <span className="relative text-2xl font-black text-white z-10">
          E
        </span>
      </div>
      {/* Tekst */}
      <div className="flex flex-col">
        <span className="text-xl font-bold text-dark leading-none tracking-tight">ELEKTRO</span>
        <span className="text-xl font-bold text-brand leading-none tracking-tight">HYPE</span>
        <span className="text-xs font-medium text-gray-medium mt-0.5 hidden md:block">Elektronikk & Tech</span>
      </div>
    </div>
  );
}

// Default logo (bruk LogoV1 som standard)
export default LogoV1;

