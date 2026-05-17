import type { AgentRunStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const allowedStatuses: AgentRunStatus[] = ["STARTED", "COMPLETED", "FAILED", "SKIPPED"];

export type AgentRunInspectionFilters = {
  venueId?: string | null;
  inquiryId?: string | null;
  status?: string | null;
  window?: string | null;
};

export type AgentRunInspectionResult = Awaited<ReturnType<typeof listAgentRunInspection>>;

function parseWindowStart(window: string | null | undefined) {
  const now = Date.now();
  if (window === "1h") return new Date(now - 60 * 60 * 1000);
  if (window === "24h") return new Date(now - 24 * 60 * 60 * 1000);
  if (window === "7d") return new Date(now - 7 * 24 * 60 * 60 * 1000);
  if (window === "30d") return new Date(now - 30 * 24 * 60 * 60 * 1000);
  return new Date(now - 7 * 24 * 60 * 60 * 1000);
}

function parseStatus(status: string | null | undefined): AgentRunStatus | null {
  if (!status) return null;
  const normalized = status.toUpperCase();
  return allowedStatuses.includes(normalized as AgentRunStatus) ? normalized as AgentRunStatus : null;
}

export async function listAgentRunInspection(filters: AgentRunInspectionFilters = {}) {
  const status = parseStatus(filters.status);
  const startedAt = {
    gte: parseWindowStart(filters.window),
  };

  const where = {
    startedAt,
    ...(filters.venueId ? { venueId: filters.venueId } : {}),
    ...(filters.inquiryId ? { inquiryId: filters.inquiryId } : {}),
    ...(status ? { status } : {}),
  };

  const [runs, venues, statusCounts] = await Promise.all([
    prisma.agentRun.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: 50,
      include: {
        venue: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        inquiry: {
          select: {
            id: true,
            guestName: true,
            status: true,
          },
        },
        toolCalls: {
          orderBy: { startedAt: "asc" },
          select: {
            id: true,
            toolName: true,
            status: true,
            inputSummary: true,
            outputSummary: true,
            errorMessage: true,
            startedAt: true,
            completedAt: true,
            durationMs: true,
          },
        },
      },
    }),
    prisma.venue.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
      },
    }),
    prisma.agentRun.groupBy({
      by: ["status"],
      where: { startedAt },
      _count: {
        _all: true,
      },
    }),
  ]);

  return {
    filters: {
      venueId: filters.venueId ?? "",
      inquiryId: filters.inquiryId ?? "",
      status: status ?? "",
      window: filters.window || "7d",
    },
    venues,
    statusCounts: allowedStatuses.map((item) => ({
      status: item,
      count: statusCounts.find((row) => row.status === item)?._count._all ?? 0,
    })),
    runs,
  };
}

