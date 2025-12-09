"use client";

import { useState } from "react";

interface ProductTabsProps {
  description?: string | null;
  specs?: Record<string, string> | null;
}

const reviews = [
  { name: "Maria", rating: 5, text: "Fantastisk kvalitet og rask levering!" },
  { name: "Jonas", rating: 4, text: "Bra produkt for prisen. Anbefales." },
  { name: "Eirik", rating: 5, text: "Overgikk forventningene mine." },
];

const tabs = ["Beskrivelse", "Spesifikasjoner", "Anmeldelser"] as const;

export function ProductTabs({ description, specs }: ProductTabsProps) {
  const [active, setActive] = useState<(typeof tabs)[number]>("Beskrivelse");

  return (
    <div className="rounded-3xl border bg-white p-6 shadow-card">
      <div className="flex gap-4 border-b">
        {tabs.map((tab) => (
          <button
            key={tab}
            className={`pb-2 text-sm font-semibold ${
              active === tab ? "border-b-2 border-primary text-primary" : "text-secondary"
            }`}
            onClick={() => setActive(tab)}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="pt-4">
        {active === "Beskrivelse" && (
          <div
            className="prose max-w-none"
            dangerouslySetInnerHTML={{
              __html: description || "<p>Ingen beskrivelse tilgjengelig.</p>",
            }}
          />
        )}
        {active === "Spesifikasjoner" && (
          <table className="w-full text-sm">
            <tbody>
              {specs
                ? Object.entries(specs).map(([key, value]) => (
                    <tr key={key} className="border-b last:border-0">
                      <td className="py-2 font-semibold text-slate-600">{key}</td>
                      <td className="py-2 text-slate-900">{value}</td>
                    </tr>
                  ))
                : (
                    <tr>
                      <td className="py-2 text-secondary">Ingen spesifikasjoner tilgjengelig.</td>
                    </tr>
                  )}
            </tbody>
          </table>
        )}
        {active === "Anmeldelser" && (
          <div className="space-y-4">
            {reviews.map((review) => (
              <div key={review.name} className="rounded-2xl border bg-slate-50 p-4">
                <p className="font-semibold text-slate-900">{review.name}</p>
                <p className="text-sm text-yellow-500">{"★".repeat(review.rating)}</p>
                <p className="text-sm text-secondary">{review.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

