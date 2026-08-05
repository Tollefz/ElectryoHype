/**
 * Activity feed for Rob's Desk — Slack/GitHub-style story of what AI did.
 */

export type DeskFeedItem = {
  id: string;
  at: string; // ISO
  timeLabel: string;
  text: string;
  tone: "neutral" | "good" | "wait" | "warn";
};

function timeLabel(d: Date): string {
  return d.toLocaleTimeString("no-NO", { hour: "2-digit", minute: "2-digit" });
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

export type DeskFeedInput = {
  autonomyRuns?: Array<{
    id: string;
    finishedAt: Date | string | null;
    startedAt?: Date | string | null;
    summary: unknown;
    morningBrief?: string | null;
  }> | null;
  buyerScans?: Array<{
    id: string;
    createdAt?: Date | string | null;
    finishedAt: Date | string | null;
    scanned: number;
    kept: number;
    filtered: number;
    status: string;
  }> | null;
  decisions?: Array<{
    id: string;
    createdAt: Date | string;
    stage: string;
    action: string;
    subjectKey?: string;
  }> | null;
  improvements?: Array<{
    id: string;
    createdAt: Date | string;
    title: string;
    status: string;
  }> | null;
};

export function buildDeskAiFeed(input: DeskFeedInput | null | undefined): DeskFeedItem[] {
  const items: DeskFeedItem[] = [];
  const src = input || {};

  for (const run of src.autonomyRuns || []) {
    try {
      const s = asRecord(run.summary);
      const at = new Date(run.finishedAt || run.startedAt || Date.now());
      if (num(s.productsAnalyzed) > 0) {
        items.push({
          id: `${run.id}-analyzed`,
          at: at.toISOString(),
          timeLabel: timeLabel(at),
          text: `Analyserte ${num(s.productsAnalyzed).toLocaleString("no-NO")} produkter.`,
          tone: "neutral",
        });
      }
      if (num(s.newCandidatesFound) > 0 || num(s.fittedProfile) > 0) {
        const n = num(s.newCandidatesFound) || num(s.fittedProfile);
        items.push({
          id: `${run.id}-found`,
          at: at.toISOString(),
          timeLabel: timeLabel(new Date(at.getTime() + 60_000)),
          text: `Fant ${n.toLocaleString("no-NO")} kandidater.`,
          tone: "good",
        });
      }
      if (num(s.imported) > 0) {
        items.push({
          id: `${run.id}-imported`,
          at: at.toISOString(),
          timeLabel: timeLabel(new Date(at.getTime() + 120_000)),
          text: `Importerte ${num(s.imported)} til kø.`,
          tone: "good",
        });
      }
      if (num(s.passedQualityGate) > 0) {
        items.push({
          id: `${run.id}-qg`,
          at: at.toISOString(),
          timeLabel: timeLabel(new Date(at.getTime() + 180_000)),
          text: `${num(s.passedQualityGate)} bestod Quality Gate.`,
          tone: "good",
        });
      }
      if (num(s.needsApproval) > 0 || num(s.pendingApproval) > 0) {
        items.push({
          id: `${run.id}-wait`,
          at: at.toISOString(),
          timeLabel: timeLabel(new Date(at.getTime() + 240_000)),
          text: `Venter på deg — ${num(s.needsApproval) || num(s.pendingApproval)} godkjenninger.`,
          tone: "wait",
        });
      }
    } catch {
      /* skip */
    }
  }

  for (const scan of src.buyerScans || []) {
    try {
      const at = new Date(scan.finishedAt || scan.createdAt || Date.now());
      if (scan.scanned > 0) {
        items.push({
          id: `${scan.id}-scan`,
          at: at.toISOString(),
          timeLabel: timeLabel(at),
          text: `Jeg analyserte ${scan.scanned.toLocaleString("no-NO")} produkter.`,
          tone: "neutral",
        });
      }
      if (scan.filtered > 0) {
        items.push({
          id: `${scan.id}-filter`,
          at: at.toISOString(),
          timeLabel: timeLabel(new Date(at.getTime() + 90_000)),
          text: `Jeg forkastet ${scan.filtered.toLocaleString("no-NO")}.`,
          tone: "neutral",
        });
      }
      if (scan.kept > 0) {
        items.push({
          id: `${scan.id}-kept`,
          at: at.toISOString(),
          timeLabel: timeLabel(new Date(at.getTime() + 150_000)),
          text: `Jeg fant ${scan.kept.toLocaleString("no-NO")} kandidater.`,
          tone: "good",
        });
      }
      if (scan.status === "running" || scan.status === "queued") {
        items.push({
          id: `${scan.id}-running`,
          at: at.toISOString(),
          timeLabel: timeLabel(at),
          text: "Digital Buyer scanner fortsatt.",
          tone: "wait",
        });
      }
      if (scan.status === "paused") {
        items.push({
          id: `${scan.id}-paused`,
          at: at.toISOString(),
          timeLabel: timeLabel(at),
          text: "Night Mission pauset — fortsetter neste natt.",
          tone: "wait",
        });
      }
    } catch {
      /* skip */
    }
  }

  for (const d of src.decisions || []) {
    try {
      const at = new Date(d.createdAt);
      let text = `${d.stage}: ${d.action}`;
      let tone: DeskFeedItem["tone"] = "neutral";
      if (/supplier|leverandør/i.test(d.action) || /alt/i.test(d.stage)) {
        text = "Fant bedre leverandør — byttet ikke automatisk.";
        tone = "wait";
      } else if (/reject|filter|skip/i.test(d.action)) {
        text = `Forkastet kandidat (${d.stage}).`;
      } else if (/import|queue/i.test(d.action)) {
        text = "La produkt i importkø.";
        tone = "good";
      }
      items.push({
        id: d.id,
        at: at.toISOString(),
        timeLabel: timeLabel(at),
        text,
        tone,
      });
    } catch {
      /* skip */
    }
  }

  for (const imp of src.improvements || []) {
    try {
      const at = new Date(imp.createdAt);
      items.push({
        id: imp.id,
        at: at.toISOString(),
        timeLabel: timeLabel(at),
        text:
          imp.status === "pending"
            ? `Forslag venter: ${imp.title}`
            : `Forbedring: ${imp.title}`,
        tone: imp.status === "pending" ? "wait" : "good",
      });
    } catch {
      /* skip */
    }
  }

  items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  // Keep last ~24 narrative beats
  const trimmed = items.slice(-24);
  if (trimmed.length === 0) {
    return [
      {
        id: "empty",
        at: new Date().toISOString(),
        timeLabel: timeLabel(new Date()),
        text: "Ingen aktivitet ennå. Når jeg scanner eller kjører nattlig arbeid, dukker historien opp her.",
        tone: "neutral",
      },
    ];
  }
  return trimmed;
}
