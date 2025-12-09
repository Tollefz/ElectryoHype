'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Save, Image as ImageIcon, ExternalLink, Copy, Check } from 'lucide-react';
import Image from 'next/image';

interface Variant {
  id: string;
  name: string;
  image: string | null;
  attributes: any;
}

export default function EditVariantsPage() {
  const params = useParams();
  const router = useRouter();
  const productId = params.id as string;
  
  const [product, setProduct] = useState<any>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  useEffect(() => {
    fetchProduct();
  }, [productId]);

  const fetchProduct = async () => {
    try {
      const res = await fetch(`/api/admin/products/${productId}`);
      if (!res.ok) throw new Error('Failed to fetch product');
      const data = await res.json();
      setProduct(data);
      setVariants(data.variants || []);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleImageChange = (variantId: string, imageUrl: string) => {
    setVariants(prev => prev.map(v => 
      v.id === variantId ? { ...v, image: imageUrl } : v
    ));
  };

  const copyImageUrl = (url: string, index: number) => {
    navigator.clipboard.writeText(url);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const getAvailableImages = (): string[] => {
    if (!product?.images) return [];
    try {
      return JSON.parse(product.images);
    } catch {
      return [];
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const variant of variants) {
        await fetch(`/api/admin/products/variants/${variant.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: variant.image }),
        });
      }
      
      // Update product images to include all variant images
      const variantImages = variants
        .map(v => v.image)
        .filter((img): img is string => !!img);
      
      const productImages = product.images ? JSON.parse(product.images) : [];
      const allImages = [...new Set([...variantImages, ...productImages])];
      
      await fetch(`/api/admin/products/${productId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ images: JSON.stringify(allImages) }),
      });
      
      router.push(`/admin/products`);
    } catch (error) {
      console.error('Error saving:', error);
      alert('Feil ved lagring');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center">Laster...</div>
      </div>
    );
  }

  const availableImages = getAvailableImages();

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft size={20} />
          Tilbake
        </button>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-2xl font-bold">Rediger Variant-bilder</h1>
            <p className="text-gray-600 mt-1">{product?.name}</p>
          </div>
          {product?.supplierUrl && (
            <a
              href={product.supplierUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <ExternalLink size={18} />
              Åpne på Temu
            </a>
          )}
        </div>
      </div>

      {/* Available images gallery */}
      {availableImages.length > 0 && (
        <div className="mb-8 bg-white p-6 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Tilgjengelige bilder</h2>
          <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
            {availableImages.map((imgUrl: string, index: number) => (
              <div key={index} className="relative group">
                <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden">
                  <Image
                    src={imgUrl}
                    alt={`Bilde ${index + 1}`}
                    width={100}
                    height={100}
                    className="w-full h-full object-contain"
                    unoptimized
                  />
                </div>
                <button
                  onClick={() => copyImageUrl(imgUrl, index)}
                  className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-50 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100 rounded-lg"
                  title="Klikk for å kopiere URL"
                >
                  {copiedIndex === index ? (
                    <Check size={20} className="text-green-400" />
                  ) : (
                    <Copy size={20} className="text-white" />
                  )}
                </button>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Hover over bildene for å kopiere URL. Klikk på "Kopier" for å lime inn i variant-feltet.
          </p>
        </div>
      )}

      <div className="space-y-6">
        {variants.map((variant) => {
          const attrs = variant.attributes || {};
          const color = attrs.color || attrs.farge || variant.name;
          
          return (
            <div key={variant.id} className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold mb-4">{color}</h3>
              
              <div className="flex gap-6">
                <div className="w-32 h-32 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                  {variant.image ? (
                    <Image
                      src={variant.image}
                      alt={color}
                      width={128}
                      height={128}
                      className="w-full h-full object-contain"
                      unoptimized
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                        (e.target as HTMLImageElement).parentElement!.innerHTML = 
                          '<div class="w-full h-full flex items-center justify-center text-red-400 text-xs text-center">Feil ved lasting</div>';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      <ImageIcon size={32} />
                    </div>
                  )}
                </div>
                
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-2">
                    Bilde URL
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={variant.image || ''}
                      onChange={(e) => handleImageChange(variant.id, e.target.value)}
                      placeholder="https://img.kwcdn.com/product/..."
                      className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    {variant.image && (
                      <button
                        onClick={() => copyImageUrl(variant.image!, -1)}
                        className="px-3 py-2 border rounded-lg hover:bg-gray-50"
                        title="Kopier URL"
                      >
                        <Copy size={16} />
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Lim inn URL til bildet for denne varianten, eller klikk på et bilde over for å kopiere URL
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 flex gap-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          <Save size={20} />
          {saving ? 'Lagrer...' : 'Lagre alle bilder'}
        </button>
        <button
          onClick={() => router.back()}
          className="px-6 py-3 border rounded-lg hover:bg-gray-50"
        >
          Avbryt
        </button>
      </div>
    </div>
  );
}
