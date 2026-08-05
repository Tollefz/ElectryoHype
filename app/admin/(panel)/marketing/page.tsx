import { runAdminPage } from "@/lib/admin/run-admin-page";
import MarketingMissionClient from "./MarketingMissionClient";

export default async function MarketingPage() {
  return runAdminPage("marketing", "/admin/marketing", async () => (
    <MarketingMissionClient />
  ));
}
