"use client";

import { useState } from 'react';
import { Loader2, Upload, Check, X, AlertCircle, ExternalLink, Edit2, Save, Trash2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import slugify from 'slugify';

interface ProductPreview {
  url: string;
  status: 'pending' | 'loading' | 'success' | 'error';
  data?: {
    name: string;
    originalName: string;
    price: number;
    originalPrice: number;
    suggestedPrice: number;
    compareAtPrice: number;
    description: string;
    shortDescription: string;
    images: string[];
    variants?: Array<{
      name: string;
      price: number;
      compareAtPrice?: number | null;
      image?: string | null;
      attributes: Record<string, string>;
      stock: number;
    }>;
    category: string;
    tags: string[];
    specs: Record<string, string>;
    supplier: string;
  };
  error?: string;
}

export default function TemuImportClient() {
  const [urls, setUrls] = useState('');
  const [products, setProducts] = useState<ProductPreview[]>([]);
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleParse = () => {
    const urlList = urls
      .split('\n')
      .map(url => url.trim())
      .filter(url => url.length > 0 && (url.includes('temu.com') || url.includes('temu.')));

    if (urlList.length === 0) {
      alert('Ingen gyldige Temu URLs funnet!');
      return;
    }

    setProducts(
      urlList.map(url => ({
        url,
        status: 'pending',
      }))
    );
  };

  const handleImportAll = async () => {
    setImporting(true);

    for (let i = 0; i < products.length; i++) {
      const product = products[i];

      // Skip hvis allerede importert eller i feil
      if (product.status === 'success' || product.status === 'loading') {
        continue;
      }

      // Oppdater status til loading
      setProducts(prev =>
        prev.map((p, idx) =>
          idx === i ? { ...p, status: 'loading' } : p
        )
      );

      try {
        const response = await fetch('/api/admin/scrape-product', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: product.url }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Feil ved scraping');
        }

        const scrapedData = await response.json();

        // Log variants for debugging
        console.log(`[Bulk Import] Product ${i + 1}: variants received:`, scrapedData.variants);
        console.log(`[Bulk Import] Product ${i + 1}: variants count:`, scrapedData.variants?.length || 0);

        // Formater data for preview
        const formattedData = {
          name: scrapedData.name || 'Produkt uten navn',
          originalName: scrapedData.name || '',
          price: scrapedData.price || 0,
          originalPrice: scrapedData.price || 0,
          suggestedPrice: scrapedData.suggestedPrice || scrapedData.price * 1.5,
          compareAtPrice: scrapedData.compareAtPrice || scrapedData.suggestedPrice * 1.15,
          description: scrapedData.description || '',
          shortDescription: scrapedData.shortDescription || scrapedData.name?.substring(0, 150) || '',
          images: scrapedData.images || [],
          variants: scrapedData.variants || undefined,
          category: scrapedData.category || 'Elektronikk',
          tags: scrapedData.tags || ['temu', 'import'],
          specs: scrapedData.specs || {},
          supplier: scrapedData.supplier || 'temu',
        };

        console.log(`[Bulk Import] Product ${i + 1}: formatted variants:`, formattedData.variants);

        // Oppdater med data
        setProducts(prev =>
          prev.map((p, idx) =>
            idx === i ? { ...p, status: 'success', data: formattedData } : p
          )
        );

        // Vent 3 sekunder mellom hver for å unngå rate limiting
        if (i < products.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      } catch (error: any) {
        setProducts(prev =>
          prev.map((p, idx) =>
            idx === i
              ? { ...p, status: 'error', error: error.message || 'Ukjent feil' }
              : p
          )
        );
      }
    }

    setImporting(false);
  };

  const handleSaveAll = async () => {
    const successfulProducts = products.filter(p => p.status === 'success' && p.data);

    if (successfulProducts.length === 0) {
      alert('Ingen produkter å lagre!');
      return;
    }

    if (!confirm(`Er du sikker på at du vil lagre ${successfulProducts.length} produkter?`)) {
      return;
    }

    setSaving(true);

    let savedCount = 0;
    let errorCount = 0;

    for (const product of successfulProducts) {
      try {
        const slug = slugify(product.data!.name, {
          lower: true,
          strict: true,
          locale: 'nb',
        });

        const response = await fetch('/api/admin/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: product.data!.name,
            slug: slug,
            description: product.data!.description,
            shortDescription: product.data!.shortDescription,
            price: Math.round(product.data!.suggestedPrice),
            compareAtPrice: product.data!.compareAtPrice ? Math.round(product.data!.compareAtPrice) : null,
            supplierPrice: Math.round(product.data!.originalPrice),
            images: JSON.stringify(product.data!.images),
            tags: JSON.stringify(product.data!.tags),
            category: product.data!.category,
            supplierUrl: product.url,
            supplierName: product.data!.supplier || 'temu',
            supplierProductId: extractTemuId(product.url),
            sku: `TEMU-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            // storeId will default to DEFAULT_STORE_ID in API route if not provided
            // This ensures Temu products appear in frontend
            isActive: true,
          }),
        });

        if (!response.ok) {
          throw new Error('Feil ved lagring');
        }

        const savedProduct = await response.json();

        console.log(`[Bulk Import] Saved product ID: ${savedProduct.id}`);
        console.log(`[Bulk Import] Product has ${product.data!.variants?.length || 0} variants to save`);
        console.log(`[Bulk Import] Variants data:`, JSON.stringify(product.data!.variants, null, 2));

        // CRITICAL: Always try to save variants - even if the array appears empty
        // The API should always return at least one variant, so we should always have variants here
        const variantsToSave = product.data!.variants && product.data!.variants.length > 0 
          ? product.data!.variants 
          : [{
              name: "Standard",
              price: Math.round(product.data!.suggestedPrice),
              compareAtPrice: product.data!.compareAtPrice ? Math.round(product.data!.compareAtPrice) : null,
              image: product.data!.images && product.data!.images.length > 0 ? product.data!.images[0] : null,
              attributes: {},
              stock: 10,
            }];

        console.log(`[Bulk Import] Starting to save ${variantsToSave.length} variants...`);
        let savedVariants = 0;
        let failedVariants = 0;

        for (const variant of variantsToSave) {
          try {
            console.log(`[Bulk Import] Saving variant: ${variant.name}`, JSON.stringify(variant, null, 2));
            
            const variantPayload = {
              name: variant.name || "Standard",
              price: Math.round(variant.price || product.data!.suggestedPrice),
              compareAtPrice: variant.compareAtPrice ? Math.round(variant.compareAtPrice) : null,
              supplierPrice: Math.round(product.data!.originalPrice),
              image: variant.image || (product.data!.images && product.data!.images.length > 0 ? product.data!.images[0] : null),
              attributes: variant.attributes || {},
              stock: variant.stock || 10,
              isActive: true,
            };
            
            console.log(`[Bulk Import] Variant payload:`, JSON.stringify(variantPayload, null, 2));
            
            const variantResponse = await fetch(`/api/admin/products/${savedProduct.id}/variants`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(variantPayload),
            });

            if (!variantResponse.ok) {
              const errorText = await variantResponse.text();
              let errorData;
              try {
                errorData = JSON.parse(errorText);
              } catch {
                errorData = { error: errorText };
              }
              throw new Error(errorData.error || `HTTP ${variantResponse.status}: ${errorText}`);
            }

            const savedVariant = await variantResponse.json();
            console.log(`[Bulk Import] ✅ Variant saved: ${savedVariant.name} (ID: ${savedVariant.id})`);
            savedVariants++;
          } catch (err: any) {
            console.error(`[Bulk Import] ❌ Error saving variant "${variant.name}":`, err);
            console.error(`[Bulk Import] Error message:`, err.message);
            console.error(`[Bulk Import] Variant data that failed:`, JSON.stringify(variant, null, 2));
            failedVariants++;
          }
        }

        console.log(`[Bulk Import] Variants saved: ${savedVariants}/${variantsToSave.length}, failed: ${failedVariants}`);

        savedCount++;
      } catch (error) {
        console.error('Error saving product:', error);
        errorCount++;
      }

      // Vent litt mellom hver lagring
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setSaving(false);
    
    if (savedCount > 0) {
      alert(`✅ ${savedCount} produkter lagret!${errorCount > 0 ? `\n⚠️ ${errorCount} produkter feilet.` : ''}`);
      window.location.href = '/admin/products';
    } else {
      alert(`❌ Kunne ikke lagre produkter. Sjekk konsollen for feil.`);
    }
  };

  const extractTemuId = (url: string) => {
    const match = url.match(/goods\.html\?goods_id=(\d+)/);
    return match ? match[1] : url.split('/').pop()?.split('?')[0] || '';
  };

  const updateProductData = (index: number, field: string, value: any) => {
    setProducts(prev =>
      prev.map((p, idx) =>
        idx === index && p.data
          ? { ...p, data: { ...p.data, [field]: value } }
          : p
      )
    );
  };

  const removeProduct = (index: number) => {
    setProducts(prev => prev.filter((_, idx) => idx !== index));
  };

  const retryProduct = async (index: number) => {
    const product = products[index];
    setProducts(prev =>
      prev.map((p, idx) =>
        idx === index ? { ...p, status: 'pending', error: undefined } : p
      )
    );
    // Kjør import igjen for denne
    await handleImportAll();
  };

  const successCount = products.filter(p => p.status === 'success').length;
  const errorCount = products.filter(p => p.status === 'error').length;
  const loadingCount = products.filter(p => p.status === 'loading').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-dark">Temu Bulk Import</h1>
          <p className="text-gray-medium mt-1">
            Importer flere produkter fra Temu samtidig
          </p>
        </div>
        <Link
          href="/admin/products"
          className="rounded-lg border border-gray-border px-4 py-2 text-sm font-medium hover:bg-gray-light"
        >
          ← Tilbake til produkter
        </Link>
      </div>

      {/* URL INPUT */}
      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-border">
        <label className="block text-sm font-medium mb-2 text-dark">
          Temu Produkt URLs (én per linje)
        </label>
        <textarea
          value={urls}
          onChange={(e) => setUrls(e.target.value)}
          placeholder="https://www.temu.com/goods.html?goods_id=123456789&#10;https://www.temu.com/product-2.html&#10;https://www.temu.com/product-3.html"
          rows={8}
          className="w-full rounded-lg border border-gray-border p-3 font-mono text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
        <div className="mt-4 flex gap-3">
          <button
            onClick={handleParse}
            disabled={!urls.trim()}
            className="flex items-center gap-2 rounded-lg bg-dark px-6 py-3 text-white hover:bg-dark-secondary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Upload size={20} />
            Last URLs ({urls.split('\n').filter(u => u.trim()).length})
          </button>
          {products.length > 0 && (
            <button
              onClick={handleImportAll}
              disabled={importing || loadingCount > 0}
              className="flex items-center gap-2 rounded-lg bg-brand px-6 py-3 text-white hover:bg-brand-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {importing ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  Importerer...
                </>
              ) : (
                <>
                  <Check size={20} />
                  Importer Alle ({products.length})
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* STATUS SUMMARY */}
      {products.length > 0 && (
        <div className="grid grid-cols-4 gap-4">
          <div className="rounded-lg bg-white p-4 border border-gray-border">
            <div className="text-2xl font-bold text-dark">{products.length}</div>
            <div className="text-sm text-gray-medium">Totalt</div>
          </div>
          <div className="rounded-lg bg-white p-4 border border-green-500">
            <div className="text-2xl font-bold text-green-600">{successCount}</div>
            <div className="text-sm text-gray-medium">Ferdig</div>
          </div>
          <div className="rounded-lg bg-white p-4 border border-yellow-500">
            <div className="text-2xl font-bold text-yellow-600">{loadingCount}</div>
            <div className="text-sm text-gray-medium">Laster</div>
          </div>
          <div className="rounded-lg bg-white p-4 border border-red-500">
            <div className="text-2xl font-bold text-red-600">{errorCount}</div>
            <div className="text-sm text-gray-medium">Feil</div>
          </div>
        </div>
      )}

      {/* PRODUCT PREVIEWS */}
      {products.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-dark">
              Produkter ({successCount}/{products.length} ferdig)
            </h2>
            {successCount > 0 && (
              <button
                onClick={handleSaveAll}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-brand px-6 py-3 text-white hover:bg-brand-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? (
                  <>
                    <Loader2 className="animate-spin" size={20} />
                    Lagrer...
                  </>
                ) : (
                  <>
                    <Save size={20} />
                    Lagre {successCount} Produkter
                  </>
                )}
              </button>
            )}
          </div>

          {products.map((product, index) => (
            <div
              key={index}
              className="rounded-xl bg-white p-6 shadow-sm border-l-4"
              style={{
                borderColor:
                  product.status === 'success'
                    ? '#00C853'
                    : product.status === 'error'
                    ? '#e53935'
                    : product.status === 'loading'
                    ? '#FFC107'
                    : '#ccc',
              }}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <a
                      href={product.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-brand hover:underline flex items-center gap-1"
                    >
                      <ExternalLink size={14} />
                      URL #{index + 1}
                    </a>
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        product.status === 'success'
                          ? 'bg-green-100 text-green-700'
                          : product.status === 'error'
                          ? 'bg-red-100 text-red-700'
                          : product.status === 'loading'
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {product.status === 'success'
                        ? '✓ Ferdig'
                        : product.status === 'error'
                        ? '✗ Feil'
                        : product.status === 'loading'
                        ? '⏳ Laster...'
                        : '⏸ Vent'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-medium font-mono break-all">
                    {product.url}
                  </div>
                </div>
                <div className="flex gap-2">
                  {product.status === 'error' && (
                    <button
                      onClick={() => retryProduct(index)}
                      className="p-2 text-brand hover:bg-brand-light rounded"
                      title="Prøv igjen"
                    >
                      <Check size={18} />
                    </button>
                  )}
                  <button
                    onClick={() => removeProduct(index)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded"
                    title="Fjern"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>

              {product.status === 'loading' && (
                <div className="flex items-center gap-2 text-gray-medium">
                  <Loader2 className="animate-spin" size={16} />
                  <span>Henter produktdata...</span>
                </div>
              )}

              {product.status === 'error' && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded">
                  <AlertCircle size={16} />
                  <span className="text-sm">{product.error}</span>
                </div>
              )}

              {product.status === 'success' && product.data && (
                <div className="space-y-4">
                  {/* Produkt bilde */}
                  {product.data.images && product.data.images.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {product.data.images.slice(0, 5).map((img, imgIdx) => (
                        <div
                          key={imgIdx}
                          className="relative w-20 h-20 flex-shrink-0 rounded border border-gray-border overflow-hidden"
                        >
                          <Image
                            src={img}
                            alt={`${product.data!.name} - ${imgIdx + 1}`}
                            fill
                            sizes="80px"
                            className="object-cover"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Produkt navn (redigerbar) */}
                  <div>
                    <label className="block text-xs font-medium text-gray-medium mb-1">
                      Produktnavn
                    </label>
                    <input
                      type="text"
                      value={product.data.name}
                      onChange={(e) => updateProductData(index, 'name', e.target.value)}
                      className="w-full rounded border border-gray-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                    />
                  </div>

                  {/* Priser */}
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-medium mb-1">
                        Leverandørpris
                      </label>
                      <div className="text-sm font-semibold text-gray-medium">
                        {Math.round(product.data.originalPrice)},- NOK
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-medium mb-1">
                        Salgspris
                      </label>
                      <input
                        type="number"
                        value={Math.round(product.data.suggestedPrice)}
                        onChange={(e) =>
                          updateProductData(
                            index,
                            'suggestedPrice',
                            parseFloat(e.target.value) || 0
                          )
                        }
                        className="w-full rounded border border-gray-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-medium mb-1">
                        Før-pris (rabatt)
                      </label>
                      <input
                        type="number"
                        value={product.data.compareAtPrice ? Math.round(product.data.compareAtPrice) : ''}
                        onChange={(e) =>
                          updateProductData(
                            index,
                            'compareAtPrice',
                            e.target.value ? parseFloat(e.target.value) : null
                          )
                        }
                        className="w-full rounded border border-gray-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                      />
                    </div>
                  </div>

                  {/* Kategori */}
                  <div>
                    <label className="block text-xs font-medium text-gray-medium mb-1">
                      Kategori
                    </label>
                    <input
                      type="text"
                      value={product.data.category}
                      onChange={(e) => updateProductData(index, 'category', e.target.value)}
                      className="w-full rounded border border-gray-border px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                    />
                  </div>

                  {/* Varianter */}
                  {product.data.variants && product.data.variants.length > 0 && (
                    <div>
                      <label className="block text-xs font-medium text-gray-medium mb-2">
                        Varianter ({product.data.variants.length})
                      </label>
                      <div className="space-y-2 max-h-40 overflow-y-auto">
                        {product.data.variants.slice(0, 5).map((variant, vIdx) => (
                          <div
                            key={vIdx}
                            className="flex items-center gap-2 text-xs bg-gray-light p-2 rounded"
                          >
                            <span className="font-medium">{variant.name}</span>
                            <span className="text-gray-medium">
                              {Math.round(variant.price)},- NOK
                            </span>
                            {variant.image && (
                              <div className="relative w-8 h-8 rounded overflow-hidden ml-auto">
                                <Image
                                  src={variant.image}
                                  alt={variant.name}
                                  fill
                                  sizes="32px"
                                  className="object-cover"
                                />
                              </div>
                            )}
                          </div>
                        ))}
                        {product.data.variants.length > 5 && (
                          <div className="text-xs text-gray-medium text-center">
                            ...og {product.data.variants.length - 5} flere
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Beskrivelse (kort) */}
                  {product.data.shortDescription && (
                    <div>
                      <label className="block text-xs font-medium text-gray-medium mb-1">
                        Kort beskrivelse
                      </label>
                      <div className="text-sm text-gray-medium line-clamp-2">
                        {product.data.shortDescription}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

