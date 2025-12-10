"use client";

import { useState } from "react";

export function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      setMessage({ type: "error", text: "Vennligst skriv inn en gyldig e-postadresse." });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (data.ok) {
        setMessage({ type: "success", text: "Takk! Du er nå meldt på nyhetsbrevet." });
        setEmail("");
      } else {
        setMessage({ type: "error", text: data.error || "Noe gikk galt. Prøv igjen senere." });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Noe gikk galt. Prøv igjen senere." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex max-w-md flex-col sm:flex-row gap-2">
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Din e-postadresse"
        required
        disabled={isSubmitting}
        className="flex-1 rounded-lg border-0 px-4 py-2.5 sm:py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm sm:text-base disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-lg bg-green-600 px-5 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base font-semibold text-white hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? "Sender..." : "Meld på"}
      </button>
      {message && (
        <div
          className={`mt-2 text-sm ${
            message.type === "success" ? "text-green-400" : "text-red-400"
          }`}
        >
          {message.text}
        </div>
      )}
    </form>
  );
}

