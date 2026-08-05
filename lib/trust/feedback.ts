/**
 * Unified AI learning loop — record feedback + human overrides.
 */

import "server-only";

import type { AiEngine, AiFeedbackKind, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AiEngineId } from "@/lib/trust/types";

export async function recordAiFeedback(input: {
  storeId?: string | null;
  engine: AiEngineId;
  kind: AiFeedbackKind | string;
  subjectType: string;
  subjectKey: string;
  aiProposal?: Record<string, unknown> | null;
  humanResult?: Record<string, unknown> | null;
  confidence?: number | null;
  why?: string[] | null;
  risks?: string[] | null;
  actorId?: string | null;
  actorEmail?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  return prisma.aiFeedbackEvent.create({
    data: {
      storeId: input.storeId || null,
      engine: input.engine as AiEngine,
      kind: input.kind as AiFeedbackKind,
      subjectType: input.subjectType,
      subjectKey: input.subjectKey,
      aiProposal: (input.aiProposal || undefined) as Prisma.InputJsonValue | undefined,
      humanResult: (input.humanResult || undefined) as Prisma.InputJsonValue | undefined,
      confidence: input.confidence ?? null,
      why: input.why || undefined,
      risks: input.risks || undefined,
      actorId: input.actorId || null,
      actorEmail: input.actorEmail || null,
      metadata: (input.metadata || undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function recordAiOverride(input: {
  storeId?: string | null;
  engine: AiEngineId;
  field: string;
  subjectKey: string;
  aiValue: string;
  humanValue: string;
  reason?: string | null;
  actorId?: string | null;
  actorEmail?: string | null;
}) {
  const row = await prisma.aiOverride.create({
    data: {
      storeId: input.storeId || null,
      engine: input.engine as AiEngine,
      field: input.field,
      subjectKey: input.subjectKey,
      aiValue: input.aiValue,
      humanValue: input.humanValue,
      reason: input.reason || null,
      actorId: input.actorId || null,
      actorEmail: input.actorEmail || null,
    },
  });

  await recordAiFeedback({
    storeId: input.storeId,
    engine: input.engine,
    kind: "override",
    subjectType: input.field,
    subjectKey: input.subjectKey,
    aiProposal: { [input.field]: input.aiValue },
    humanResult: { [input.field]: input.humanValue },
    actorId: input.actorId,
    actorEmail: input.actorEmail,
    metadata: { overrideId: row.id, reason: input.reason },
  });

  return row;
}

export async function listRecentOverrides(limit = 30) {
  return prisma.aiOverride.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function listRecentFeedback(limit = 40) {
  return prisma.aiFeedbackEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
