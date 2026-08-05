import Link from "next/link";
import { Settings, Truck, ShieldCheck, Tags } from "lucide-react";
import { AdminPageHeader, AdminCard } from "@/components/admin/ui";

/**
 * Store settings hub — no empty stub. Points to real destinations.
 */
export default function AdminSettings() {
  const links = [
    {
      href: "/admin/suppliers/settings",
      title: "Leverandørinnstillinger",
      description: "Kontoer, nøkler og synk for CJ/CSV og andre leverandører.",
      icon: Truck,
    },
    {
      href: "/admin/suppliers/merchandiser/settings",
      title: "Finn produkter — profil",
      description: "Butikkprofil og preferanser for produktfunn.",
      icon: Tags,
    },
    {
      href: "/admin/trust",
      title: "AI-tillit",
      description: "Se hva AI har lært og hvor sikker den er.",
      icon: ShieldCheck,
    },
  ];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <AdminPageHeader
        title="Innstillinger"
        description="Velg hva du vil justere. Daglig drift skjer fortsatt via Rob’s Desk."
        backHref="/admin/dashboard"
        backLabel="Rob’s Desk"
      />

      <div className="grid gap-3">
        {links.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href}>
              <AdminCard className="transition hover:border-slate-300 hover:shadow-md">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                    <Icon size={20} strokeWidth={1.75} />
                  </div>
                  <div>
                    <h2 className="font-semibold text-slate-900">{item.title}</h2>
                    <p className="mt-0.5 text-sm text-slate-500">{item.description}</p>
                  </div>
                </div>
              </AdminCard>
            </Link>
          );
        })}
      </div>

      <AdminCard className="bg-slate-50">
        <div className="flex items-start gap-3 text-sm text-slate-600">
          <Settings size={18} className="mt-0.5 flex-shrink-0" />
          <p>
            Generelle butikkinnstillinger (frakt, org.nr, merkevare) styres via miljøvariabler og
            site-config. Si fra hvis du vil ha et eget panel her senere.
          </p>
        </div>
      </AdminCard>
    </div>
  );
}
