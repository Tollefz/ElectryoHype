type Check = { key: string; ok: boolean; hint: string; label: string };

function envChecks(): Check[] {
  const stripeSecret = Boolean(process.env.STRIPE_SECRET_KEY?.trim());
  const stripePub = Boolean(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim());
  const webhook = Boolean(process.env.STRIPE_WEBHOOK_SECRET?.trim());
  const resend = Boolean(process.env.RESEND_API_KEY?.trim());
  const adminEmail = Boolean(process.env.ADMIN_EMAIL?.trim());
  const cron = Boolean(process.env.INTERNAL_CRON_TOKEN?.trim());
  const live = process.env.STRIPE_SECRET_KEY?.trim().startsWith("sk_live_");

  return [
    {
      key: "STRIPE_SECRET_KEY",
      label: "Betaling (hemmelig nøkkel)",
      ok: stripeSecret,
      hint: live
        ? "Live-nøkkel er satt"
        : stripeSecret
          ? "Testnøkkel er satt — bytt til live før offentlig lansering"
          : "Må settes for å ta betalt",
    },
    {
      key: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
      label: "Betaling (offentlig nøkkel)",
      ok: stripePub,
      hint: "Trengs for kassen i butikken",
    },
    {
      key: "STRIPE_WEBHOOK_SECRET",
      label: "Betalingsbekreftelse",
      ok: webhook,
      hint: "Trengs for å markere ordre som betalt og sende e-post",
    },
    {
      key: "RESEND_API_KEY",
      label: "E-postutsending",
      ok: resend,
      hint: "Trengs for ordrebekreftelser",
    },
    {
      key: "ADMIN_EMAIL",
      label: "Admin-epost",
      ok: adminEmail,
      hint: "Trengs for varsel om nye ordrer",
    },
    {
      key: "INTERNAL_CRON_TOKEN",
      label: "Planlagte jobber",
      ok: cron,
      hint: "Trengs for bakgrunnsjobber (importmotor)",
    },
  ];
}

/**
 * Soft readiness banner — Norwegian, no raw env dumps in the headline.
 * Technical keys live under «Vis avansert».
 */
export function LaunchReadinessBanner() {
  const checks = envChecks();
  const missing = checks.filter((c) => !c.ok);
  if (missing.length === 0) return null;

  return (
    <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-950">
      <h3 className="text-base font-semibold">
        Butikken er ikke klar for betaling ({missing.length} mangler)
      </h3>
      <p className="mt-1 text-sm text-amber-900/90">
        Sett opp følgende før du tar imot ekte ordre. Kontakt utvikler hvis du er usikker.
      </p>
      <ul className="mt-3 space-y-1.5 text-sm">
        {missing.map((c) => (
          <li key={c.key} className="flex gap-2">
            <span className="font-medium">{c.label}</span>
            <span className="text-amber-800/80">— {c.hint}</span>
          </li>
        ))}
      </ul>
      <details className="mt-3 text-xs text-amber-800/80">
        <summary className="cursor-pointer font-medium">Vis avansert</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 font-mono">
          {checks.map((c) => (
            <li key={c.key}>
              {c.key}: {c.ok ? "OK" : "MANGLER"}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
