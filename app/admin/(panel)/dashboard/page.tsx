import Link from "next/link";
import { getStoreIdFromHeadersServer } from "@/lib/store-server";
import { formatCurrency } from "@/lib/format";
import { LaunchReadinessBanner } from "@/components/admin/LaunchReadinessBanner";
import { getDeskQueues, getTodayPnl } from "@/lib/ops/robs-desk";
import {
  BulkMarkOrderedButton,
  CleanTestOrdersButton,
  RetryFailedEmailsHint,
  RebuildCategoriesButton,
} from "@/components/admin/RobsDeskActions";
import { DeskAiColleague } from "@/components/admin/DeskAiColleague";
import { DeskRobCeo } from "@/components/admin/DeskRobCeo";
import { DeskSelfImprovePanel } from "@/components/admin/DeskSelfImprovePanel";
import { DeskRealStorePanel } from "@/components/admin/DeskRealStorePanel";
import { DeskBuyerMissions } from "@/components/admin/DeskBuyerMissions";
import { DeskDigitalBuyerStatus } from "@/components/admin/DeskDigitalBuyerStatus";
import { DeskOrderAutomation } from "@/components/admin/DeskOrderAutomation";
import { DeskOrderBrain } from "@/components/admin/DeskOrderBrain";
import { DeskFinanceBrain } from "@/components/admin/DeskFinanceBrain";
import { DeskCustomerBrain } from "@/components/admin/DeskCustomerBrain";
import { DeskSeoBrain } from "@/components/admin/DeskSeoBrain";
import { DeskMarketing } from "@/components/admin/DeskMarketing";
import { DeskAiFeed } from "@/components/admin/DeskAiFeed";
import { DeskStoreMemory } from "@/components/admin/DeskStoreMemory";
import { DeskWidgetBoundary } from "@/components/admin/DeskWidgetBoundary";
import { buildColleagueBrief } from "@/lib/ops/ai-colleague-brief";
import { buildBuyerBoard } from "@/lib/ops/desk-buyer-groups";
import { buildDeskAiFeed } from "@/lib/ops/desk-ai-feed";
import { buildMemoryStars } from "@/lib/ops/desk-memory-stars";
import { parseScanRequest } from "@/lib/buyer/category-missions";
import { prisma } from "@/lib/prisma";
import { safeQuery, safeQueryResult } from "@/lib/safeQuery";
import { DataState } from "@/components/admin/DataState";
import { findObviousTestOrders } from "@/lib/ops/order-cleanup";
import { getAuthSession } from "@/lib/auth";
import { runAdminPage } from "@/lib/admin/run-admin-page";

export default async function AdminDashboard() {
  return runAdminPage("desk", "/admin/dashboard", () => renderDesk());
}

