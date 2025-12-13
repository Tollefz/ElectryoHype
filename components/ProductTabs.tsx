'use client';

import { useState } from 'react';

interface ProductTabsProps {
  description: string;
  specifications?: Record<string, string>;
}

export default function ProductTabs({ description, specifications }: ProductTabsProps) {
  const [activeTab, setActiveTab] = useState<'description' | 'specs' | 'reviews'>('description');

  const tabs = [
    { id: 'description', label: 'Beskrivelse' },
    { id: 'specs', label: 'Spesifikasjoner' },
    { id: 'reviews', label: 'Anmeldelser' },
  ] as const;

  return (
    <div className="mt-8 rounded-xl bg-white p-6">
      {/* Tab headers */}
      <div className="border-b border-gray-border">
        <div className="flex gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 font-semibold transition-colors ${
                activeTab === tab.id
                  ? 'border-b-2 border-brand text-brand'
                  : 'text-gray-medium hover:text-dark'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="py-6">
        {activeTab === 'description' && (
          <div className="prose max-w-none">
            {description && description !== 'Ingen beskrivelse tilgjengelig.' ? (
              <div 
                className="text-gray-medium leading-relaxed whitespace-pre-wrap"
                dangerouslySetInnerHTML={{ __html: description }}
              />
            ) : (
              <div className="text-gray-medium leading-relaxed">
                <p className="mb-4">
                  Dette produktet er en del av vårt utvalg av elektronikk og tilbehør. 
                  Vi leverer kvalitetsprodukter med fokus på funksjonalitet og verdi.
                </p>
                <p className="mb-4">
                  Produktet leveres med full garanti og støtte fra vårt team. 
                  Hvis du har spørsmål om produktet, kan du kontakte vår kundeservice.
                </p>
                <p className="text-sm text-gray-600">
                  <strong>Levering:</strong> 5–12 virkedager etter ordrebehandling.
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'specs' && (
          <div className="space-y-3">
            {specifications && Object.keys(specifications).length > 0 ? (
              Object.entries(specifications).map(([key, value]) => (
                <div key={key} className="flex border-b border-gray-border py-2">
                  <span className="w-1/3 font-semibold text-dark">{key}</span>
                  <span className="w-2/3 text-gray-medium">{value}</span>
                </div>
              ))
            ) : (
              <div>
                <h3 className="mb-4 text-lg font-semibold">Generelle spesifikasjoner</h3>
                <div className="space-y-2">
                  <div className="flex border-b py-2">
                    <span className="w-1/3 font-semibold">Merke</span>
                    <span className="w-2/3 text-gray-medium">ElectroHypeX</span>
                  </div>
                  <div className="flex border-b py-2">
                    <span className="w-1/3 font-semibold">Garanti</span>
                    <span className="w-2/3 text-gray-medium">2 år</span>
                  </div>
                  <div className="flex border-b py-2">
                    <span className="w-1/3 font-semibold">Leveringstid</span>
                    <span className="w-2/3 text-gray-medium">5–12 virkedager</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'reviews' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-bold text-dark">4.2 av 5</h3>
                <div className="flex items-center gap-2">
                  <div className="flex text-xl text-brand">
                    {'★★★★☆'.split('').map((star, i) => (
                      <span key={i}>{star}</span>
                    ))}
                  </div>
                  <span className="text-sm text-gray-medium">(24 anmeldelser)</span>
                </div>
              </div>
              <button className="rounded-lg border border-brand px-6 py-2 font-semibold text-brand hover:bg-brand hover:text-white transition-colors">
                Skriv anmeldelse
              </button>
            </div>

            {/* Review list (dummy data) */}
            {[1, 2, 3].map((i) => (
              <div key={i} className="border-b border-gray-border pb-6">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-dark">Ola Nordmann</p>
                    <div className="flex text-brand">
                      {'★★★★★'.split('').map((star, idx) => (
                        <span key={idx}>{star}</span>
                      ))}
                    </div>
                  </div>
                  <span className="text-sm text-gray-medium">2 dager siden</span>
                </div>
                <p className="text-gray-medium">
                  Veldig fornøyd med produktet! God kvalitet og rask levering.
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

