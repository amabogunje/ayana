import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type ReportFilters = {
  venueSlug?: string;
  startDate?: string;
  endDate?: string;
};

export type PaginatedReportResult<T> = {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type OperationalReportRow = Prisma.ActivityLogGetPayload<{
  include: {
    actor: true;
    venue: true;
  };
}>;

export type TranscriptReportRow = Prisma.InquiryGetPayload<{
  include: {
    venue: true;
    messages: {
      orderBy: {
        createdAt: "desc";
      };
      take: 1;
    };
    reservation: true;
  };
}>;

function startOfDay(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function endOfDay(value: string) {
  const date = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildDateFilter(startDate?: string, endDate?: string) {
  const start = startDate ? startOfDay(startDate) : null;
  const end = endDate ? endOfDay(endDate) : null;

  if (!start && !end) {
    return undefined;
  }

  return {
    ...(start ? { gte: start } : {}),
    ...(end ? { lte: end } : {}),
  };
}

function normalizePage(value?: number) {
  return !value || value < 1 ? 1 : Math.floor(value);
}

function calculateTotalPages(totalCount: number, pageSize: number) {
  return Math.max(1, Math.ceil(totalCount / pageSize));
}

function buildActivityWhere(filters: ReportFilters) {
  const dateFilter = buildDateFilter(filters.startDate, filters.endDate);

  return {
    ...(filters.venueSlug ? { venue: { slug: filters.venueSlug } } : {}),
    ...(dateFilter ? { createdAt: dateFilter } : {}),
  };
}

function buildTranscriptWhere(filters: ReportFilters) {
  const dateFilter = buildDateFilter(filters.startDate, filters.endDate);

  return {
    ...(filters.venueSlug ? { venue: { slug: filters.venueSlug } } : {}),
    ...(dateFilter ? { requestedAt: dateFilter } : {}),
  };
}

export function formatReportTimestamp(value: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

export async function listReportVenues() {
  return prisma.venue.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
    },
  });
}

export async function listOperationalReport(
  filters: ReportFilters,
  options?: { page?: number; pageSize?: number },
): Promise<PaginatedReportResult<OperationalReportRow>> {
  const totalCount = await prisma.activityLog.count({
    where: buildActivityWhere(filters),
  });
  const requestedPageSize = options?.pageSize ?? 10;
  const pageSize = requestedPageSize <= 0 ? Math.max(totalCount, 1) : requestedPageSize;
  const totalPages = calculateTotalPages(totalCount, pageSize);
  const page = requestedPageSize <= 0 ? 1 : Math.min(normalizePage(options?.page), totalPages);

  const items = await prisma.activityLog.findMany({
    where: buildActivityWhere(filters),
    include: {
      actor: true,
      venue: true,
    },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  return {
    items,
    totalCount,
    page,
    pageSize,
    totalPages,
  };
}

export async function listTranscriptReport(
  filters: ReportFilters,
  options?: { page?: number; pageSize?: number },
): Promise<PaginatedReportResult<TranscriptReportRow>> {
  const totalCount = await prisma.inquiry.count({
    where: buildTranscriptWhere(filters),
  });
  const requestedPageSize = options?.pageSize ?? 10;
  const pageSize = requestedPageSize <= 0 ? Math.max(totalCount, 1) : requestedPageSize;
  const totalPages = calculateTotalPages(totalCount, pageSize);
  const page = requestedPageSize <= 0 ? 1 : Math.min(normalizePage(options?.page), totalPages);

  const items = await prisma.inquiry.findMany({
    where: buildTranscriptWhere(filters),
    include: {
      venue: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      reservation: true,
    },
    orderBy: { requestedAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  return {
    items,
    totalCount,
    page,
    pageSize,
    totalPages,
  };
}

export async function listOperationalReportAll(filters: ReportFilters): Promise<OperationalReportRow[]> {
  return prisma.activityLog.findMany({
    where: buildActivityWhere(filters),
    include: {
      actor: true,
      venue: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function listTranscriptReportAll(filters: ReportFilters): Promise<TranscriptReportRow[]> {
  return prisma.inquiry.findMany({
    where: buildTranscriptWhere(filters),
    include: {
      venue: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      reservation: true,
    },
    orderBy: { requestedAt: "desc" },
  });
}

export function toCsv(rows: string[][]) {
  return rows
    .map((row) =>
      row
        .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
        .join(","),
    )
    .join("\n");
}