async function renderDesk() {
  const storeId = await getStoreIdFromHeadersServer();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const session = await getAuthSession().catch(() => null);
  const adminName =
    session?.user?.name?.split(" ")[0] ||
    process.env.ADMIN_DISPLAY_NAME ||
    (session?.user?.email ? session.user.email.split("@")[0] : null) ||
    "Robin";

  // Probe DB once — never render invented zeros when infrastructure is down
  const dbProbe = await safeQueryResult(
    () => prisma.$queryRaw`SELECT 1`,
    "desk:probe"
  );
  if (!dbProbe.ok) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Rob&apos;s Desk</h1>
          <p className="mt-1 text-sm text-slate-600">
            God dag, {adminName}. Systemet er midlertidig utilgjengelig.
          </p>
        </div>
        <DataState state="error" surface="desk" error={dbProbe.error} />
        <DataState
          state="error"
          surface="morningBrief"
          title="Ikke nok data til å lage Morning Brief"
          detail="Databasen svarer ikke — brief bygges bare fra faktisk aktivitet."
          compact
        />
      </div>
    );
  }

  const [
    pnl,
    queues,
    paidNewOrders,
    testOrders,
    apiErrors24h,
    openChanges,
    readyToPublish,
    merchSummary,
    intelligenceTasks,
    autonomyBrief,
    aiKpis,
    improveBundle,
    realStore,
    buyerRankedRaw,
    buyerScan,
    storeMemory,
    recentAutonomyRuns,
    recentDecisions,
    recentImprovements,
  ] = await Promise.all([
    safeQuery(() => getTodayPnl(storeId), {
      paidOrders: 0,
      revenue: 0,
      supplierCost: 0,
      stripeFeesEst: 0,
      shippingCollected: 0,
      vatIncluded: 0,
      grossAfterSupplier: 0,
      netEst: 0,
    }, "desk:pnl"),
    safeQuery(() => getDeskQueues(storeId), {
      paidNew: 0,
      unpaid: 0,
      failedPay: 0,
      failedEmail: 0,
      refundedToday: 0,
      noSeo: 0,
      missingImages: 0,
      needsReview: 0,
      importQueued: 0,
      importFailed: 0,
      importReview: 0,
      supplierOutOfStock: 0,
      ordersNeedAttention: 0,
    }, "desk:queues"),
    safeQuery(
      () =>
        prisma.order.findMany({
          where: {
            storeId,
            paymentStatus: "paid",
            fulfillmentStatus: "NEW",
            archivedAt: null,
          },
          include: { customer: true },
          orderBy: { createdAt: "asc" },
          take: 12,
        }),
      [],
      "desk:paid-new"
    ),
    safeQuery(() => findObviousTestOrders(storeId), [], "desk:test-orders"),
    safeQuery(
      () =>
        prisma.supplierApiLog.count({
          where: { ok: false, createdAt: { gte: since } },
        }),
      0,
      "desk:api-errors"
    ),
    safeQuery(
      () =>
        prisma.supplierChangeEvent.count({
          where: { applied: false, dismissed: false },
        }),
      0,
      "desk:open-changes"
    ),
    safeQuery(
      () =>
        prisma.importQueueItem.count({
          where: { status: { in: ["approved", "review"] } },
        }),
      0,
      "desk:ready-publish"
    ),
    safeQuery(
      async () => {
        const { getMerchandiserSummary } = await import(
          "@/lib/suppliers/merchandiser/actions"
        );
        return getMerchandiserSummary();
      },
      { suggested: 0, premium: 0, highMargin: 0, trending: 0, lastScan: null },
      "desk:merchandiser"
    ),
    safeQuery(
      async () => {
        const snap = await prisma.storeIntelligenceSnapshot.findFirst({
          orderBy: { generatedAt: "desc" },
          select: {
            dailyTasks: true,
            storeHealthScore: true,
            generatedAt: true,
          },
        });
        const tasks = Array.isArray(snap?.dailyTasks)
          ? (snap!.dailyTasks as Array<{
              id: string;
              title: string;
              detail: string;
              count?: number;
              href: string;
              urgency?: string;
            }>)
          : [];
        return {
          tasks,
          health: snap?.storeHealthScore ?? null,
          generatedAt: snap?.generatedAt ?? null,
        };
      },
      {
        tasks: [] as Array<{
          id: string;
          title: string;
          detail: string;
          count?: number;
          href: string;
          urgency?: string;
        }>,
        health: null as number | null,
        generatedAt: null as Date | null,
      },
      "desk:intelligence"
    ),
    safeQuery(
      async () => {
        const run = await prisma.autonomyRun.findFirst({
          where: { status: "completed", morningBrief: { not: null } },
          orderBy: { finishedAt: "desc" },
          select: {
            morningBrief: true,
            summary: true,
            mode: true,
            finishedAt: true,
            trigger: true,
          },
        });
        const { getAdminSnapshot } = await import("@/lib/ops/admin-snapshot");
        const { buildEvidenceMorningBrief } = await import(
          "@/lib/ops/admin-truth"
        );
        const truth = await getAdminSnapshot({ storeId });
        return {
          ...(run || { morningBrief: null, summary: null }),
          evidenceBrief: buildEvidenceMorningBrief(truth),
          pipeline: truth.pipeline,
        };
      },
      null,
      "desk:autonomy-brief"
    ),
    safeQuery(
      async () => {
        const { buildStoreAiKpis } = await import("@/lib/trust/kpis");
        return buildStoreAiKpis();
      },
      {
        productsAnalyzed: 0,
        productsImported: 0,
        productsPublished: 0,
        avgMarginPct: null as number | null,
        hitRate: 0,
        timeSavedHoursEst: null as number | null,
        improvement30d: null as number | null,
        decisions30d: 0,
        overrides30d: 0,
      },
      "desk:ai-kpis"
    ),
    safeQuery(
      async () => {
        const { getDeskImproveBundle } = await import("@/lib/improve/nightly");
        return getDeskImproveBundle();
      },
      {
        objectives: null,
        pending: [],
        missions: [],
        latestRun: null,
        weekStats: { improved: 0, published: 0, removed: 0 },
      } as any,
      "desk:improve"
    ),
    safeQuery(
      async () => {
        const { buildRealStoreSnapshot } = await import("@/lib/real-store");
        return buildRealStoreSnapshot(storeId);
      },
      {
        maturityScore: 0,
        maturityLabel: "Laster…",
        gates: [],
        automation: {
          areas: [],
          adminMinutesPerDayEst: 45,
          overallPct: 0,
        },
        catalogQualityAvg: null as number | null,
        catalogIssues: [],
        performanceProblems: [],
        dailyImprovements: 0,
        workSavedHours30d: 0,
        aiReview: null as string | null,
        readyFor20MinDay: false,
      },
      "desk:real-store"
    ),
    safeQuery(
      async () => {
        const { listBuyerRanking } = await import("@/lib/buyer");
        return listBuyerRanking({ storeId, limit: 120 });
      },
      [],
      "desk:buyer-candidates"
    ),
    safeQuery(
      async () => {
        const { getLatestBuyerScan } = await import("@/lib/buyer");
        return getLatestBuyerScan(storeId);
      },
      null,
      "desk:buyer-scan"
    ),
    safeQuery(
      async () => {
        const { getOrCreateStoreMemory } = await import("@/lib/autonomy/memory");
        return getOrCreateStoreMemory(storeId);
      },
      null,
      "desk:store-memory"
    ),
    safeQuery(
      () =>
        prisma.autonomyRun.findMany({
          where: { status: "completed" },
          orderBy: { finishedAt: "desc" },
          take: 3,
          select: {
            id: true,
            finishedAt: true,
            startedAt: true,
            summary: true,
            morningBrief: true,
          },
        }),
      [],
      "desk:autonomy-runs"
    ),
    safeQuery(
      () =>
        prisma.autonomyDecision.findMany({
          orderBy: { createdAt: "desc" },
          take: 12,
          select: {
            id: true,
            createdAt: true,
            stage: true,
            action: true,
            subjectKey: true,
          },
        }),
      [],
      "desk:decisions"
    ),
    safeQuery(
      () =>
        prisma.storeImprovement.findMany({
          orderBy: { createdAt: "desc" },
          take: 8,
          select: { id: true, createdAt: true, title: true, status: true },
        }),
      [],
      "desk:improve-feed"
    ),
  ]);

  const queuesSafe = queues || {
    paidNew: 0,
    unpaid: 0,
    failedPay: 0,
    failedEmail: 0,
    refundedToday: 0,
    noSeo: 0,
    missingImages: 0,
    needsReview: 0,
    importQueued: 0,
    importFailed: 0,
    importReview: 0,
    supplierOutOfStock: 0,
  };

  const autonomySummary =
    autonomyBrief?.summary &&
    typeof autonomyBrief.summary === "object" &&
    !Array.isArray(autonomyBrief.summary)
      ? (autonomyBrief.summary as Record<string, number>)
      : null;

  const pendingList = Array.isArray(improveBundle?.pending)
    ? improveBundle.pending
    : [];
  const improvePending = pendingList.length;
  const priceChangePending = pendingList.filter(
    (p: { kind?: string }) => p?.kind === "price_adjust"
  ).length;

  const catalogIssuesHigh = (realStore?.catalogIssues || []).filter(
    (i) => i?.severity === "high"
  ).length;
  const performanceProblems = realStore?.performanceProblems?.length ?? 0;
  const buyerBoard = buildBuyerBoard(buyerRankedRaw || []);
  const buyerRanked = buyerBoard.cards.length;

  const buyerMissionResult = parseScanRequest(buyerScan?.request).result;

  const colleagueBrief = buildColleagueBrief({
    adminName,
    morningBrief:
      (autonomyBrief as { evidenceBrief?: string } | null)?.evidenceBrief ||
      autonomyBrief?.morningBrief ||
      null,
    autonomySummary,
    buyerMission: buyerMissionResult
      ? {
          analyzed: buyerMissionResult.analyzed,
          discarded: buyerMissionResult.discarded,
          candidates: buyerMissionResult.candidates,
          passedQualityGate: buyerMissionResult.passedQualityGate,
          readyToPublish: buyerMissionResult.readyToPublish,
          imported: buyerMissionResult.imported,
        }
      : buyerScan
        ? {
            analyzed: buyerScan.scanned ?? 0,
            discarded: buyerScan.filtered ?? 0,
            candidates: buyerScan.kept ?? 0,
          }
        : null,
    merchSuggested: merchSummary?.suggested ?? 0,
    readyToPublish: readyToPublish ?? 0,
    improvePending,
    priceChangePending,
    paidNewOrders: queuesSafe.paidNew ?? 0,
    importFailed: queuesSafe.importFailed ?? 0,
    ordersNeedAttention: queuesSafe.ordersNeedAttention ?? 0,
    failedPay: queuesSafe.failedPay ?? 0,
    failedEmail: queuesSafe.failedEmail ?? 0,
    catalogIssuesHigh,
    performanceProblems,
    buyerRanked,
    aiReview: realStore?.aiReview ?? null,
    adminMinutesEst:
      realStore?.automation?.adminMinutesPerDayEst ??
      Math.max(
        5,
        (queuesSafe.paidNew || 0) * 3 +
          improvePending * 1 +
          (readyToPublish || 0) * 1
      ),
  });

  const feedItems = buildDeskAiFeed({
    autonomyRuns: recentAutonomyRuns,
    buyerScans: buyerScan
      ? [
          {
            id: buyerScan.id,
            createdAt: buyerScan.createdAt,
            finishedAt: buyerScan.finishedAt,
            scanned: buyerScan.scanned ?? 0,
            kept: buyerScan.kept ?? 0,
            filtered: buyerScan.filtered ?? 0,
            status: buyerScan.status,
          },
        ]
      : [],
    decisions: recentDecisions,
    improvements: recentImprovements,
  });

  const memoryStars = buildMemoryStars(storeMemory);

  const paidOrders = Array.isArray(paidNewOrders) ? paidNewOrders : [];
  const tests = Array.isArray(testOrders) ? testOrders : [];

  return (
    <div className="space-y-6">
      <DeskWidgetBoundary name="Launch readiness">
        <LaunchReadinessBanner />
      </DeskWidgetBoundary>

      <DeskWidgetBoundary name="Rob CEO">
        <DeskRobCeo />
      </DeskWidgetBoundary>

      <DeskWidgetBoundary name="AI-medarbeider">
        <DeskAiColleague brief={colleagueBrief} />
      </DeskWidgetBoundary>

      <DeskWidgetBoundary name="AI-oppdrag">
        <DeskBuyerMissions compact />
      </DeskWidgetBoundary>

      <DeskWidgetBoundary name="Digital Buyer">
        <DeskDigitalBuyerStatus />
      </DeskWidgetBoundary>

      <DeskWidgetBoundary name="Order Brain">
        <DeskOrderBrain />
      </DeskWidgetBoundary>

      <DeskWidgetBoundary name="Order Automation">
        <DeskOrderAutomation />
      </DeskWidgetBoundary>

      <DeskWidgetBoundary name="Finance Brain">
        <DeskFinanceBrain />
      </DeskWidgetBoundary>

      <DeskWidgetBoundary name="Customer Brain">
        <DeskCustomerBrain />
      </DeskWidgetBoundary>

      <DeskWidgetBoundary name="SEO Brain">
        <DeskSeoBrain />
      </DeskWidgetBoundary>

      <DeskWidgetBoundary name="Marketing">
        <DeskMarketing />
      </DeskWidgetBoundary>

      <div className="grid gap-4 lg:grid-cols-2">
        <DeskWidgetBoundary name="AI-feed">
          <DeskAiFeed items={feedItems} />
        </DeskWidgetBoundary>
        <DeskWidgetBoundary name="Store Memory">
          <DeskStoreMemory memory={storeMemory} stars={memoryStars} />
        </DeskWidgetBoundary>
      </div>

      <DeskWidgetBoundary name="Godkjenninger">
        <DeskSelfImprovePanel
          initialPending={pendingList.map(
            (p: {
              id: string;
              kind: string;
              title: string;
              why: unknown;
              confidence: number | null;
              before: unknown;
              proposed: unknown;
              product: {
                id: string;
                name: string;
                slug: string;
                qualityScore: number | null;
              } | null;
            }) => ({
              id: p.id,
              kind: p.kind,
              title: p.title,
              why: p.why,
              confidence: p.confidence,
              before: p.before,
              proposed: p.proposed,
              product: p.product
                ? {
                    id: p.product.id,
                    name: p.product.name,
                    slug: p.product.slug,
                    qualityScore: p.product.qualityScore,
                  }
                : null,
            })
          )}
          initialMissions={(improveBundle?.missions || []).map(
            (m: {
              id: string;
              title: string;
              brief: string | null;
              progressDone: number;
              targetCount: number | null;
              status: string;
            }) => ({
              id: m.id,
              title: m.title,
              brief: m.brief,
              progressDone: m.progressDone ?? 0,
              targetCount: m.targetCount,
              status: m.status,
            })
          )}
          weekStats={
            improveBundle?.weekStats || {
              improved: 0,
              published: 0,
              removed: 0,
            }
          }
          summary={
            improveBundle?.latestRun?.summaryText ??
            autonomyBrief?.morningBrief ??
            null
          }
        />
      </DeskWidgetBoundary>

      <DeskWidgetBoundary name="Ordre">
        <section
          id="orders-today"
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
        >
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Ordre — her trenger jeg deg
            </h2>
            <p className="text-sm text-slate-600">
              Automatisering validerer og sender til CJ. Du tar over ved
              adressefeil, lager eller manuell review.
            </p>
          </div>

          {paidOrders.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-600">
              <p className="font-medium text-slate-800">
                Ingen betalte NY-ordre akkurat nå.
              </p>
              <p className="mt-1">
                Når kunder betaler, dukker de opp her med pakkseddel.
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Neste steg: godkjenninger over, eller lukk laptopen.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-100">
              {paidOrders.map((o) => (
                <li
                  key={o.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                >
                  <div>
                    <Link
                      href={`/admin/orders/${o.id}`}
                      className="font-semibold text-emerald-700 hover:underline"
                    >
                      {o.orderNumber}
                    </Link>
                    <span className="ml-2 text-slate-600">
                      {o.customer?.name || o.customerEmail || "Kunde"} ·{" "}
                      {formatCurrency(o.total)}
                    </span>
                  </div>
                  <div className="flex gap-3 text-xs font-medium">
                    <Link
                      href={`/admin/orders/${o.id}/print`}
                      className="text-slate-700 hover:underline"
                      target="_blank"
                    >
                      Pakkseddel
                    </Link>
                    <Link
                      href={`/admin/orders/${o.id}`}
                      className="text-emerald-700 hover:underline"
                    >
                      Åpne
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-700">
              {(queuesSafe.paidNew || 0) > 0
                ? `${queuesSafe.paidNew} betalte NY-ordre kan markeres «bestilt» (DB).`
                : "Ingen bulk-markering å gjøre."}
            </p>
            <BulkMarkOrderedButton count={queuesSafe.paidNew || 0} />
          </div>
          <div className="flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-800">Kategorimotor</p>
              <p className="text-xs text-slate-500">
                Analysér hele katalogen på nytt — én hovedkategori per produkt, live tellinger.
              </p>
            </div>
            <RebuildCategoriesButton />
          </div>
          <RetryFailedEmailsHint count={queuesSafe.failedEmail || 0} />

          <details className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-700">
              Dagens tall (ferdig regnet)
            </summary>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MoneyTile label="Betalte ordre" value={String(pnl?.paidOrders ?? 0)} />
              <MoneyTile
                label="Omsetning"
                value={formatCurrency(pnl?.revenue ?? 0)}
              />
              <MoneyTile
                label="Leverandørkost"
                value={formatCurrency(pnl?.supplierCost ?? 0)}
              />
              <MoneyTile
                label="Netto est."
                value={formatCurrency(pnl?.netEst ?? 0)}
                emphasize
                good={(pnl?.netEst ?? 0) >= 0}
              />
            </div>
          </details>

          {tests.length > 0 && (
            <div className="flex flex-col gap-3 rounded-xl border border-orange-200 bg-orange-50/50 p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-700">
                {tests.length} åpenbare testordre — trygt å rydde.
              </p>
              <CleanTestOrdersButton count={tests.length} />
            </div>
          )}
        </section>
      </DeskWidgetBoundary>

      <details
        id="desk-publish"
        className="group rounded-2xl border border-slate-200 bg-slate-50/40 p-4 open:bg-white open:shadow-sm sm:p-5"
      >
        <summary className="cursor-pointer list-none">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Mer om butikken (fordypning)
              </h2>
              <p className="text-sm text-slate-600">
                Autonomi, tillit, importmotor og køer — ekspertverktøy. De fleste dager
                holder toppen.
              </p>
            </div>
            <span className="text-xs font-semibold text-slate-500 group-open:hidden">
              Vis mer ↓
            </span>
          </div>
        </summary>

        <div className="mt-5 space-y-5">
          <DeskWidgetBoundary name="Real Store">
            <DeskRealStorePanel snapshot={realStore} />
          </DeskWidgetBoundary>

          {((autonomyBrief as { evidenceBrief?: string } | null)?.evidenceBrief ||
            autonomyBrief?.morningBrief) ? (
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-sm font-semibold text-slate-900">
                Morning Brief
              </h3>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-700">
                {(autonomyBrief as { evidenceBrief?: string } | null)
                  ?.evidenceBrief || autonomyBrief?.morningBrief}
              </pre>
              <Link
                href="/admin/autonomy"
                className="mt-2 inline-block text-sm font-semibold text-emerald-700 hover:underline"
              >
                Autonomi →
              </Link>
            </section>
          ) : (
            <DataState state="empty" surface="morningBrief" compact />
          )}

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">
                Hvordan jeg presterer (30 dager)
              </h3>
              <Link
                href="/admin/trust"
                className="text-sm font-semibold text-emerald-700 hover:underline"
              >
                Full scorecard →
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MoneyTile
                label="Tid spart (est.)"
                value={
                  aiKpis?.timeSavedHoursEst != null
                    ? `${aiKpis.timeSavedHoursEst} t`
                    : "Ikke nok data"
                }
              />
              <MoneyTile
                label="Analysert"
                value={(aiKpis?.productsAnalyzed ?? 0).toLocaleString("no-NO")}
              />
              <MoneyTile label="AI-treff %" value={`${aiKpis?.hitRate ?? 0}%`} />
              <MoneyTile
                label="Forbedring"
                value={
                  aiKpis?.improvement30d == null
                    ? "—"
                    : `${aiKpis.improvement30d > 0 ? "+" : ""}${aiKpis.improvement30d}`
                }
              />
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Dagens fokuspunkter
                </h3>
                <p className="text-xs text-slate-500">
                  Fra Store Intelligence
                  {intelligenceTasks?.health != null
                    ? ` · helse ${Math.round(intelligenceTasks.health)}/100`
                    : ""}
                </p>
              </div>
              <Link
                href="/admin/intelligence"
                className="text-sm font-semibold text-emerald-700 hover:underline"
              >
                Fordypning →
              </Link>
            </div>
            {(intelligenceTasks?.tasks || []).length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 p-3 text-sm text-slate-600">
                <p className="font-medium text-slate-800">
                  Ingen lagret analyse ennå.
                </p>
                <p className="mt-1">
                  Når Intelligence kjører, fylles anbefalingene her.
                </p>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {(intelligenceTasks.tasks || []).slice(0, 6).map((t) => (
                  <Link
                    key={t.id}
                    href={t.href || "/admin/intelligence"}
                    className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2.5 hover:border-emerald-300"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {t.title}
                      </p>
                      <p className="text-xs text-slate-600">{t.detail}</p>
                    </div>
                    {t.count != null ? (
                      <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-bold text-white">
                        {t.count}
                      </span>
                    ) : null}
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">
                Køer som kan trenge deg
              </h3>
              <Link
                href="/admin/suppliers"
                className="text-sm font-semibold text-emerald-700 hover:underline"
              >
                Leverandører →
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <ActionCard
                href="/admin/suppliers/import-queue?status=approved"
                title="Klare for publisering"
                count={readyToPublish || 0}
                hint="Review + godkjent"
                hot={(readyToPublish || 0) > 0}
              />
              <ActionCard
                href="/admin/suppliers/import-queue?status=failed"
                title="Importer som feilet"
                count={queuesSafe.importFailed || 0}
                hint="Fiks eller fjern"
                hot={(queuesSafe.importFailed || 0) > 0}
              />
              <ActionCard
                href="/admin/suppliers/import-queue?status=review"
                title="Trenger review"
                count={queuesSafe.importReview || 0}
                hint="Manuell gjennomgang"
                hot={(queuesSafe.importReview || 0) > 0}
              />
              <ActionCard
                href="/admin/suppliers/logs"
                title="API-feil (24t)"
                count={apiErrors24h || 0}
                hint="Se logger"
                hot={(apiErrors24h || 0) > 0}
              />
              <ActionCard
                href="/admin/products?filter=needs_review"
                title="Lav score / review"
                count={queuesSafe.needsReview || 0}
                hint="Produktkatalog"
                hot={(queuesSafe.needsReview || 0) > 0}
              />
              <ActionCard
                href="/admin/products?filter=no_seo"
                title="Mangler AI/SEO"
                count={queuesSafe.noSeo || 0}
                hint="Fyll inn SEO"
                hot={(queuesSafe.noSeo || 0) > 0}
              />
              <ActionCard
                href="/admin/suppliers/health"
                title="Nye sync-endringer"
                count={openChanges || 0}
                hint="Leverandørstatus"
                hot={(openChanges || 0) > 0}
              />
              <ActionCard
                href="/admin/suppliers/workers"
                title="Importmotor"
                count={queuesSafe.importQueued || 0}
                hint="Jobber og kø"
                hot={(queuesSafe.importQueued || 0) > 0}
              />
              <ActionCard
                href="/admin/orders"
                title="Order Automation"
                count={queuesSafe.ordersNeedAttention || 0}
                hint="Retry / feil / review"
                hot={(queuesSafe.ordersNeedAttention || 0) > 0}
              />
              <ActionCard
                href="/admin/suppliers/health"
                title="Ytelse / problemer"
                count={performanceProblems}
                hint="Kø & feil"
                hot={performanceProblems > 0}
              />
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-900">
              Snarveier til fordypning
            </h3>
            <div className="flex flex-wrap gap-2">
              <DeskChip href="/admin/autonomy" label="Autonomi" />
              <DeskChip href="/admin/buyer" label="Produktkjøper" />
              <DeskChip
                href="/admin/buyer#ai-mission-control"
                label="AI Mission Control"
              />
              <DeskChip href="/admin/trust" label="AI-tillit" />
              <DeskChip href="/admin/intelligence" label="Butikkinnsikt" />
              <DeskChip
                href="/admin/suppliers/merchandiser"
                label="Finn produkter"
                hot={(merchSummary?.suggested || 0) > 0}
              />
              <DeskChip href="/admin/suppliers/workers" label="Importmotor" />
              <DeskChip href="/admin/suppliers/health" label="Leverandørstatus" />
            </div>
          </section>
        </div>
      </details>
    </div>
  );
}

function MoneyTile({
  label,
  value,
  emphasize,
  good,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  good?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        emphasize
          ? good === false
            ? "border-red-200 bg-red-50"
            : "border-green-200 bg-green-50"
          : "border-slate-100 bg-white"
      }`}
    >
      <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function DeskChip({
  href,
  label,
  hot,
}: {
  href: string;
  label: string;
  hot?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
        hot
          ? "border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100"
          : "border-gray-300 bg-white text-gray-800 hover:bg-gray-50"
      }`}
    >
      {label}
    </Link>
  );
}

function ActionCard({
  href,
  title,
  count,
  hint,
  hot,
}: {
  href: string;
  title: string;
  count?: number;
  hint: string;
  hot?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-xl border p-3 transition hover:shadow-md ${
        hot ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"
      }`}
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </div>
      <div className="mt-1 text-2xl font-bold text-slate-900">
        {count != null ? count : "—"}
      </div>
      <div className="mt-1 text-xs text-slate-600">{hint}</div>
    </Link>
  );
}
