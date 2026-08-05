import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/api-auth";
import {
  startBuyerScan,
  processBuyerScanBatch,
  getLatestBuyerScan,
  listBuyerRanking,
  listBuyerMissionHistory,
  importTopBuyerCandidates,
  importBuyerCandidatesByIds,
  findAlternativeSuppliers,
  listOpenAltOffers,
  decideAltOffer,
  refreshProductLifecycles,
  getLifecycleCounts,
  getBuyerReviewOverview,
  listBuyerReviewPage,
  listBuyerReviewIds,
  resolveBuyerSelectionIds,
  decideBuyerCandidates,
  pauseBuyerMission,
  resumeBuyerMission,
  stopBuyerMission,
  getLiveMissionSnapshot,
  CATEGORY_MISSIONS,
  MISSION_SIZE_OPTIONS,
  parseScanRequest,
  type BuyerReviewGroupId,
  type BuyerReviewSort,
} from "@/lib/buyer";
import { startCategoryMission } from "@/lib/improve";
import { getBuyerHuntWorkerStatus } from "@/lib/buyer/buyer-worker";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/utils/logger";
import { adminErrorResponse } from "@/lib/admin/api-error";
import {
  getAdminPreferenceRules,
  getPreferenceContext,
  recordBuyerThumb,
  saveAdminPreferenceRules,
  type DislikeReason,
} from "@/lib/buyer/admin-preferences";
import { approveAndPublishCandidates } from "@/lib/buyer/approve-and-publish";

