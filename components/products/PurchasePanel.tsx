"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart-context";
import { formatCurrency } from "@/lib/format";
import { QuantitySelector } from "@/components/QuantitySelector";

interface Variant {
  id: string;
  name: string;
  price: number;
  compareAtPrice?: number | null;
  image?: string | null;
  attributes: Record<string, string>;
  stock: number;
}

interface PurchasePanelProps {
  product: {
    id: string;
    name: string;
    slug: string;
    price: number;
    compareAtPrice?: number | null;
    image: string;
  };
  variants?: Variant[];
}

export function PurchasePanel({ product, variants = [] }: PurchasePanelProps) {
  const [quantity, setQuantity] = useState(1);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    variants.length > 0 ? variants[0].id : null
  );
  const { addToCart } = useCart();
  const router = useRouter();

  const hasVariants = variants.length > 0;
  const selectedVariant = useMemo(
    () => variants.find((v) => v.id === selectedVariantId) || null,
    [variants, selectedVariantId]
  );

  const displayPrice = selectedVariant ? selectedVariant.price : product.price;
  const displayCompareAtPrice = selectedVariant
    ? selectedVariant.compareAtPrice
    : product.compareAtPrice;
  const displayImage = selectedVariant?.image || product.image;
  const displayStock = selectedVariant?.stock ?? 100;

  // Group variants by attribute type (color, size, length, etc.)
  const variantGroups = useMemo(() => {
    if (!hasVariants) return {};
    
    const groups: Record<string, { value: string; variantIds: string[] }[]> = {};
    
    variants.forEach((variant) => {
      Object.entries(variant.attributes).forEach(([key, value]) => {
        if (!groups[key]) {
          groups[key] = [];
        }
        const existingGroup = groups[key].find((g) => g.value === value);
        if (existingGroup) {
          if (!existingGroup.variantIds.includes(variant.id)) {
            existingGroup.variantIds.push(variant.id);
          }
        } else {
          groups[key].push({ value, variantIds: [variant.id] });
        }
      });
    });
    
    return groups;
  }, [variants, hasVariants]);

  const handleAdd = () => {
    if (displayStock < quantity) {
      alert(`Bare ${displayStock} på lager`);
      return;
    }

    const variantName = selectedVariant ? ` - ${selectedVariant.name}` : "";
    
    addToCart(
      {
        productId: product.id,
        name: product.name + variantName,
        price: displayPrice,
        image: displayImage,
        quantity,
        slug: product.slug,
        variantId: selectedVariantId || undefined,
        variantName: selectedVariant?.name || undefined,
      },
      quantity
    );
  };

  const handleBuyNow = () => {
    handleAdd();
    setTimeout(() => {
      router.push("/checkout");
    }, 100);
  };

  return (
    <div className="space-y-4 rounded-3xl border bg-white p-6 shadow-card">
      <div className="flex items-baseline gap-3">
        <p className="text-4xl font-bold text-primary">{formatCurrency(displayPrice)}</p>
        {displayCompareAtPrice && (
          <p className="text-lg text-secondary line-through">
            {formatCurrency(displayCompareAtPrice)}
          </p>
        )}
      </div>

      {/* Variant Selection */}
      {hasVariants && (
        <div className="space-y-4">
          {Object.entries(variantGroups).map(([attributeKey, options]) => (
            <div key={attributeKey}>
              <label className="mb-2 block text-sm font-medium text-primary capitalize">
                {attributeKey === "color" ? "Farge" : attributeKey === "size" ? "Størrelse" : attributeKey === "length" ? "Lengde" : attributeKey}:
              </label>
              <div className="flex flex-wrap gap-2">
                {options.map((option) => {
                  const isSelected = selectedVariant?.attributes[attributeKey] === option.value;
                  const variantForOption = variants.find(
                    (v) => v.id === selectedVariantId && v.attributes[attributeKey] === option.value
                  ) || variants.find((v) => v.attributes[attributeKey] === option.value);
                  
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        // Find a variant with this attribute value
                        const matchingVariant = variants.find(
                          (v) => {
                            const hasMatchingAttr = v.attributes[attributeKey] === option.value;
                            // Try to keep other selected attributes if possible
                            if (selectedVariant) {
                              const otherAttrs = Object.entries(selectedVariant.attributes).filter(
                                ([k]) => k !== attributeKey
                              );
                              return (
                                hasMatchingAttr &&
                                otherAttrs.every(([k, val]) => v.attributes[k] === val)
                              );
                            }
                            return hasMatchingAttr;
                          }
                        ) || variants.find((v) => v.attributes[attributeKey] === option.value);
                        
                        if (matchingVariant) {
                          setSelectedVariantId(matchingVariant.id);
                        }
                      }}
                      className={`rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                        isSelected
                          ? "border-primary bg-primary text-white"
                          : "border-border bg-white text-primary hover:border-primary hover:bg-surface"
                      }`}
                    >
                      {option.value}
                      {variantForOption && variantForOption.price !== displayPrice && (
                        <span className="ml-1 text-xs opacity-75">
                          ({formatCurrency(variantForOption.price)})
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          
          {/* Show selected variant name if it's not just attributes */}
          {selectedVariant && selectedVariant.name && (
            <div className="text-sm text-secondary">
              Valgt: <span className="font-medium text-primary">{selectedVariant.name}</span>
            </div>
          )}
        </div>
      )}

      <QuantitySelector
        value={quantity}
        onChange={setQuantity}
        max={displayStock}
      />
      
      {displayStock < 10 && (
        <p className="text-sm text-accent-red">
          ⚠️ Bare {displayStock} på lager
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button className="flex-1" size="lg" onClick={handleAdd} disabled={displayStock === 0}>
          {displayStock === 0 ? "Ut på lager" : "Legg i handlekurv"}
        </Button>
        <Button
          className="flex-1"
          variant="outline"
          size="lg"
          onClick={handleBuyNow}
          disabled={displayStock === 0}
        >
          Kjøp nå
        </Button>
      </div>
      <ul className="space-y-1 text-sm text-secondary">
        <li>✅ Gratis frakt over 500 kr</li>
        <li>✅ 30 dagers returrett</li>
        <li>✅ Trygg betaling</li>
      </ul>
    </div>
  );
}

