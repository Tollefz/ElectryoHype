'use client';

import { useMemo, useState } from 'react';
import { prepareDescriptionHtml } from '@/lib/sanitize-html';
import {
  groupCustomerSpecs,
  toCustomerSpecs,
  type CustomerSpec,
} from '@/lib/products/customer-specs';

interface ProductTabsProps {
  description: string;
  specifications?: Record<string, string> | CustomerSpec[];
}

export default function ProductTabs({ description, specifications }: ProductTabsProps) {
  const [activeTab, setActiveTab] = useState<'description' | 'specs' | 'reviews'>('description');
  const safeDescription = useMemo(() => prepareDescriptionHtml(description), [description]);

  const customerSpecs = useMemo(() => {
    if (Array.isArray(specifications)) return specifications;
    return toCustomerSpecs(specifications);
  }, [specifications]);

  const grouped = useMemo(() => groupCustomerSpecs(customerSpecs), [customerSpecs]);

  const tabs = [
    { id: 'description' as const, label: 'Oversikt' },
    { id: 'specs' as const, label: 'Spesifikasjoner' },
    { id: 'reviews' as const, label: 'Anmeldelser' },
  ];

  return (
    <div className="rounded-[1rem] border border-[var(--border)] bg-white p-4 shadow-[var(--ehx-shadow-sm)] sm:p-6">
      <div className="border-b border-[var(--border)]">
        <div className="flex gap-1 overflow-x-auto sm:gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap px-3 py-2.5 text-sm font-semibold transition-colors sm:px-5 sm:py-3 ${
                activeTab === tab.id
                  ? 'border-b-2 border-[var(--brand)] text-[var(--brand-dark)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="py-5 sm:py-6">
        {activeTab === 'description' && (
          <div className="prose prose-sm max-w-none sm:prose-base prose-headings:text-base prose-headings:font-semibold prose-headings:text-[var(--text)] prose-p:text-[var(--text-secondary)] prose-li:text-[var(--text-secondary)]">
            {description && description !== 'Ingen beskrivelse tilgjengelig.' ? (
              <div
                className="leading-relaxed"
                dangerouslySetInnerHTML={{ __html: safeDescription }}
              />
            ) : (
              <p className="text-[var(--text-secondary)]">
                Se spesifikasjoner og bilder for produktdetaljer.
              </p>
            )}
            <p className="mt-8 border-t border-[var(--border)] pt-4 text-xs text-[var(--text-muted)]">
              Reklamasjonsrett følger norsk forbrukerkjøpslov. Se{' '}
              <a href="/retur" className="underline hover:text-[var(--text)]">
                retur og reklamasjon
              </a>{' '}
              for detaljer.
            </p>
          </div>
        )}

        {activeTab === 'specs' && (
          <div className="space-y-6">
            {grouped.length > 0 ? (
              grouped.map(({ group, items }) => (
                <div key={group}>
                  {grouped.length > 1 ? (
                    <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
                      {group}
                    </h3>
                  ) : null}
                  <table className="w-full border-collapse text-sm">
                    <tbody>
                      {items.map((row, i) => (
                        <tr
                          key={`${row.key}-${i}`}
                          className="border-b border-[var(--border)] last:border-0"
                        >
                          <th
                            scope="row"
                            className="w-[42%] py-2.5 pr-4 text-left align-top font-medium text-[var(--text-secondary)]"
                          >
                            {row.key}
                          </th>
                          <td className="py-2.5 align-top text-[var(--text)]">{row.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  <tr className="border-b border-[var(--border)]">
                    <th className="w-[42%] py-2.5 text-left font-medium text-[var(--text-secondary)]">
                      Garanti
                    </th>
                    <td className="py-2.5 text-[var(--text)]">2 år</td>
                  </tr>
                  <tr>
                    <th className="w-[42%] py-2.5 text-left font-medium text-[var(--text-secondary)]">
                      Leveringstid
                    </th>
                    <td className="py-2.5 text-[var(--text)]">5–12 virkedager</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === 'reviews' && (
          <div className="rounded-[0.75rem] border border-[var(--border)] bg-[var(--surface-muted)] p-5">
            <h3 className="text-base font-semibold text-[var(--text)]">Kundeanmeldelser</h3>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              Ingen kundeanmeldelser ennå.
            </p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Bli den første som vurderer produktet.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