function numParam(v: string | null): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(req.url);
    const view = url.searchParams.get("view");

    if (view === "overview") {
      const scanRunId = url.searchParams.get("scanRunId") || undefined;
      const sinceIso = url.searchParams.get("since") || undefined;
      const overview = await getBuyerReviewOverview({ scanRunId, sinceIso });
      return NextResponse.json({ ok: true, overview });
    }

    if (view === "page") {
      const scanRunId = url.searchParams.get("scanRunId") || undefined;
      const sinceIso = url.searchParams.get("since") || undefined;
      const page = await listBuyerReviewPage({
        scanRunId,
        sinceIso,
        page: numParam(url.searchParams.get("page")) || 1,
        pageSize: numParam(url.searchParams.get("pageSize")) || 100,
        group: (url.searchParams.get("group") || "all") as BuyerReviewGroupId,
        sort: (url.searchParams.get("sort") || "match") as BuyerReviewSort,
        q: url.searchParams.get("q") || undefined,
        minMatch: numParam(url.searchParams.get("minMatch")),
        minMargin: numParam(url.searchParams.get("minMargin")),
        minConfidence: numParam(url.searchParams.get("minConfidence")),
        minPrice: numParam(url.searchParams.get("minPrice")),
        maxPrice: numParam(url.searchParams.get("maxPrice")),
        supplier: url.searchParams.get("supplier") || undefined,
        premiumOnly: url.searchParams.get("premiumOnly") === "1",
        readyOnly: url.searchParams.get("readyOnly") === "1",
        hasVideo: url.searchParams.get("hasVideo") === "1",
        manyImages: url.searchParams.get("manyImages") === "1",
        hasAi: url.searchParams.get("hasAi") === "1",
      });
      const { getHuntThinking, getDiscoveryPlan } = await import(
        "@/lib/buyer/review-board"
      );
      const [huntThinking, discoveryPlan] = await Promise.all([
        getHuntThinking({
          scanRunId: page.scanRunId || scanRunId,
        }),
        getDiscoveryPlan({
          scanRunId: page.scanRunId || scanRunId,
        }),
      ]);
      return NextResponse.json({
        ok: true,
        page: {
          ...page,
          /** Alias for clients that expect totalItems */
          totalItems: page.total,
        },
        huntThinking,
        discoveryPlan,
      });
    }

    if (view === "ids") {
      const scanRunId = url.searchParams.get("scanRunId") || undefined;
      const sinceIso = url.searchParams.get("since") || undefined;
      const countOnly = url.searchParams.get("countOnly") === "1";
      const ids = await listBuyerReviewIds({
        scanRunId,
        sinceIso,
        group: (url.searchParams.get("group") || "all") as BuyerReviewGroupId,
        q: url.searchParams.get("q") || undefined,
        minMatch: numParam(url.searchParams.get("minMatch")),
        minMargin: numParam(url.searchParams.get("minMargin")),
        minConfidence: numParam(url.searchParams.get("minConfidence")),
        minPrice: numParam(url.searchParams.get("minPrice")),
        maxPrice: numParam(url.searchParams.get("maxPrice")),
        supplier: url.searchParams.get("supplier") || undefined,
        premiumOnly: url.searchParams.get("premiumOnly") === "1",
        readyOnly: url.searchParams.get("readyOnly") === "1",
        hasVideo: url.searchParams.get("hasVideo") === "1",
        manyImages: url.searchParams.get("manyImages") === "1",
        hasAi: url.searchParams.get("hasAi") === "1",
        limit: numParam(url.searchParams.get("limit")) || 5000,
        countOnly,
      });
      return NextResponse.json({ ok: true, ...ids });
    }

    if (view === "preferences") {
      const [rules, prefs] = await Promise.all([
        getAdminPreferenceRules(),
        getPreferenceContext(),
      ]);
      return NextResponse.json({
        ok: true,
        rules: rules.rules,
        updatedAt: rules.updatedAt,
        likesCount: prefs.likes.length,
        dislikesCount: prefs.dislikes.length,
      });
    }

    if (view === "assortment") {
      const {
        getAssortmentDashboard,
        getAssortmentStrategy,
      } = await import("@/lib/buyer/assortment-strategy");
      const [dashboard, strategy] = await Promise.all([
        getAssortmentDashboard(),
        getAssortmentStrategy(),
      ]);
      return NextResponse.json({
        ok: true,
        dashboard,
        targets: strategy.targets,
        updatedAt: strategy.updatedAt,
      });
    }

    if (view === "product_focus") {
      const { getProductFocusDashboard } = await import(
        "@/lib/buyer/product-focus"
      );
      const dashboard = await getProductFocusDashboard();
      return NextResponse.json({ ok: true, dashboard });
    }

    if (view === "mission_control") {
      const { getMissionControlSnapshot } = await import(
        "@/lib/buyer/mission-control"
      );
      const missionControl = await getMissionControlSnapshot();
      return NextResponse.json({ ok: true, missionControl });
    }

    if (view === "publish_job") {
      const { getBuyerPublishJob } = await import("@/lib/buyer/publish-job");
      // Read-only — worker drains batches (no client drain)
      const kindParam = url.searchParams.get("kind");
      const kind =
        kindParam === "republish" ? ("republish" as const) : ("publish" as const);
      const job = await getBuyerPublishJob(kind);
      let workerHeartbeat: string | null = null;
      let workerStatus: string | null = null;
      try {
        const { getBuyerHuntWorkerStatus } = await import(
          "@/lib/buyer/buyer-worker"
        );
        const w = await getBuyerHuntWorkerStatus();
        workerHeartbeat = w.lastTickAt;
        workerStatus = w.status;
      } catch {
        /* optional */
      }
      return NextResponse.json({
        ok: true,
        job,
        workerHeartbeat,
        workerStatus,
      });
    }

    if (view === "republish_board") {
      const { getRepublishBoard, getBuyerRepublishJob } = await import(
        "@/lib/buyer/republish"
      );
      const status = url.searchParams.get("status") || "ready";
      const gateReason = url.searchParams.get("gateReason") || undefined;
      const limit = Number(url.searchParams.get("limit") || 25);
      const offset = Number(url.searchParams.get("offset") || 0);
      const q = url.searchParams.get("q") || undefined;
      const group = url.searchParams.get("group") || undefined;
      const category = url.searchParams.get("category") || undefined;
      const supplier = url.searchParams.get("supplier") || undefined;
      const board = await getRepublishBoard({
        status: status as
          | "all"
          | "ready"
          | "fail_gate"
          | "published"
          | "fail_margin"
          | "fail_freight"
          | "fail_pricing"
          | "fail_quality",
        gateReason: gateReason as
          | import("@/lib/buyer/republish").RepublishGateReason
          | "all"
          | undefined,
        limit,
        offset,
        q,
        group,
        category,
        supplier,
      });
      const job = await getBuyerRepublishJob();
      let workerHeartbeat: string | null = null;
      let workerStatus: string | null = null;
      try {
        const { getBuyerHuntWorkerStatus } = await import(
          "@/lib/buyer/buyer-worker"
        );
        const w = await getBuyerHuntWorkerStatus();
        workerHeartbeat = w.lastTickAt;
        workerStatus = w.status;
      } catch {
        /* optional */
      }
      return NextResponse.json({
        ok: true,
        summary: board.summary,
        rows: board.rows,
        readyIds: board.readyIds,
        filteredTotal: board.filteredTotal,
        filterOptions: board.filterOptions,
        job,
        workerHeartbeat,
        workerStatus,
      });
    }

    if (view === "desk_status") {
      const { getDigitalBuyerDeskStatus } = await import(
        "@/lib/buyer/desk-status"
      );
      const status = await getDigitalBuyerDeskStatus();
      return NextResponse.json({ ok: true, status });
    }

    if (view === "live") {
      const scanRunId = url.searchParams.get("scanRunId") || undefined;
      const snap = await getLiveMissionSnapshot({ scanRunId });
      const prefs = await getPreferenceContext();
      const { toBuyerCard } = await import("@/lib/ops/desk-buyer-groups");
      let productFocus: {
        starsByFamily: Record<string, number>;
        customFamilies: import("@/lib/buyer/product-focus-core").CustomFocusFamily[];
      } | null = null;
      try {
        const { getProductFocus, starsMap } = await import(
          "@/lib/buyer/product-focus"
        );
        const focus = await getProductFocus();
        productFocus = {
          starsByFamily: starsMap(focus),
          customFamilies: focus.customFamilies,
        };
      } catch {
        /* optional */
      }
      let aiMemory: import("@/lib/buyer/ai-memory").AiMemorySnapshot | null =
        null;
      let storeDna: import("@/lib/buyer/store-dna").StoreDnaSnapshot | null =
        null;
      let aiFeedback: import("@/lib/buyer/ai-feedback").AiFeedbackSnapshot | null =
        null;
      try {
        const { getAiMemory } = await import("@/lib/buyer/ai-memory");
        aiMemory = await getAiMemory();
      } catch {
        /* optional */
      }
      try {
        const { getStoreDna } = await import("@/lib/buyer/store-dna");
        storeDna = await getStoreDna();
      } catch {
        /* optional */
      }
      try {
        const { getAiFeedback } = await import("@/lib/buyer/ai-feedback");
        aiFeedback = await getAiFeedback();
      } catch {
        /* optional */
      }
      const toCard = (row: (typeof snap.candidates)[number]) => {
        try {
          return toBuyerCard(
            {
              id: row.id,
              title: row.title,
              imageUrl: row.imageUrl,
              supplier: row.supplier,
              supplierPrice: row.supplierPrice,
              overallScore: row.overallScore,
              shopMatchPct: row.shopMatchPct,
              shopMatchWhy: row.shopMatchWhy,
              discoveryTags: row.discoveryTags,
              risks: row.risks,
              reasons: row.reasons,
              pricing: row.pricing,
              scores: row.scores,
              snapshot: row.snapshot,
              merchandiserRecId: row.merchandiserRecId,
              rank: row.rank,
              createdAt: row.createdAt,
              fingerprint:
                "fingerprint" in row
                  ? (row as { fingerprint?: string | null }).fingerprint
                  : null,
            },
            { prefs, productFocus, aiMemory, storeDna, aiFeedback }
          );
        } catch {
          return null;
        }
      };
      return NextResponse.json({
        ok: true,
        scan: snap.scan,
        progress: snap.progress || null,
        result: snap.result || null,
        huntReport: snap.huntReport || null,
        discoveryValidation: (() => {
          const req =
            snap.scan?.request && typeof snap.scan.request === "object"
              ? (snap.scan.request as Record<string, unknown>)
              : null;
          return req?.discoveryValidation || null;
        })(),
        metrics: snap.metrics,
        worker: snap.worker,
        rejectBreakdown: snap.rejectBreakdown,
        candidates: snap.candidates.map(toCard).filter(Boolean),
        topFinds: snap.topFinds.map(toCard).filter(Boolean),
      });
    }

    const scan = await getLatestBuyerScan();
    const parsed = parseScanRequest(scan?.request);

    // Dashboard is read-only for processing — Buyer Hunt Worker drains the queue.
    const worker = await getBuyerHuntWorkerStatus().catch(() => null);

    const fresh = await getLatestBuyerScan();
    const freshParsed = parseScanRequest(fresh?.request);

    const [ranking, alts, lifecycle, openAltsCount, rankedCount, history] =
      await Promise.all([
        listBuyerRanking({ limit: 120, scanRunId: fresh?.id || scan?.id || null }),
        listOpenAltOffers(20),
        getLifecycleCounts(),
        prisma.buyerAltOffer.count({ where: { status: "open" } }),
        prisma.buyerCandidate.count({
          where: {
            status: "ranked",
            isBestInGroup: true,
            ...(fresh?.id || scan?.id ? { scanRunId: fresh?.id || scan?.id } : {}),
          },
        }),
        listBuyerMissionHistory({ limit: 20 }),
      ]);

    const cp =
      fresh?.checkpoint && typeof fresh.checkpoint === "object"
        ? (fresh.checkpoint as {
            page?: number;
            seedIdx?: number;
            supplierIdx?: number;
          })
        : {};

    return NextResponse.json({
      ok: true,
      scan: fresh,
      ranking,
      alts,
      lifecycle,
      history,
      missionSizes: MISSION_SIZE_OPTIONS,
      missions: CATEGORY_MISSIONS.map((m) => ({
        id: m.id,
        emoji: m.emoji,
        label: m.label,
        brief: m.brief,
        subcategories: m.subcategories,
      })),
      progress: freshParsed.progress || parsed.progress || null,
      result: freshParsed.result || parsed.result || null,
      huntReport: freshParsed.huntReport || parsed.huntReport || null,
      discoveryValidation:
        (fresh?.request &&
        typeof fresh.request === "object" &&
        (fresh.request as Record<string, unknown>).discoveryValidation) ||
        (scan?.request &&
        typeof scan.request === "object" &&
        (scan.request as Record<string, unknown>).discoveryValidation) ||
        null,
      stats: { openAltsCount, rankedCount },
      worker,
      ops: {
        scanId: fresh?.id || null,
        workerId: worker?.lastActiveWorker || null,
        productsPerMin: worker?.productsPerMin ?? null,
        queue: {
          pending: worker?.pendingJobs ?? 0,
          claimed: worker?.claimedJobs ?? 0,
          jobsPerMinute: worker?.jobsPerMinute ?? 0,
          avgWaitMs: worker?.avgWaitMs ?? null,
          avgRuntimeMs: worker?.avgRuntimeMs ?? null,
        },
        checkpoint: {
          page: cp.page ?? null,
          seedIdx: cp.seedIdx ?? null,
          supplierIdx: cp.supplierIdx ?? null,
        },
        scanned: fresh?.scanned ?? 0,
        kept: fresh?.kept ?? 0,
        filtered: fresh?.filtered ?? 0,
        target: fresh?.targetScanCount ?? 0,
        targetKept: (() => {
          const req =
            fresh?.request && typeof fresh.request === "object"
              ? (fresh.request as Record<string, unknown>)
              : scan?.request && typeof scan.request === "object"
                ? (scan.request as Record<string, unknown>)
                : {};
          const n = Number(req.targetKeptCount);
          return Number.isFinite(n) && n > 0 ? n : null;
        })(),
      },
    });
  } catch (error) {
    logError(error, "[buyer:GET]");
    return adminErrorResponse(error, 500, "buyer:GET");
  }
}

