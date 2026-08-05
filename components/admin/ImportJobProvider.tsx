"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  IMPORT_JOB_STORAGE_KEY,
  emptyImportJob,
  type ImportJobSnapshot,
} from "@/lib/ops/import-job";

type ImportJobContextValue = {
  job: ImportJobSnapshot | null;
  startImportJob: (candidateIds: string[]) => void;
  dismissJob: () => void;
  setMinimized: (v: boolean) => void;
};

const ImportJobContext = createContext<ImportJobContextValue | null>(null);

function readStored(): ImportJobSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(IMPORT_JOB_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ImportJobSnapshot;
    if (!parsed?.id || !parsed.phase) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStored(job: ImportJobSnapshot | null) {
  if (typeof window === "undefined") return;
  try {
    if (!job || job.phase === "idle") {
      localStorage.removeItem(IMPORT_JOB_STORAGE_KEY);
      return;
    }
    localStorage.setItem(IMPORT_JOB_STORAGE_KEY, JSON.stringify(job));
  } catch {
    /* quota */
  }
}

export function ImportJobProvider({ children }: { children: ReactNode }) {
  const [job, setJob] = useState<ImportJobSnapshot | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const queueIdsRef = useRef<string[]>([]);
  const runningRef = useRef(false);

  const updateJob = useCallback(
    (patch: Partial<ImportJobSnapshot> | ((prev: ImportJobSnapshot) => ImportJobSnapshot)) => {
      setJob((prev) => {
        if (!prev && typeof patch === "function") return null;
        const base = prev || emptyImportJob();
        const next =
          typeof patch === "function"
            ? patch(base)
            : { ...base, ...patch, updatedAt: new Date().toISOString() };
        writeStored(next);
        return next;
      });
    },
    []
  );

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollProgress = useCallback(async () => {
    const ids = queueIdsRef.current;
    if (!ids.length) return false;
    try {
      const res = await fetch(
        `/api/admin/truth?scope=batch&ids=${encodeURIComponent(ids.join(","))}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok || !data.progress) return false;
      const p = data.progress as {
        done: number;
        queued: number;
        processing: number;
        importing?: number;
        aiAnalyzing?: number;
        review: number;
        approved: number;
        published: number;
        failed: number;
        readyForReview?: number;
        succeeded?: number;
        etaSeconds: number | null;
        complete: boolean;
        journeyStage?: ImportJobSnapshot["journeyStage"];
        failureReasons?: ImportJobSnapshot["failureReasons"];
      };
      const succeeded = p.succeeded ?? p.review + p.approved + p.published;
      const readyForReview = p.readyForReview ?? p.review + p.approved;
      updateJob((prev) => ({
        ...prev,
        phase: p.complete ? "done" : "processing",
        queued: p.queued,
        processing: p.processing,
        importing: p.importing ?? 0,
        aiAnalyzing: p.aiAnalyzing ?? 0,
        review: p.review,
        approved: p.approved,
        published: p.published,
        failed: p.failed,
        readyForReview,
        succeeded,
        done: p.done,
        etaSeconds: p.etaSeconds,
        journeyStage: p.complete ? "done" : p.journeyStage || "importing",
        failureReasons: p.failureReasons || [],
        updatedAt: new Date().toISOString(),
      }));
      return Boolean(p.complete);
    } catch {
      return false;
    }
  }, [updateJob]);

  const kickProcess = useCallback(async () => {
    try {
      await fetch("/api/admin/import-queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "process_all", limit: 25 }),
      });
    } catch {
      /* non-fatal */
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPoll();
    let ticks = 0;
    pollRef.current = setInterval(() => {
      void (async () => {
        if (
          typeof document !== "undefined" &&
          document.visibilityState !== "visible"
        ) {
          return;
        }
        ticks += 1;
        if (ticks % 3 === 0) await kickProcess();
        const done = await pollProgress();
        if (done) {
          stopPoll();
          runningRef.current = false;
        } else if (ticks > 180) {
          // ~6 min — leave widget in processing, admin can open queue
          stopPoll();
          runningRef.current = false;
          updateJob({
            error: "Import fortsetter i bakgrunnen. Åpne Importkø for status.",
          });
        }
      })();
    }, 4000);
  }, [kickProcess, pollProgress, stopPoll, updateJob]);

  // Hydrate from storage on mount; resume polling if still running
  useEffect(() => {
    const stored = readStored();
    if (!stored) return;
    setJob(stored);
    if (
      (stored.phase === "processing" || stored.phase === "queuing") &&
      stored.queueItemIds.length > 0
    ) {
      queueIdsRef.current = stored.queueItemIds;
      void kickProcess();
      startPolling();
    }
    return () => stopPoll();
  }, [kickProcess, startPolling, stopPoll]);

  const startImportJob = useCallback(
    (candidateIds: string[]) => {
      const ids = Array.from(new Set(candidateIds.filter(Boolean)));
      if (!ids.length || runningRef.current) return;

      runningRef.current = true;
      stopPoll();
      queueIdsRef.current = [];

      const job = emptyImportJob({
        phase: "queuing",
        totalTarget: ids.length,
        journeyStage: "queuing",
        minimized: false,
      });
      setJob(job);
      writeStored(job);

      void (async () => {
        const allQueueIds: string[] = [];
        let sent = 0;
        try {
          for (let i = 0; i < ids.length; i += 500) {
            const chunk = ids.slice(i, i + 500);
            const res = await fetch("/api/admin/buyer", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "import_ids", ids: chunk }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data?.ok) {
              throw new Error(data?.error || "Kunne ikke starte import");
            }
            const qids = Array.isArray(data.queueItemIds)
              ? (data.queueItemIds as string[])
              : [];
            allQueueIds.push(...qids);
            sent += Number(data.imported || qids.length);
            queueIdsRef.current = allQueueIds;
            updateJob({
              phase: "queuing",
              journeyStage: "queuing",
              sent,
              queued: allQueueIds.length,
              queueItemIds: [...allQueueIds],
            });
          }

          if (allQueueIds.length === 0) {
            updateJob({
              phase: "done",
              journeyStage: "done",
              sent,
              failed: ids.length,
              succeeded: 0,
              readyForReview: 0,
              failureReasons: [
                {
                  key: "no_queue",
                  label: "Ingen produkter ble lagt i importkø",
                  count: ids.length,
                  samples: [],
                },
              ],
            });
            runningRef.current = false;
            return;
          }

          updateJob({
            phase: "processing",
            journeyStage: "importing",
            sent,
            queued: allQueueIds.length,
            queueItemIds: [...allQueueIds],
          });
          await kickProcess();
          const complete = await pollProgress();
          if (!complete) startPolling();
          else runningRef.current = false;
        } catch (e: unknown) {
          runningRef.current = false;
          updateJob({
            phase: "error",
            journeyStage: "done",
            error: e instanceof Error ? e.message : "Import feilet",
          });
        }
      })();
    },
    [kickProcess, pollProgress, startPolling, stopPoll, updateJob]
  );

  const dismissJob = useCallback(() => {
    stopPoll();
    runningRef.current = false;
    queueIdsRef.current = [];
    setJob(null);
    writeStored(null);
  }, [stopPoll]);

  const setMinimized = useCallback(
    (v: boolean) => {
      updateJob({ minimized: v });
    },
    [updateJob]
  );

  const value = useMemo(
    () => ({ job, startImportJob, dismissJob, setMinimized }),
    [job, startImportJob, dismissJob, setMinimized]
  );

  return (
    <ImportJobContext.Provider value={value}>{children}</ImportJobContext.Provider>
  );
}

export function useImportJob() {
  const ctx = useContext(ImportJobContext);
  if (!ctx) {
    throw new Error("useImportJob must be used within ImportJobProvider");
  }
  return ctx;
}

/** Safe hook when provider may be missing (e.g. login). */
export function useImportJobOptional() {
  return useContext(ImportJobContext);
}
