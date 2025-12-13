"use client";

import { useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle, RefreshCw, Image as ImageIcon, Palette, Settings } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

interface VariantIssue {
  type: 'missing_image' | 'wrong_color' | 'duplicate' | 'mismatched_price';
  severity: 'critical' | 'warning' | 'info';
  message: string;
  suggestion: string;
}

interface ProductVariantCheck {
  id: string;
  name: string;
  slug: string;
  images: string[];
  variants: Array<{
    type: string;
    name: string;
    options: Array<{
      value: string;
      image?: string;
      colorCode?: string;
      price?: number;
    }>;
  }>;
  issues: VariantIssue[];
  status: 'unchecked' | 'checking' | 'passed' | 'failed' | 'fixed';
}

export default function VariantQAClient() {
  const [products, setProducts] = useState<ProductVariantCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [autoFixing, setAutoFixing] = useState(false);
  const [fixingAll, setFixingAll] = useState(false);
  const [filter, setFilter] = useState<'all' | 'passed' | 'failed'>('all');

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/products/variant-check');
      if (!response.ok) {
        throw new Error('Failed to load products');
      }
      const data = await response.json();
      setProducts(data.products || []);
    } catch (error) {
      console.error('Error loading products:', error);
    } finally {
      setLoading(false);
    }
  };

  const checkAllProducts = async () => {
    setChecking(true);

    for (let i = 0; i < products.length; i++) {
      // Update status to checking
      setProducts(prev =>
        prev.map((p, idx) =>
          idx === i ? { ...p, status: 'checking' } : p
        )
      );

      try {
        const response = await fetch('/api/admin/products/check-variants', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: products[i].id }),
        });

        if (!response.ok) {
          throw new Error('Check failed');
        }

        const result = await response.json();

        setProducts(prev =>
          prev.map((p, idx) =>
            idx === i
              ? {
                  ...p,
                  issues: result.issues || [],
                  status: result.issues && result.issues.length === 0 ? 'passed' : 'failed',
                }
              : p
          )
        );

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        setProducts(prev =>
          prev.map((p, idx) =>
            idx === i
              ? {
                  ...p,
                  status: 'failed',
                  issues: [
                    {
                      type: 'missing_image',
                      severity: 'critical',
                      message: 'Feil ved sjekking',
                      suggestion: 'Prøv igjen',
                    },
                  ],
                }
              : p
          )
        );
      }
    }

    setChecking(false);
  };

  const autoFixAll = async () => {
    if (!confirm(`Er du sikker på at du vil auto-fikse ${products.filter(p => p.status === 'failed').length} produkter?`)) {
      return;
    }

    setAutoFixing(true);

    const failedProducts = products.filter(p => p.status === 'failed');

    for (const product of failedProducts) {
      try {
        const response = await fetch('/api/admin/products/auto-fix-variants', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: product.id }),
        });

        if (!response.ok) {
          throw new Error('Fix failed');
        }

        setProducts(prev =>
          prev.map(p =>
            p.id === product.id ? { ...p, status: 'fixed', issues: [] } : p
          )
        );

        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error('Error fixing product:', product.id, error);
      }
    }

    setAutoFixing(false);
    await loadProducts(); // Reload to verify fixes
  };

  const fixAllVariantsAndImages = async () => {
    if (!confirm('Er du sikker på at du vil fikse alle produkter? Dette vil matche bilder til varianter og oppdatere alle produkter.')) {
      return;
    }

    setFixingAll(true);
    try {
      const response = await fetch('/api/admin/products/fix-variants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'both' }),
      });

      if (!response.ok) {
        throw new Error('Fix failed');
      }

      const result = await response.json();
      alert(`✅ Fiksing fullført! Sjekk konsollen for detaljer.`);
      
      // Reload products to see updates
      await loadProducts();
    } catch (error) {
      console.error('Error fixing all variants:', error);
      alert('❌ Feil ved fiksing. Sjekk konsollen for detaljer.');
    } finally {
      setFixingAll(false);
    }
  };

  const filteredProducts = products.filter(p => {
    if (filter === 'all') return true;
    if (filter === 'passed') return p.status === 'passed' || p.status === 'fixed';
    return p.status === 'failed';
  });

  const stats = {
    total: products.length,
    passed: products.filter(p => p.status === 'passed' || p.status === 'fixed').length,
    failed: products.filter(p => p.status === 'failed').length,
    unchecked: products.filter(p => p.status === 'unchecked').length,
  };

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Variant Quality Check</h1>
          <p className="text-sm text-gray-600 mt-1">
            Verifiser at alle produktvarianter har riktige bilder, farger og data
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3">
          <Link
            href="/admin/products"
            className="rounded-lg border border-gray-300 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            ← Tilbake
          </Link>
          <button
            onClick={loadProducts}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Oppdater</span>
          </button>
          <button
            onClick={checkAllProducts}
            disabled={checking || loading}
            className="flex items-center gap-2 rounded-lg bg-green-600 px-4 sm:px-6 py-2 text-xs sm:text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {checking ? (
              <>
                <RefreshCw className="animate-spin" size={16} />
                <span className="hidden sm:inline">Sjekker...</span>
              </>
            ) : (
              <>
                <Settings size={16} />
                <span className="hidden sm:inline">Sjekk Alle Produkter</span>
                <span className="sm:hidden">Sjekk</span>
              </>
            )}
          </button>
          {stats.failed > 0 && (
            <button
              onClick={autoFixAll}
              disabled={autoFixing}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-6 py-2 text-white hover:bg-green-700 disabled:opacity-50"
            >
              {autoFixing ? 'Fikser...' : `Auto-Fix ${stats.failed} Produkter`}
            </button>
          )}
          <button
            onClick={fixAllVariantsAndImages}
            disabled={fixingAll}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
            title="Match bilder til varianter og fiks alle produkter automatisk"
          >
            <Settings size={20} className={fixingAll ? 'animate-spin' : ''} />
            {fixingAll ? 'Fikser alle...' : 'Fiks Alle Varianter & Bilder'}
          </button>
        </div>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-medium">Totalt</p>
              <p className="text-3xl font-bold text-dark">{stats.total}</p>
            </div>
            <ImageIcon className="text-gray-medium" size={32} />
          </div>
        </div>
        <div className="rounded-xl bg-green-50 p-6 shadow-sm border border-green-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-600">Godkjent</p>
              <p className="text-3xl font-bold text-green-600">{stats.passed}</p>
            </div>
            <CheckCircle2 className="text-green-600" size={32} />
          </div>
        </div>
        <div className="rounded-xl bg-red-50 p-6 shadow-sm border border-red-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-red-600">Feil</p>
              <p className="text-3xl font-bold text-red-600">{stats.failed}</p>
            </div>
            <AlertCircle className="text-red-600" size={32} />
          </div>
        </div>
        <div className="rounded-xl bg-gray-light p-6 shadow-sm border border-gray-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-medium">Usjekket</p>
              <p className="text-3xl font-bold text-gray-medium">{stats.unchecked}</p>
            </div>
            <RefreshCw className="text-gray-medium" size={32} />
          </div>
        </div>
      </div>

      {/* FILTERS */}
      <div className="flex flex-wrap gap-2">
        {(['all', 'passed', 'failed'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-gray-900 text-white shadow-sm'
                : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
            }`}
          >
            {f === 'all' && 'Alle'}
            {f === 'passed' && 'Godkjent'}
            {f === 'failed' && 'Feil'}
          </button>
        ))}
      </div>

      {/* PRODUCTS LIST */}
      {loading ? (
        <div className="rounded-xl bg-white p-12 text-center shadow-sm border border-gray-border">
          <RefreshCw className="animate-spin mx-auto mb-4 text-gray-medium" size={48} />
          <p className="text-gray-medium">Laster produkter...</p>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center shadow-sm border border-gray-border">
          <p className="text-gray-medium">Ingen produkter funnet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredProducts.map((product) => (
            <div
              key={product.id}
              className={`rounded-xl bg-white p-6 shadow-sm border-l-4 ${
                product.status === 'passed' || product.status === 'fixed'
                  ? 'border-green-500'
                  : product.status === 'failed'
                  ? 'border-red-500'
                  : product.status === 'checking'
                  ? 'border-blue-500'
                  : 'border-gray-border'
              }`}
            >
              {/* PRODUCT HEADER */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-start gap-4">
                  <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg border border-gray-border">
                    {product.images && product.images.length > 0 ? (
                      <Image
                        src={product.images[0] || 'https://placehold.co/100x100'}
                        alt={product.name}
                        fill
                        className="object-cover"
                        sizes="80px"
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-light flex items-center justify-center">
                        <ImageIcon className="text-gray-medium" size={24} />
                      </div>
                    )}
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-dark">{product.name}</h3>
                    <p className="text-sm text-gray-medium">{product.slug}</p>
                    <div className="flex items-center gap-2 mt-2">
                      {product.status === 'passed' && (
                        <span className="flex items-center gap-1 text-green-600 text-sm">
                          <CheckCircle2 size={16} />
                          Godkjent
                        </span>
                      )}
                      {product.status === 'fixed' && (
                        <span className="flex items-center gap-1 text-green-600 text-sm">
                          <CheckCircle2 size={16} />
                          Fikset
                        </span>
                      )}
                      {product.status === 'failed' && (
                        <span className="flex items-center gap-1 text-red-600 text-sm">
                          <AlertCircle size={16} />
                          {product.issues.length} Problem(er)
                        </span>
                      )}
                      {product.status === 'checking' && (
                        <span className="flex items-center gap-1 text-blue-600 text-sm">
                          <RefreshCw className="animate-spin" size={16} />
                          Sjekker...
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* VARIANTS */}
              {product.variants && product.variants.length > 0 && (
                <div className="space-y-3 mb-4">
                  <h4 className="font-medium text-sm text-dark">
                    Varianter ({product.variants.length})
                  </h4>
                  {product.variants.map((variant, vIdx) => (
                    <div key={vIdx} className="rounded-lg border border-gray-border p-4">
                      <div className="flex items-center gap-2 mb-3">
                        {variant.type === 'color' && <Palette size={16} className="text-gray-medium" />}
                        {variant.type === 'size' && <Settings size={16} className="text-gray-medium" />}
                        <span className="font-medium text-sm capitalize text-dark">
                          {variant.name}
                        </span>
                        <span className="text-xs text-gray-medium">
                          ({variant.options.length} alternativer)
                        </span>
                      </div>

                      <div className="grid grid-cols-6 gap-3">
                        {variant.options.map((option, oIdx) => (
                          <div
                            key={oIdx}
                            className="rounded-lg border border-gray-border p-2 text-center"
                          >
                            {option.image && (
                              <div className="relative h-12 w-12 mx-auto mb-2 overflow-hidden rounded border border-gray-border">
                                <Image
                                  src={option.image}
                                  alt={option.value}
                                  fill
                                  className="object-cover"
                                  sizes="48px"
                                />
                              </div>
                            )}
                            {!option.image && option.colorCode && (
                              <div
                                className="h-8 w-8 mx-auto mb-2 rounded-full border border-gray-border"
                                style={{ backgroundColor: option.colorCode }}
                              />
                            )}
                            {!option.image && !option.colorCode && (
                              <div className="h-8 w-8 mx-auto mb-2 rounded-full border border-gray-border bg-gray-light" />
                            )}
                            <div className="text-xs font-medium text-dark">{option.value}</div>
                            {option.price && (
                              <div className="text-xs text-gray-medium mt-1">
                                +{option.price} kr
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ISSUES */}
              {product.issues && product.issues.length > 0 && (
                <div className="mt-4 space-y-2">
                  <h4 className="font-medium text-sm text-red-600">
                    Problem funnet:
                  </h4>
                  {product.issues.map((issue, iIdx) => (
                    <div
                      key={iIdx}
                      className={`rounded-lg p-3 text-sm ${
                        issue.severity === 'critical'
                          ? 'bg-red-50 text-red-700 border border-red-200'
                          : issue.severity === 'warning'
                          ? 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                          : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}
                    >
                      <div className="font-medium">{issue.message}</div>
                      <div className="text-xs mt-1 opacity-75">
                        💡 {issue.suggestion}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