const missionSizeSchema = z.enum(["quick", "standard", "deep", "night"]);

const quantitySchema = z.union([
  missionSizeSchema,
  z.literal(10),
  z.literal(25),
  z.literal(50),
  z.literal(100),
  z.literal(500),
  z.literal("ai"),
]);

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start_scan"),
    targetScanCount: z.union([
      z.literal(10),
      z.literal(25),
      z.literal(50),
      z.literal(100),
      z.literal(500),
      z.literal(1000),
      z.literal(10000),
      z.literal(100000),
      z.literal(1000000),
    ]),
    missionSize: missionSizeSchema.optional(),
    processInline: z.boolean().optional(),
    categoryId: z.string().optional(),
  }),
  z.object({
    action: z.literal("start_product_hunt"),
    /** Desired number of GOOD ranked candidates */
    targetKept: z.number().min(10).max(50_000),
    processInline: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("start_mission"),
    categoryId: z.string(),
    missionSize: missionSizeSchema.optional(),
    quantityChoice: quantitySchema.optional(),
    processInline: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("process_batch"),
    scanRunId: z.string().optional(),
  }),
  z.object({
    action: z.literal("drain_workers"),
  }),
  z.object({
    action: z.literal("pause_mission"),
    scanRunId: z.string().optional(),
  }),
  z.object({
    action: z.literal("resume_mission"),
    scanRunId: z.string().optional(),
  }),
  z.object({
    action: z.literal("stop_mission"),
    scanRunId: z.string().optional(),
    reason: z.string().max(200).optional(),
  }),
  z.object({
    action: z.literal("import_top"),
    limit: z.number().min(1).max(500),
  }),
  z.object({
    action: z.literal("import_ids"),
    ids: z.array(z.string()).min(1).max(500),
  }),
  z.object({
    action: z.literal("review_decide"),
    ids: z.array(z.string()).min(1).max(500),
    decision: z.enum(["dismissed", "rejected", "ranked"]),
  }),
  z.object({
    action: z.literal("find_alts"),
  }),
  z.object({
    action: z.literal("decide_alt"),
    id: z.string(),
    decision: z.enum(["accepted", "dismissed"]),
  }),
  z.object({
    action: z.literal("refresh_lifecycle"),
  }),
  z.object({
    action: z.literal("feedback_thumb"),
    id: z.string().min(1),
    vote: z.enum(["up", "down"]),
    reasons: z
      .array(
        z.enum([
          "feil_kategori",
          "darlig_margin",
          "for_dyr",
          "lang_levering",
          "darlig_produkt",
          "ser_billig_ut",
          "passer_ikke",
          "annet",
        ])
      )
      .optional(),
  }),
  z.object({
    action: z.literal("save_preference_rules"),
    rules: z.array(z.string().max(300)).max(40),
  }),
  z.object({
    action: z.literal("save_assortment_strategy"),
    targets: z
      .array(
        z.object({
          familyId: z.string().min(1).max(80),
          label: z.string().max(120).optional(),
          /** @deprecated Prefer sharePct — still accepted for legacy clients */
          target: z.number().min(1).max(500).optional(),
          sharePct: z.number().min(0.1).max(30).optional(),
          minCount: z.number().min(1).max(100).optional(),
          softMaxRatio: z.number().min(1.05).max(3).optional(),
          hardMaxRatio: z.number().min(1.1).max(4).optional(),
          enabled: z.boolean().optional(),
        })
      )
      .max(80),
    missionId: z
      .enum(["none", "best_gaming", "komplett_like", "home_office"])
      .optional(),
    missionRemaining: z.number().min(0).max(5000).optional(),
  }),
  z.object({
    action: z.literal("save_product_focus"),
    entries: z
      .array(
        z.object({
          familyId: z.string().min(1).max(80),
          stars: z.number().min(0).max(5),
        })
      )
      .max(200)
      .optional(),
    huntStrategy: z.string().max(8000).optional(),
    addCustom: z
      .object({
        label: z.string().min(1).max(80),
        groupId: z.string().max(40).optional(),
        keywords: z.array(z.string().max(60)).max(20).optional(),
        stars: z.number().min(0).max(5).optional(),
      })
      .optional(),
    dismissSuggestion: z.string().max(80).optional(),
    acceptSuggestion: z.string().max(80).optional(),
    reduceFocus: z
      .object({
        familyId: z.string().min(1).max(80),
        stars: z.number().min(0).max(5).optional(),
      })
      .optional(),
  }),
  z.object({
    action: z.literal("prepare_for_store"),
    ids: z.array(z.string()).min(1).max(500),
  }),
  z.object({
    action: z.literal("approve_and_publish"),
    ids: z.array(z.string()).max(500).optional(),
    dryRun: z.boolean().optional(),
    thumbUp: z.boolean().optional(),
    /** Server-side select-all: filters + exclusions (avoids shipping thousands of ids). */
    selection: z
      .object({
        group: z.string().optional(),
        q: z.string().optional(),
        minMatch: z.number().optional(),
        minMargin: z.number().optional(),
        excludeIds: z.array(z.string()).max(10_000).optional(),
        /** Max to process this request (batched). */
        limit: z.number().min(1).max(200).optional(),
      })
      .optional(),
  }),
  z.object({
    action: z.literal("start_publish_job"),
    ids: z.array(z.string()).max(50_000).optional(),
    thumbUp: z.boolean().optional(),
    batchSize: z.number().min(5).max(100).optional(),
    selection: z
      .object({
        group: z.string().optional(),
        q: z.string().optional(),
        minMatch: z.number().optional(),
        minMargin: z.number().optional(),
        excludeIds: z.array(z.string()).max(10_000).optional(),
      })
      .optional(),
  }),
  z.object({
    action: z.literal("tick_publish_job"),
    batchSize: z.number().min(5).max(100).optional(),
  }),
  z.object({
    action: z.literal("resume_publish_job"),
  }),
  z.object({
    action: z.literal("dismiss_publish_job"),
  }),
  z.object({
    action: z.literal("start_republish_job"),
    ids: z.array(z.string()).max(50_000).optional(),
    batchSize: z.number().min(5).max(100).optional(),
    fillMissingPricing: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("fill_republish_pricing"),
    limit: z.number().min(1).max(5_000).optional(),
  }),
  z.object({
    action: z.literal("resume_republish_job"),
  }),
  z.object({
    action: z.literal("dismiss_republish_job"),
  }),
]);

