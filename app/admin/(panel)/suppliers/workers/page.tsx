import { getWorkerObservability } from "@/lib/suppliers/workers/jobs";
import WorkersClient from "./WorkersClient";

export const dynamic = "force-dynamic";

export default async function WorkersPage() {
  const initial = await getWorkerObservability().catch(() => ({
    byStatus: {},
    activeWorkers: 0,
    deadLast24h: 0,
    succeededLast24h: 0,
    avgImportMs: null as number | null,
    queueLength: 0,
    recentJobs: [],
    buyer: null,
  }));

  return <WorkersClient initial={initial} />;
}
