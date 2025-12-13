"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { useCart } from "@/lib/cart-context";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Håndter Stripe publishable key med ekstra anførselstegn
const getStripeKey = () => {
  let key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || "";
  // Fjern ekstra anførselstegn hvis de er der
  key = key.replace(/^["']+|["']+$/g, "").trim();
  return key || null;
};

const stripePromise = getStripeKey() ? loadStripe(getStripeKey()!) : null;

const infoSchema = z.object({
  email: z.string().email("Ugyldig e-post"),
  fullName: z.string().min(2, "Navn er påkrevd"),
  phone: z.string().optional().refine((val) => !val || val.length >= 8, {
    message: "Telefonnummer må være minst 8 siffer",
  }),
});

const addressSchema = z.object({
  address1: z.string().min(3, "Adresse er påkrevd"),
  address2: z.string().optional(),
  zipCode: z.string().min(4, "Postnummer er påkrevd"),
  city: z.string().min(2, "By er påkrevd"),
  country: z.string().default("NO"),
});

type InfoData = z.infer<typeof infoSchema>;
type AddressData = {
  address1: string;
  address2?: string;
  zipCode: string;
  city: string;
  country: string;
};

function CheckoutForm({ clientSecret }: { clientSecret: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      setError("Stripe er ikke klar. Vent litt...");
      return;
    }

    setLoading(true);
    setError("");

    const { error: submitError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/order-confirmation`,
      },
    });

    if (submitError) {
      setError(submitError.message || "Noe gikk galt ved betaling");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <Button
        type="submit"
        disabled={!stripe || loading}
        className="w-full"
      >
        {loading ? "Behandler..." : "Betal nå"}
      </Button>
    </form>
  );
}

export default function CheckoutPage() {
  const [step, setStep] = useState(1);
  const [shippingMethod, setShippingMethod] = useState<"standard" | "express">("standard");
  const [paymentMethod, setPaymentMethod] = useState("card");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discountCode, setDiscountCode] = useState("");
  const [discountAmount, setDiscountAmount] = useState(0);
  const [discountMessage, setDiscountMessage] = useState<string | null>(null);
  const [affiliateCode, setAffiliateCode] = useState<string | null>(null);
  const [stripeKeyStatus, setStripeKeyStatus] = useState<"checking" | "ok" | "missing">("checking");
  const router = useRouter();
  const { items, total, clearCart } = useCart();

  // Verifiser Stripe keys ved mount
  useEffect(() => {
    let publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() || "";
    
    // Fjern ekstra anførselstegn hvis de er der (f.eks. ""pk_test_..."")
    // Dette skjer hvis man har ekstra anførselstegn i .env filen
    publishableKey = publishableKey.replace(/^["']+|["']+$/g, "");
    publishableKey = publishableKey.trim();
    
    // Debug logging for development
    if (process.env.NODE_ENV === "development") {
      console.log("🔍 Checking Stripe keys:", {
        hasKey: !!publishableKey,
        keyLength: publishableKey?.length || 0,
        firstChars: publishableKey?.substring(0, 20) || "undefined",
      });
    }
    
    if (publishableKey && (publishableKey.startsWith("pk_test_") || publishableKey.startsWith("pk_live_"))) {
      setStripeKeyStatus("ok");
      console.log("✅ Stripe publishable key found:", publishableKey.substring(0, 20) + "...");
    } else {
      setStripeKeyStatus("missing");
      console.error("❌ NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is missing or invalid");
      console.error("Expected format: pk_test_... or pk_live_...");
      
      if (!publishableKey) {
        console.error("💡 Troubleshooting:");
        console.error("1. Sjekk at .env filen er i prosjektets rotmappe (dropshipping-upgrade/.env)");
        console.error("2. Sjekk at variabelen heter EXAKT: NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
        console.error("3. RESTART dev serveren (Ctrl+C og npm run dev) - Next.js leser .env kun ved oppstart!");
        console.error("4. Sjekk at det ikke er mellomrom eller linjeskift i key-en");
        console.error("5. Sjekk at du har ÉTT sett anførselstegn rundt key-en: \"pk_test_...\"");
      } else {
        console.error(`💡 Key-en finnes men har feil format. Startet med: "${publishableKey.substring(0, 15)}"`);
        console.error("   Forventet format: pk_test_... eller pk_live_...");
        console.error("   💡 Tips: Sjekk om du har ekstra anførselstegn i .env filen");
        console.error("   Riktig: NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=\"pk_test_...\"");
        console.error("   Feil: NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=\"\"pk_test_...\"\"");
      }
    }
  }, []);

  const infoForm = useForm<InfoData>({
    resolver: zodResolver(infoSchema),
  });

  const addressForm = useForm({
    resolver: zodResolver(addressSchema),
    defaultValues: { country: "NO" },
  });

  const shippingCost = shippingMethod === "standard" ? (total >= 500 ? 0 : 99) : 199;
  const grandTotal = Math.max(0, total + shippingCost - discountAmount);

  useEffect(() => {
    if (items.length === 0) {
      router.push("/cart");
    }
  }, [items, router]);

  // Hent affiliateCode fra cookie hvis satt
  useEffect(() => {
    if (typeof document === "undefined") return;
    const match = document.cookie.split("; ").find((row) => row.startsWith("affiliateCode="));
    if (match) {
      setAffiliateCode(match.split("=")[1] || null);
    }
  }, []);

  const handleInfoSubmit = async (data: InfoData) => {
    setStep(2);
  };

  const handleAddressSubmit = async (data: any) => {
    // Ensure country is set
    const addressData: AddressData = {
      ...data,
      country: data.country || "NO",
    };
    setStep(3);
  };

  const applyDiscount = async () => {
    setDiscountMessage(null);
    setDiscountAmount(0);
    const code = discountCode.trim();
    if (!code) return;
    try {
      const res = await fetch("/api/discounts/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!data.valid) {
        setDiscountMessage("Rabattkode er ugyldig eller utløpt.");
        setDiscountAmount(0);
        return;
      }
      const percent = data.percentOff ? data.percentOff / 100 : 0;
      const amount = data.amountOff ?? 0;
      const computed = total * percent + amount;
      const capped = Math.max(0, Math.min(computed, total));
      setDiscountAmount(capped);
      setDiscountMessage(`Rabattkode aktivert: -${capped.toFixed(0)} kr`);
    } catch (e) {
      setDiscountMessage("Kunne ikke validere rabattkode.");
    }
  };

  const handleShippingMethod = () => {
    setStep(4);
  };

  const handlePaymentMethod = async () => {
    // Sjekk Stripe keys
    if (stripeKeyStatus === "missing" || !process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
      const errorMsg =
        "Stripe er ikke konfigurert. NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY mangler i .env filen.\n\n" +
        "Vennligst legg til:\n" +
        "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...\n" +
        "STRIPE_SECRET_KEY=sk_test_...";
      setError(errorMsg);
      console.error("❌ NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set");
      return;
    }

    if (paymentMethod !== "card") {
      // For andre betalingsmetoder, gå direkte til bekreftelse
      // Dette kan utvides senere
      clearCart();
      router.push("/order-confirmation");
      return;
    }

    // For Stripe (card payment)
    setLoading(true);
    setError(null);

    try {
      const infoData = infoForm.getValues();
      const addressData = addressForm.getValues();


      // Valider at vi har all nødvendig data
      if (!infoData.email || !infoData.fullName) {
        throw new Error("Manglende kundeinformasjon");
      }
      if (!addressData.address1 || !addressData.zipCode || !addressData.city) {
        throw new Error("Manglende leveringsadresse");
      }
      if (items.length === 0) {
        throw new Error("Handlekurven er tom");
      }

      const response = await fetch("/api/checkout/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          customer: {
            email: infoData.email,
            name: infoData.fullName,
            fullName: infoData.fullName,
            phone: infoData.phone,
            address: addressData.address1,
            address1: addressData.address1,
            address2: addressData.address2,
            zip: addressData.zipCode,
            zipCode: addressData.zipCode,
            city: addressData.city,
            country: addressData.country,
          },
          total: grandTotal,
          shippingCost,
          discountCode: discountCode.trim() || undefined,
          affiliateCode: affiliateCode || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("❌ API Error:", {
          status: response.status,
          statusText: response.statusText,
          error: data.error,
          details: data.details,
        });
        throw new Error(
          data.error || `Kunne ikke opprette betaling (${response.status}: ${response.statusText})`
        );
      }

      if (!data.clientSecret) {
        console.error("❌ No clientSecret in response:", data);
        throw new Error("Mottok ikke betalingsnøkkel fra server");
      }


      setClientSecret(data.clientSecret);
      setOrderId(data.orderId);
      setStep(5); // Gå til Stripe PaymentElement
      setError(null);
    } catch (error: any) {
      console.error("❌ Error creating payment intent:", {
        message: error.message,
        stack: error.stack,
        name: error.name,
      });
      setError(
        `Feil ved opprettelse av betaling: ${error.message || "Noe gikk galt. Prøv igjen."}`
      );
    } finally {
      setLoading(false);
    }
  };

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10">
      <h1 className="mb-6 text-2xl sm:text-3xl font-bold text-gray-900">Checkout</h1>
      <div className="mb-8 flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm font-medium">
        {["Informasjon", "Levering", "Leveringsmetode", "Betaling", "Bekreftelse"].map((label, index) => (
          <div key={label} className="flex items-center gap-2">
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-full border-2 font-semibold transition-all ${
                step > index + 1
                  ? "border-green-600 bg-green-600 text-white"
                  : step === index + 1
                    ? "border-green-600 bg-green-50 text-green-600"
                    : "border-gray-300 bg-white text-gray-400"
              }`}
            >
              {index + 1}
            </span>
            <span className={`hidden sm:inline ${step === index + 1 ? "text-green-600 font-semibold" : step > index + 1 ? "text-gray-600" : "text-gray-400"}`}>{label}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:gap-8 lg:grid-cols-[1.2fr,0.8fr]">
        <div className="space-y-6">
          {/* Rabattkode */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm space-y-3">
            <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Rabattkode</h2>
            <p className="text-sm text-gray-600">Har du en kode? Legg den inn her.</p>
            <div className="flex gap-2">
              <Input
                value={discountCode}
                onChange={(e) => setDiscountCode(e.target.value)}
                placeholder="Rabattkode"
                className="flex-1"
              />
              <Button type="button" onClick={applyDiscount} className="bg-green-600 hover:bg-green-700 text-white">
                Aktiver
              </Button>
            </div>
            {discountMessage && <p className="text-sm text-green-700 font-medium">{discountMessage}</p>}
          </div>
          {step === 1 && (
            <form
              className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm space-y-4"
              onSubmit={infoForm.handleSubmit(handleInfoSubmit)}
            >
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Kundeinformasjon</h2>
              <Input
                type="email"
                placeholder="E-post *"
                {...infoForm.register("email")}
              />
              {infoForm.formState.errors.email && (
                <p className="text-sm text-danger">{infoForm.formState.errors.email.message}</p>
              )}
              <Input
                type="text"
                placeholder="Fullt navn *"
                {...infoForm.register("fullName")}
              />
              {infoForm.formState.errors.fullName && (
                <p className="text-sm text-danger">{infoForm.formState.errors.fullName.message}</p>
              )}
              <Input
                type="tel"
                placeholder="Telefon"
                {...infoForm.register("phone")}
              />
              <Button type="submit" className="w-full bg-green-600 hover:bg-green-700 text-white">
                Fortsett til levering
              </Button>
            </form>
          )}

          {step === 2 && (
            <form
              className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm space-y-4"
              onSubmit={addressForm.handleSubmit(handleAddressSubmit)}
            >
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Leveringsadresse</h2>
              <Input
                type="text"
                placeholder="Adresse *"
                {...addressForm.register("address1")}
              />
              {addressForm.formState.errors.address1 && (
                <p className="text-sm text-danger">{addressForm.formState.errors.address1.message}</p>
              )}
              <Input
                type="text"
                placeholder="Adresselinje 2 (valgfritt)"
                {...addressForm.register("address2")}
              />
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Input
                    type="text"
                    placeholder="Postnummer *"
                    {...addressForm.register("zipCode")}
                  />
                  {addressForm.formState.errors.zipCode && (
                    <p className="text-sm text-danger">{addressForm.formState.errors.zipCode.message}</p>
                  )}
                </div>
                <div>
                  <Input
                    type="text"
                    placeholder="By *"
                    {...addressForm.register("city")}
                  />
                  {addressForm.formState.errors.city && (
                    <p className="text-sm text-danger">{addressForm.formState.errors.city.message}</p>
                  )}
                </div>
              </div>
              <select
                className="w-full rounded-lg border px-3 py-2"
                {...addressForm.register("country")}
              >
                <option value="NO">Norge</option>
                <option value="SE">Sverige</option>
                <option value="DK">Danmark</option>
              </select>
              <Button type="submit" className="w-full bg-green-600 hover:bg-green-700 text-white">
                Fortsett til leveringsmetode
              </Button>
            </form>
          )}

          {step === 3 && (
            <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm">
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Leveringsmetode</h2>
              <div className="space-y-3">
                <label className="flex cursor-pointer items-center gap-3 rounded-2xl border p-4">
                  <input
                    type="radio"
                    checked={shippingMethod === "standard"}
                    onChange={() => setShippingMethod("standard")}
                  />
                  <div>
                    <p className="font-semibold text-slate-900">
                      Standard (5-7 dager) - Gratis over 500 kr
                    </p>
                    <p className="text-sm text-secondary">Sendes med Posten</p>
                  </div>
                </label>
                <label className="flex cursor-pointer items-center gap-3 rounded-2xl border p-4">
                  <input
                    type="radio"
                    checked={shippingMethod === "express"}
                    onChange={() => setShippingMethod("express")}
                  />
                  <div>
                    <p className="font-semibold text-slate-900">Express (2-3 dager) - 99 kr</p>
                    <p className="text-sm text-secondary">Prioritert levering</p>
                  </div>
                </label>
              </div>
              <Button className="w-full bg-green-600 hover:bg-green-700 text-white" onClick={handleShippingMethod}>
                Fortsett til betaling
              </Button>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm">
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Betaling</h2>
              
              {error && (
                <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600 whitespace-pre-line">
                  {error}
                </div>
              )}

              {stripeKeyStatus === "missing" && (
                <div className="rounded-lg bg-yellow-50 p-4 text-sm text-yellow-600">
                  ⚠️ Stripe er ikke konfigurert. NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY mangler i .env filen.
                </div>
              )}

              <div className="space-y-3">
                {[
                  { value: "card", label: "Kort (Visa/Mastercard)", available: true },
                  { value: "vipps", label: "Vipps", available: false },
                  { value: "klarna", label: "Klarna", available: false },
                ].map((option) => (
                  <label
                    key={option.value}
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-4 ${
                      !option.available ? "opacity-50 cursor-not-allowed" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      checked={paymentMethod === option.value}
                      onChange={() => option.available && setPaymentMethod(option.value)}
                      disabled={!option.available}
                    />
                    <span className="font-semibold text-slate-900">
                      {option.label}
                      {!option.available && " (Kommer snart)"}
                    </span>
                  </label>
                ))}
              </div>
              <Button
                className="w-full bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
                onClick={handlePaymentMethod}
                disabled={loading || stripeKeyStatus === "missing" || paymentMethod !== "card"}
              >
                {loading ? (
                  <>
                    <span className="mr-2">⏳</span>
                    Oppretter betaling...
                  </>
                ) : (
                  "Fortsett til betalingsformular"
                )}
              </Button>
            </div>
          )}

          {step === 5 && clientSecret && (
            <div className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm">
              <h2 className="mb-4 text-lg sm:text-xl font-semibold text-gray-900">Betal med kort</h2>
              {!stripePromise ? (
                <div className="rounded-lg bg-red-50 p-4 text-red-600">
                  ❌ Stripe er ikke konfigurert. NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY mangler.
                  <p className="mt-2 text-sm">
                    Vennligst legg til Stripe keys i .env filen og start serveren på nytt.
                  </p>
                </div>
              ) : (
                <Elements
                  stripe={stripePromise}
                  options={{
                    clientSecret,
                    appearance: {
                      theme: "stripe",
                    },
                    locale: "no",
                  }}
                >
                  <div className="mb-4 rounded-lg bg-green-900/20 border border-green-600 p-4 text-sm text-green-400">
                    💡 <strong>Test kort:</strong> 4242 4242 4242 4242<br />
                    CVV: 123 | Utløpsdato: Hvilken som helst fremtidig dato
                  </div>
                  <CheckoutForm clientSecret={clientSecret} />
                </Elements>
              )}
            </div>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 space-y-4 rounded-xl border border-gray-200 bg-white p-5 sm:p-6 shadow-sm h-fit">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900">Ordresammendrag</h2>
          <div className="rounded-lg border bg-gray-50 p-3 text-sm space-y-2">
            <label className="block text-sm font-medium text-slate-800">Rabattkode</label>
            <input
              value={discountCode}
              onChange={(e) => setDiscountCode(e.target.value)}
              placeholder="Rabattkode (valgfritt)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <div className="space-y-4">
            {items.map((item) => (
              <div key={item.productId} className="flex items-center justify-between text-sm">
                <div>
                  <p className="font-semibold text-slate-900">{item.name}</p>
                  <p className="text-secondary">x {item.quantity}</p>
                </div>
                <p className="font-semibold">{formatCurrency(item.price * item.quantity)}</p>
              </div>
            ))}
          </div>
          <div className="space-y-2 border-t pt-4 text-sm text-secondary">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatCurrency(total)}</span>
            </div>
            <div className="flex justify-between">
              <span>Frakt</span>
              <span>{shippingCost === 0 ? "Gratis" : formatCurrency(shippingCost)}</span>
            </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-green-700 font-semibold">
                  <span>Rabatt</span>
                  <span>-{formatCurrency(discountAmount)}</span>
                </div>
              )}
            {total < 500 && shippingCost === 0 && (
              <p className="text-xs text-secondary">
                Gratis frakt ved kjøp over 500 kr
              </p>
            )}
            <div className="flex justify-between border-t pt-2 text-lg font-semibold text-slate-900">
              <span>Total</span>
              <span>{formatCurrency(grandTotal)}</span>
            </div>
              {discountMessage && (
                <p className="text-xs text-green-700">{discountMessage}</p>
              )}
          </div>
        </aside>
      </div>
    </div>
  );
}