export async function POST(req: Request) {
  const auth = await requireAdminSession();
  if (!auth.ok) return auth.response;

  try {
    const body = postSchema.parse(await req.json());

    if (body.action === "start_mission") {
      const started = await startCategoryMission({
        categoryId: body.categoryId,
        missionSize: body.missionSize,
        quantityChoice: body.quantityChoice ?? body.missionSize ?? "standard",
        processInline: body.processInline ?? false,
      });
      // Enqueue only — Buyer Hunt Worker claims pending batches.
      const scan = await getLatestBuyerScan();
      const ranking = await listBuyerRanking({
        limit: 120,
        scanRunId: started.scanId,
      });
      return NextResponse.json({ ok: true, ...started, scan, ranking });
    }

    if (body.action === "start_product_hunt") {
      const targetKept = Math.round(body.targetKept);
      const scan = await startBuyerScan({
        targetKeptCount: targetKept,
        processInline: body.processInline ?? targetKept <= 25,
        startedBy: "product_hunt",
      });
      return NextResponse.json({
        ok: true,
        scan,
        targetKept,
        message: `Leter etter opptil ${targetKept.toLocaleString("no-NO")} gode kandidater`,
      });
    }

    if (body.action === "start_scan") {
      const scan = await startBuyerScan({
        targetScanCount: body.targetScanCount,
        categoryId: body.categoryId,
        missionSize: body.missionSize,
        processInline: body.processInline ?? true,
      });
      return NextResponse.json({ ok: true, scan });
    }

    if (body.action === "process_batch") {
      const scanRunId =
        body.scanRunId ||
        (await getLatestBuyerScan())?.id ||
        null;
      if (!scanRunId) {
        return NextResponse.json(
          { ok: false, error: "Ingen aktiv scan" },
          { status: 400 }
        );
      }
      const result = await processBuyerScanBatch(scanRunId);
      return NextResponse.json({ ok: true, result });
    }

    if (body.action === "drain_workers") {
      // Escape hatch only — normal hunts are drained by Buyer Hunt Worker.
      const { tickBuyerHuntWorker } = await import("@/lib/buyer/buyer-worker");
      const latest = await getLatestBuyerScan();
      const result = await tickBuyerHuntWorker({
        limit: 15,
        preferScanRunId: latest?.status === "running" ? latest.id : null,
      });
      return NextResponse.json({ ok: true, result });
    }

    if (body.action === "pause_mission") {
      const result = await pauseBuyerMission({ scanRunId: body.scanRunId });
      const scan = await getLatestBuyerScan();
      return NextResponse.json({ ok: true, ...result, scan });
    }

    if (body.action === "resume_mission") {
      const result = await resumeBuyerMission({ scanRunId: body.scanRunId });
      const scan = await getLatestBuyerScan();
      return NextResponse.json({ ok: true, ...result, scan });
    }

    if (body.action === "stop_mission") {
      const result = await stopBuyerMission({
        scanRunId: body.scanRunId,
        reason: body.reason,
      });
      const scan = await getLatestBuyerScan();
      return NextResponse.json({ ok: true, ...result, scan });
    }

    if (body.action === "import_top") {
      const result = await importTopBuyerCandidates({
        limit: body.limit,
        actorEmail: auth.email,
      });
      return NextResponse.json({
        ok: true,
        imported: result.imported,
        queueItemIds: result.queueItemIds || [],
        results: result.results,
      });
    }

    if (body.action === "import_ids") {
      const result = await importBuyerCandidatesByIds({
        ids: body.ids,
        actorEmail: auth.email,
      });
      return NextResponse.json({
        ok: true,
        imported: result.imported,
        queueItemIds: result.queueItemIds || [],
        results: result.results,
      });
    }

    if (body.action === "review_decide") {
      const result = await decideBuyerCandidates({
        ids: body.ids,
        decision: body.decision,
      });
      return NextResponse.json({ ok: true, updated: result.updated });
    }

    if (body.action === "find_alts") {
      const result = await findAlternativeSuppliers({ limitProducts: 20 });
      const alts = await listOpenAltOffers(20);
      return NextResponse.json({ ok: true, ...result, alts });
    }

    if (body.action === "decide_alt") {
      const row = await decideAltOffer({
        id: body.id,
        decision: body.decision,
      });
      return NextResponse.json({ ok: true, offer: row });
    }

    if (body.action === "refresh_lifecycle") {
      const lifecycle = await refreshProductLifecycles();
      return NextResponse.json({ ok: true, lifecycle });
    }

    if (body.action === "feedback_thumb") {
      const result = await recordBuyerThumb({
        candidateId: body.id,
        vote: body.vote,
        reasons: body.reasons as DislikeReason[] | undefined,
        actorEmail: auth.email,
      });
      if (body.vote === "down") {
        try {
          const row = await prisma.buyerCandidate.findUnique({
            where: { id: body.id },
            select: { title: true },
          });
          if (row?.title) {
            const { recordFocusIgnores } = await import(
              "@/lib/buyer/product-focus"
            );
            await recordFocusIgnores([row.title]);
          }
        } catch {
          /* optional */
        }
      }
      return NextResponse.json({
        ok: true,
        explanation: result.explanation,
      });
    }

    if (body.action === "save_preference_rules") {
      const saved = await saveAdminPreferenceRules({
        rules: body.rules,
        actorEmail: auth.email,
      });
      return NextResponse.json({ ok: true, ...saved });
    }

    if (body.action === "save_assortment_strategy") {
      const { saveAssortmentStrategy } = await import(
        "@/lib/buyer/assortment-strategy"
      );
      const saved = await saveAssortmentStrategy({
        targets: body.targets.map((t) => ({
          familyId: t.familyId,
          label: t.label || t.familyId,
          sharePct: t.sharePct,
          target: t.target,
          minCount: t.minCount,
          softMaxRatio: t.softMaxRatio,
          hardMaxRatio: t.hardMaxRatio,
          enabled: t.enabled !== false,
        })),
        missionId: body.missionId,
        missionRemaining: body.missionRemaining,
      });
      return NextResponse.json({
        ok: true,
        updatedAt: saved.updatedAt,
        targets: saved.targets,
        mission: saved.mission,
      });
    }

    if (body.action === "save_product_focus") {
      const { saveProductFocus, getProductFocusDashboard } = await import(
        "@/lib/buyer/product-focus"
      );
      await saveProductFocus({
        entries: body.entries?.map((e) => ({
          familyId: e.familyId,
          stars: e.stars as 0 | 1 | 2 | 3 | 4 | 5,
        })),
        huntStrategy: body.huntStrategy,
        addCustom: body.addCustom
          ? {
              label: body.addCustom.label,
              groupId: body.addCustom.groupId,
              keywords: body.addCustom.keywords,
              stars: body.addCustom.stars as 0 | 1 | 2 | 3 | 4 | 5 | undefined,
            }
          : undefined,
        dismissSuggestion: body.dismissSuggestion,
        acceptSuggestion: body.acceptSuggestion,
        reduceFocus: body.reduceFocus
          ? {
              familyId: body.reduceFocus.familyId,
              stars: body.reduceFocus.stars as 0 | 1 | 2 | 3 | 4 | 5 | undefined,
            }
          : undefined,
      });
      const dashboard = await getProductFocusDashboard();
      return NextResponse.json({ ok: true, dashboard });
    }

    if (body.action === "prepare_for_store") {
      // Legacy alias — normal flow uses approve_and_publish
      const result = await approveAndPublishCandidates({
        ids: body.ids,
        dryRun: false,
        thumbUp: false,
        actorEmail: auth.email,
      });
      return NextResponse.json({
        ok: true,
        ...result,
        prepared: result.published + result.needsControl,
        ready: result.published,
        needsReview: result.needsControl,
        message: result.summary,
      });
    }

    if (body.action === "approve_and_publish") {
      let ids = body.ids || [];
      let selectedTotal = ids.length;
      let remaining = 0;
      if (body.selection) {
        const resolved = await resolveBuyerSelectionIds({
          group: body.selection.group,
          q: body.selection.q,
          minMatch: body.selection.minMatch,
          minMargin: body.selection.minMargin,
          excludeIds: body.selection.excludeIds,
          limit: body.selection.limit || 100,
        });
        ids = resolved.ids;
        selectedTotal = resolved.selectedTotal;
        remaining = Math.max(0, selectedTotal - ids.length);
      }
      if (!ids.length) {
        return NextResponse.json(
          { ok: false, error: "Ingen produkter valgt" },
          { status: 400 }
        );
      }
      const result = await approveAndPublishCandidates({
        ids,
        dryRun: body.dryRun === true,
        thumbUp: body.thumbUp !== false,
        actorEmail: auth.email,
        limit: ids.length,
      });
      if (!result.dryRun && result.published > 0) {
        const { tickAssortmentMission } = await import(
          "@/lib/buyer/assortment-strategy"
        );
        await tickAssortmentMission(result.published).catch(() => undefined);
        try {
          const { recordFocusPublishes } = await import(
            "@/lib/buyer/product-focus"
          );
          const titles = (result.outcomes || [])
            .filter((o: { status?: string }) => o.status === "published")
            .map((o: { title?: string }) => o.title || "")
            .filter(Boolean);
          if (titles.length) {
            await recordFocusPublishes(titles);
          }
        } catch {
          /* optional */
        }
      }
      const summary =
        remaining > 0
          ? `${result.summary} · ${remaining.toLocaleString("no-NO")} gjenstår i utvalget`
          : result.summary;
      return NextResponse.json({
        ok: true,
        dryRun: result.dryRun,
        published: result.published,
        needsControl: result.needsControl,
        failed: result.failed,
        outcomes: result.outcomes,
        summary,
        message: summary,
        selectedTotal,
        processed: ids.length,
        remaining,
      });
    }

    if (body.action === "start_publish_job") {
      const { startBuyerPublishJob } = await import("@/lib/buyer/publish-job");
      try {
        const job = await startBuyerPublishJob({
          ids: body.ids,
          selection: body.selection,
          thumbUp: body.thumbUp !== false,
          batchSize: body.batchSize,
          actorEmail: auth.email,
        });
        if (!job?.id) {
          return NextResponse.json(
            {
              ok: false,
              error: "Kunne ikke starte publisering. Prøv igjen.",
            },
            { status: 500 }
          );
        }
        return NextResponse.json({
          ok: true,
          job,
          jobId: job.id,
          message: `Publiseringsjobb ${job.id} opprettet — ${job.total.toLocaleString("no-NO")} produkter`,
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Kunne ikke starte publisering";
        return NextResponse.json(
          {
            ok: false,
            error: message.includes("Kunne ikke")
              ? message
              : `Kunne ikke starte publisering. ${message}`,
          },
          { status: 500 }
        );
      }
    }

    if (body.action === "tick_publish_job") {
      // Escape hatch — normal path is Buyer Hunt Worker
      const { tickBuyerPublishJob } = await import("@/lib/buyer/publish-job");
      const job = await tickBuyerPublishJob({ batchSize: body.batchSize });
      return NextResponse.json({ ok: true, job });
    }

    if (body.action === "resume_publish_job") {
      const { resumeBuyerPublishJob } = await import("@/lib/buyer/publish-job");
      const job = await resumeBuyerPublishJob();
      if (!job) {
        return NextResponse.json(
          { ok: false, error: "Ingen aktiv publiseringsjobb" },
          { status: 404 }
        );
      }
      return NextResponse.json({ ok: true, job, jobId: job.id });
    }

    if (body.action === "dismiss_publish_job") {
      const { dismissBuyerPublishJob } = await import("@/lib/buyer/publish-job");
      await dismissBuyerPublishJob("publish");
      return NextResponse.json({ ok: true });
    }

    if (body.action === "fill_republish_pricing") {
      const { fillMissingCandidatePricing } = await import(
        "@/lib/buyer/republish"
      );
      const result = await fillMissingCandidatePricing({
        limit: body.limit,
      });
      return NextResponse.json({
        ok: true,
        ...result,
        message: `Oppdaterte pricing på ${result.updated.toLocaleString("no-NO")} kandidater`,
      });
    }

    if (body.action === "start_republish_job") {
      const { startBuyerRepublishJob } = await import("@/lib/buyer/republish");
      try {
        const result = await startBuyerRepublishJob({
          ids: body.ids,
          batchSize: body.batchSize,
          fillMissingPricing: body.fillMissingPricing !== false,
          actorEmail: auth.email,
        });
        return NextResponse.json({
          ok: true,
          job: result.job,
          jobId: result.job.id,
          summary: result.summary,
          selected: result.selected,
          message: `Republiseringsjobb ${result.job.id} — ${result.selected.toLocaleString("no-NO")} kandidater`,
        });
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Kunne ikke starte republisering";
        return NextResponse.json({ ok: false, error: message }, { status: 500 });
      }
    }

    if (body.action === "resume_republish_job") {
      const { resumeBuyerPublishJob } = await import("@/lib/buyer/publish-job");
      const job = await resumeBuyerPublishJob("republish");
      if (!job) {
        return NextResponse.json(
          { ok: false, error: "Ingen aktiv republiseringsjobb" },
          { status: 404 }
        );
      }
      return NextResponse.json({ ok: true, job, jobId: job.id });
    }

    if (body.action === "dismiss_republish_job") {
      const { dismissBuyerPublishJob } = await import("@/lib/buyer/publish-job");
      await dismissBuyerPublishJob("republish");
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: "Ukjent action" }, { status: 400 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Ugyldig forespørsel" }, { status: 400 });
    }
    logError(error, "[buyer:POST]");
    return adminErrorResponse(error, 500, "buyer:POST");
  }
}
