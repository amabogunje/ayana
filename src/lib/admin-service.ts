import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isWebsiteChatListedInChannels, makeWebsiteChatWidgetKey } from "@/lib/website-chat-service";

type VenueStatus = "DRAFT" | "PILOT" | "ACTIVE" | "PAUSED" | "DEACTIVATED";
type InquiryStatus = "NEW" | "QUALIFYING" | "QUOTED" | "DEPOSIT_SENT" | "CONFIRMED" | "NEEDS_HUMAN" | "LOST";
type ReservationStatus = "PENDING" | "DEPOSIT_PENDING" | "CONFIRMED" | "CANCELLED";
export type DashboardTimeRange = "7d" | "1m" | "3m" | "ytd" | "1y" | "max";

type VenueRecord = {
  id: string;
  slug: string;
  name: string;
  addressLine1?: string | null;
  city: string;
  state?: string | null;
  postalCode?: string | null;
  phoneNumber?: string | null;
  timezone: string;
  status: VenueStatus;
  aiEnabled: boolean;
  channelsSummary: string;
  hoursSummary?: string | null;
  primaryOperatorName?: string | null;
  primaryOperatorRole?: string | null;
  primaryOperatorEmail?: string | null;
  brandTone: string;
  responseSlaSeconds: number;
  depositPolicy: string;
  createdAt: Date;
  inquiries: Array<{
    id: string;
    aiConfidence: number;
    status: InquiryStatus;
    requestedAt: Date;
    guestName: string;
    channel: "SMS" | "INSTAGRAM_DM" | "PHONE";
    partySize: number;
    spendIntentLabel: string;
    nextAction: string;
    messages: Array<{ content: string }>;
    reservation?: {
      depositAmountCents: number;
      status: ReservationStatus;
    } | null;
  }>;
  tableOptions: Array<{
    id: string;
    name: string;
    code: string;
    quantity: number;
    minSpendCents: number;
    depositAmountCents: number;
    capacityMin: number;
    capacityMax: number;
    description: string;
  }>;
};

type AdminRepository = {
  venue: {
    findMany: (args?: unknown) => Promise<VenueRecord[]>;
    findUnique: (args: { where: { slug: string } }) => Promise<VenueRecord | null>;
    create: (args: { data: Record<string, unknown> }) => Promise<VenueRecord>;
    update: (args: { where: { slug: string }; data: Record<string, unknown> }) => Promise<VenueRecord>;
    count: () => Promise<number>;
  };
  inquiry: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  };
  inquiryMessage: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  };
  reservation: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  };
  tableOption: {
    create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<{ id: string; venueId: string; name: string }>;
    delete: (args: { where: { id: string } }) => Promise<{ id: string; venueId: string; name: string }>;
  };
};

export type VenueListItem = {
  name: string;
  slug: string;
  city: string;
  timezone: string;
  inquiries: string;
  status: string;
  statusTone: "success" | "warning" | "neutral" | "danger";
  aiState: string;
  channels: string;
  confirmed: string;
  depositConversion: string;
  bookedRevenue: string;
  lastActivity: string;
  alertCount: string;
};

export type OnboardingChecklistItem = {
  label: string;
  complete: boolean;
  detail: string;
};

export type AdminOverview = {
  timeRange: DashboardTimeRange;
  timeRangeLabel: string;
  kpis: Array<{ label: string; value: string; detail: string }>;
  venues: VenueListItem[];
  portfolio: Array<{ label: string; inquiries: number; confirmed: number; deposit: number; revenue: number }>;
  flags: Array<{
    id: string;
    flag: string;
    tone: "danger" | "warning" | "neutral";
    venue: string;
    venueSlug?: string;
    guest: string;
    summary: string;
    channel: string;
    updatedAt: string;
  }>;
  patterns: Array<{
    title: string;
    description: string;
    count: string;
    items: Array<{
      label: string;
      venueSlug?: string;
      venueName?: string;
      kind: "venue" | "thread";
    }>;
  }>;
  analytics: Array<{
    week: string;
    inquiries: string;
    confirmed: string;
    depositConversion: string;
    bookedRevenue: string;
    escalationRate: string;
  }>;
  source: "database" | "empty";
  activity: Array<{
    id: string;
    summary: string;
    action: string;
    createdAt: string;
    actorName: string;
    venueName?: string;
  }>;
};

export type AlertListItem = {
  id: string;
  title: string;
  description: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  status: "OPEN" | "RESOLVED";
  venueName?: string;
  venueSlug?: string;
  createdAt: string;
};

function getRepository() {
  return prisma as unknown as AdminRepository;
}

function toneForStatus(status: VenueStatus): VenueListItem["statusTone"] {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "PILOT":
      return "warning";
    case "DEACTIVATED":
      return "danger";
    default:
      return "neutral";
  }
}

function humanizeStatus(status: VenueStatus) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function currency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value / 100);
}

function daysAgo(date: Date) {
  const diffMs = Date.now() - new Date(date).getTime();
  const minutes = Math.max(1, Math.round(diffMs / 60000));
  if (minutes < 60) return `Updated ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Updated ${hours} hr ago`;
  return `Updated ${Math.round(hours / 24)} day ago`;
}

function subtractDays(days: number) {
  const value = new Date();
  value.setDate(value.getDate() - days);
  return value;
}

function getRangeStart(range: DashboardTimeRange) {
  const now = new Date();
  switch (range) {
    case "7d":
      return subtractDays(7);
    case "1m":
      return subtractDays(30);
    case "3m":
      return subtractDays(90);
    case "ytd":
      return new Date(now.getFullYear(), 0, 1);
    case "1y":
      return subtractDays(365);
    case "max":
    default:
      return null;
  }
}

function isWithinRange(date: Date, range: DashboardTimeRange) {
  const start = getRangeStart(range);
  if (!start) return true;
  return new Date(date).getTime() >= start.getTime();
}

function filterVenueRecordByRange(record: VenueRecord, range: DashboardTimeRange): VenueRecord {
  return {
    ...record,
    inquiries: record.inquiries.filter((inquiry) => isWithinRange(inquiry.requestedAt, range)),
  };
}

function labelForRange(range: DashboardTimeRange) {
  switch (range) {
    case "7d":
      return "Last 7 days";
    case "1m":
      return "Last 1 month";
    case "3m":
      return "Last 3 months";
    case "ytd":
      return "Year to date";
    case "1y":
      return "Last 12 months";
    case "max":
      return "All time";
  }
}

function bookedRevenueForVenue(record: VenueRecord) {
  return record.inquiries.reduce((total, inquiry) => {
    const reservation = inquiry.reservation;
    if (!reservation || reservation.status !== "CONFIRMED") {
      return total;
    }

    return total + reservation.depositAmountCents * 5;
  }, 0);
}

function depositConversionForVenue(record: VenueRecord) {
  const conversionBase = record.inquiries.length || 1;
  const depositCount = record.inquiries.filter(
    (inquiry) =>
      inquiry.reservation?.status === "DEPOSIT_PENDING" || inquiry.reservation?.status === "CONFIRMED",
  ).length;
  return Math.round((depositCount / conversionBase) * 100);
}

function confirmedCountForVenue(record: VenueRecord) {
  return record.inquiries.filter((inquiry) => inquiry.reservation?.status === "CONFIRMED").length;
}

function alertCountForVenue(record: VenueRecord) {
  return record.inquiries.filter(
    (inquiry) => inquiry.status === "NEEDS_HUMAN" || inquiry.aiConfidence < 0.65,
  ).length;
}

function mapVenue(record: VenueRecord): VenueListItem {
  const latestDate = [...record.inquiries.map((item) => item.requestedAt), record.createdAt]
    .sort((left, right) => right.getTime() - left.getTime())[0];

  const aiState =
    record.status === "DRAFT"
      ? "Setup"
      : record.status === "DEACTIVATED"
        ? "Offline"
        : record.aiEnabled
          ? "Live"
          : "Paused";

  return {
    name: record.name,
    slug: record.slug,
    city: record.city,
    timezone: record.timezone,
    inquiries: String(record.inquiries.length),
    status: humanizeStatus(record.status),
    statusTone: toneForStatus(record.status),
    aiState,
    channels: record.channelsSummary,
    confirmed: String(confirmedCountForVenue(record)),
    depositConversion: `${depositConversionForVenue(record)}%`,
    bookedRevenue: bookedRevenueForVenue(record) ? currency(bookedRevenueForVenue(record)) : "-",
    lastActivity: latestDate ? daysAgo(latestDate) : "New venue",
    alertCount: String(alertCountForVenue(record)),
  };
}

async function fetchVenueRecords() {
  const repository = getRepository();
  const venues = await repository.venue.findMany({
    orderBy: [{ createdAt: "desc" }],
    include: {
      inquiries: {
        orderBy: { requestedAt: "desc" },
        include: {
          messages: { take: 1, orderBy: { createdAt: "desc" } },
          reservation: true,
        },
      },
      tableOptions: true,
    },
  });

  return venues;
}

export async function listVenues() {
  const venues = await fetchVenueRecords();
  return venues.map(mapVenue);
}

export async function getVenueDetail(slug: string) {
  const repository = getRepository();
  const venue = await repository.venue.findUnique({
    where: { slug },
    include: {
      inquiries: {
        orderBy: { requestedAt: "desc" },
        include: {
          messages: { take: 1, orderBy: { createdAt: "desc" } },
          reservation: true,
        },
      },
      tableOptions: true,
    },
  } as never);

  return venue ?? null;
}

export function getVenueOnboardingChecklist(venue: VenueRecord): OnboardingChecklistItem[] {
  return [
    {
      label: "Timezone configured",
      complete: Boolean(venue.timezone),
      detail: venue.timezone || "Required for scheduling and reporting",
    },
    {
      label: "Channels defined",
      complete: Boolean(venue.channelsSummary && venue.channelsSummary !== "Setup pending"),
      detail: venue.channelsSummary || "At least one live channel required",
    },
    {
      label: "Operating hours set",
      complete: Boolean(venue.hoursSummary),
      detail: venue.hoursSummary || "Needed for agent behavior and handoff rules",
    },
    {
      label: "Primary operator assigned",
      complete: Boolean(venue.primaryOperatorName && venue.primaryOperatorEmail),
      detail:
        venue.primaryOperatorName && venue.primaryOperatorEmail
          ? `${venue.primaryOperatorName}${venue.primaryOperatorRole ? ` (${venue.primaryOperatorRole})` : ""} · ${venue.primaryOperatorEmail}`
          : "Assign the intended venue owner or operator before pilot",
    },
    {
      label: "Brand tone defined",
      complete: Boolean(venue.brandTone),
      detail: venue.brandTone || "Venue-specific tone is still missing",
    },
    {
      label: "Deposit policy defined",
      complete: Boolean(venue.depositPolicy),
      detail: venue.depositPolicy || "Required before live quoting",
    },
    {
      label: "At least one table configured",
      complete: venue.tableOptions.length > 0,
      detail:
        venue.tableOptions.length > 0
          ? `${venue.tableOptions.reduce((total, option) => total + option.quantity, 0)} total table${venue.tableOptions.reduce((total, option) => total + option.quantity, 0) === 1 ? "" : "s"} configured`
          : "Add inventory before moving to pilot or active",
    },
  ];
}

async function logActivity(input: {
  actorUserId?: string;
  venueId?: string;
  entityType: string;
  entityId?: string;
  action: string;
  summary: string;
}) {
  await prisma.activityLog.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      venueId: input.venueId ?? null,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      action: input.action,
      summary: input.summary,
    },
  });
}

async function syncVenueAlerts(venueId: string) {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    include: {
      inquiries: {
        include: {
          messages: { orderBy: { createdAt: "desc" }, take: 1 },
          reservation: true,
        },
      },
      tableOptions: true,
    },
  });

  if (!venue) return;

  const desired = new Map<
    string,
    {
      venueId: string;
      inquiryId?: string;
      type: string;
      severity: "INFO" | "WARNING" | "CRITICAL";
      title: string;
      description: string;
    }
  >();

  const checklist = getVenueOnboardingChecklist(venue as unknown as VenueRecord);
  const incomplete = checklist.filter((item) => !item.complete);
  if (incomplete.length > 0) {
    desired.set(`venue:${venue.id}:onboarding`, {
      venueId: venue.id,
      type: "VENUE_ONBOARDING_INCOMPLETE",
      severity: "WARNING",
      title: `${venue.name} onboarding is incomplete`,
      description: incomplete.map((item) => item.label).join(", "),
    });
  }

  const unresolvedInquiryCount = venue.inquiries.filter((inquiry) => inquiry.status !== "CONFIRMED").length;
  if (!venue.aiEnabled && unresolvedInquiryCount > 0) {
    desired.set(`venue:${venue.id}:ai-paused`, {
      venueId: venue.id,
      type: "VENUE_AI_PAUSED",
      severity: "WARNING",
      title: `${venue.name} has AI paused`,
      description: `${unresolvedInquiryCount} open inquiry${unresolvedInquiryCount === 1 ? "" : "ies"} still need handling.`,
    });
  }

  for (const inquiry of venue.inquiries) {
    if (inquiry.status === "NEEDS_HUMAN") {
      desired.set(`inquiry:${inquiry.id}:needs-human`, {
        venueId: venue.id,
        inquiryId: inquiry.id,
        type: "INQUIRY_NEEDS_HUMAN",
        severity: "CRITICAL",
        title: `${inquiry.guestName} needs human follow-up`,
        description: inquiry.messages[0]?.content ?? inquiry.nextAction,
      });
    } else if (inquiry.aiConfidence < 0.65) {
      desired.set(`inquiry:${inquiry.id}:low-confidence`, {
        venueId: venue.id,
        inquiryId: inquiry.id,
        type: "INQUIRY_LOW_CONFIDENCE",
        severity: "WARNING",
        title: `${inquiry.guestName} inquiry has low AI confidence`,
        description: inquiry.messages[0]?.content ?? inquiry.nextAction,
      });
    }

    if (inquiry.reservation?.status === "DEPOSIT_PENDING") {
      desired.set(`inquiry:${inquiry.id}:deposit-pending`, {
        venueId: venue.id,
        inquiryId: inquiry.id,
        type: "INQUIRY_DEPOSIT_PENDING",
        severity: "INFO",
        title: `${inquiry.guestName} deposit is pending`,
        description: "Reservation has a deposit requirement but is not fully confirmed yet.",
      });
    }
  }

  for (const [fingerprint, alert] of desired.entries()) {
    await prisma.alert.upsert({
      where: { fingerprint },
      update: {
        status: "OPEN",
        severity: alert.severity,
        title: alert.title,
        description: alert.description,
        resolvedAt: null,
      },
      create: {
        fingerprint,
        venueId: alert.venueId,
        inquiryId: alert.inquiryId,
        type: alert.type,
        severity: alert.severity,
        status: "OPEN",
        title: alert.title,
        description: alert.description,
      },
    });
  }

  const activeFingerprints = Array.from(desired.keys());
  await prisma.alert.updateMany({
    where: {
      venueId,
      status: "OPEN",
      fingerprint: {
        notIn: activeFingerprints.length > 0 ? activeFingerprints : ["__none__"],
      },
    },
    data: {
      status: "RESOLVED",
      resolvedAt: new Date(),
    },
  });
}

export async function listOpenAlerts() {
  const alerts = await prisma.alert.findMany({
    where: { status: "OPEN" },
    include: { venue: true },
    orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
    take: 20,
  });

  return alerts.map((alert) => ({
    id: alert.id,
    title: alert.title,
    description: alert.description,
    severity: alert.severity,
    status: alert.status,
    venueName: alert.venue?.name,
    venueSlug: alert.venue?.slug,
    createdAt: daysAgo(alert.createdAt),
  })) as AlertListItem[];
}

export async function listRecentActivity() {
  const activity = await prisma.activityLog.findMany({
    include: { actor: true, venue: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return activity.map((item) => ({
    id: item.id,
    summary: item.summary,
    action: item.action,
    createdAt: daysAgo(item.createdAt),
    actorName: item.actor?.fullName ?? "System",
    venueName: item.venue?.name,
  }));
}

export async function listVenueRecentActivity(venueId: string) {
  const activity = await prisma.activityLog.findMany({
    where: { venueId },
    include: { actor: true, venue: true },
    orderBy: { createdAt: "desc" },
    take: 12,
  });

  return activity.map((item) => ({
    id: item.id,
    summary: item.summary,
    action: item.action,
    createdAt: daysAgo(item.createdAt),
    actorName: item.actor?.fullName ?? "System",
    venueName: item.venue?.name,
  }));
}

export async function listVenueAlerts(venueId: string) {
  const alerts = await prisma.alert.findMany({
    where: { venueId, status: "OPEN" },
    orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
    take: 12,
  });

  return alerts.map((alert) => ({
    id: alert.id,
    title: alert.title,
    description: alert.description,
    severity: alert.severity,
    status: alert.status,
    createdAt: daysAgo(alert.createdAt),
  }));
}

export async function getVenueOnboarding(slug: string) {
  const venue = await getVenueDetail(slug);
  if (!venue) return null;

  const checklist = getVenueOnboardingChecklist(venue);
  const completedCount = checklist.filter((item) => item.complete).length;

  return {
    venue,
    checklist,
    completedCount,
    totalCount: checklist.length,
    readyForPilot: completedCount === checklist.length,
  };
}

function buildPatterns(venues: VenueRecord[]): AdminOverview["patterns"] {
  const lowConfidenceVenues = venues.filter((venue) =>
    venue.inquiries.some((inquiry) => inquiry.aiConfidence < 0.65),
  );
  const paymentFrictionThreads = venues.flatMap((venue) =>
    venue.inquiries
      .filter((inquiry) => inquiry.reservation?.status === "DEPOSIT_PENDING")
      .map((inquiry) => ({
        label: `${inquiry.guestName} · ${venue.name}`,
        venueSlug: venue.slug,
        venueName: venue.name,
        kind: "thread" as const,
      })),
  );
  const pausedBacklogVenues = venues.filter(
    (venue) => !venue.aiEnabled && venue.inquiries.some((inquiry) => inquiry.status !== "CONFIRMED"),
  );

  return [
    {
      title: "AI confidence drift",
      description: "Venues where inquiries are repeatedly dropping below the confidence threshold.",
      count: `${lowConfidenceVenues.length} venue${lowConfidenceVenues.length === 1 ? "" : "s"}`,
      items: lowConfidenceVenues.map((venue) => ({
        label: venue.name,
        venueSlug: venue.slug,
        venueName: venue.name,
        kind: "venue" as const,
      })),
    },
    {
      title: "Deposit follow-up backlog",
      description: "Threads where a deposit exists but the reservation is not yet fully confirmed.",
      count: `${paymentFrictionThreads.length} thread${paymentFrictionThreads.length === 1 ? "" : "s"}`,
      items: paymentFrictionThreads,
    },
    {
      title: "Paused venue demand risk",
      description: "Venues with AI paused while open inquiries remain unresolved.",
      count: `${pausedBacklogVenues.length} venue${pausedBacklogVenues.length === 1 ? "" : "s"}`,
      items: pausedBacklogVenues.map((venue) => ({
        label: venue.name,
        venueSlug: venue.slug,
        venueName: venue.name,
        kind: "venue" as const,
      })),
    },
  ];
}

function startOfWeek(date: Date) {
  const value = new Date(date);
  const day = value.getDay();
  const diff = (day + 6) % 7;
  value.setHours(0, 0, 0, 0);
  value.setDate(value.getDate() - diff);
  return value;
}

function formatWeekLabel(start: Date) {
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const format = (value: Date) =>
    value.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  return `${format(start)} - ${format(end)}`;
}

function buildAnalytics(venues: VenueRecord[]): AdminOverview["analytics"] {
  const buckets = new Map<
    string,
    {
      label: string;
      inquiries: number;
      confirmed: number;
      depositCount: number;
      bookedRevenueCents: number;
      escalations: number;
    }
  >();

  for (const venue of venues) {
    for (const inquiry of venue.inquiries) {
      const start = startOfWeek(inquiry.requestedAt);
      const key = start.toISOString();
      const bucket =
        buckets.get(key) ??
        {
          label: formatWeekLabel(start),
          inquiries: 0,
          confirmed: 0,
          depositCount: 0,
          bookedRevenueCents: 0,
          escalations: 0,
        };

      bucket.inquiries += 1;
      if (inquiry.reservation?.status === "DEPOSIT_PENDING" || inquiry.reservation?.status === "CONFIRMED") {
        bucket.depositCount += 1;
      }
      if (inquiry.reservation?.status === "CONFIRMED") {
        bucket.confirmed += 1;
        bucket.bookedRevenueCents += inquiry.reservation.depositAmountCents * 5;
      }
      if (inquiry.status === "NEEDS_HUMAN" || inquiry.aiConfidence < 0.65) {
        bucket.escalations += 1;
      }

      buckets.set(key, bucket);
    }
  }

  return Array.from(buckets.entries())
    .sort((left, right) => left[0].localeCompare(right[0]))
    .slice(-4)
    .map(([, bucket]) => ({
      week: bucket.label,
      inquiries: String(bucket.inquiries),
      confirmed: String(bucket.confirmed),
      depositConversion: `${Math.round((bucket.depositCount / (bucket.inquiries || 1)) * 100)}%`,
      bookedRevenue: bucket.bookedRevenueCents ? currency(bucket.bookedRevenueCents) : "$0",
      escalationRate: `${Math.round((bucket.escalations / (bucket.inquiries || 1)) * 100)}%`,
    }));
}

function buildPortfolio(analytics: AdminOverview["analytics"]): AdminOverview["portfolio"] {
  return analytics.map((row) => ({
    label: row.week.split(" - ")[0],
    inquiries: Math.max(16, Number.parseInt(row.inquiries, 10) * 3),
    confirmed: Math.max(14, Number.parseInt(row.confirmed, 10) * 8),
    deposit: Math.max(18, Number.parseInt(row.depositConversion, 10)),
    revenue: Math.max(22, Number.parseInt(row.bookedRevenue.replace(/[$,]/g, ""), 10) / 600),
  }));
}

function buildKpiDetails(input: { hasVenues: boolean; hasLiveVenues: boolean }) {
  if (!input.hasVenues) {
    return {
      inquiries: "No venues are active yet",
      confirmed: "No venues are active yet",
      conversion: "No venues are active yet",
      revenue: "No venues are active yet",
    };
  }

  if (!input.hasLiveVenues) {
    return {
      inquiries: "No venues are live yet",
      confirmed: "No venues are live yet",
      conversion: "No venues are live yet",
      revenue: "No live bookings yet",
    };
  }

  return {
    inquiries: "Number of inquiries into the system",
    confirmed: "Number of confirmed bookings in the system",
    conversion: "Percent of inquiries converted to a paid deposit",
    revenue: "Estimated booked revenue in the system",
  };
}

export async function getAdminOverview(timeRange: DashboardTimeRange = "1m"): Promise<AdminOverview> {
  const venueRecords = await fetchVenueRecords();
  const rangedVenueRecords = venueRecords.map((venue) => filterVenueRecordByRange(venue, timeRange));
  const venues = rangedVenueRecords.map(mapVenue);
  const liveVenueCount = venueRecords.filter(
    (venue) => venue.status === "ACTIVE" || venue.status === "PILOT",
  ).length;
  const kpiDetails = buildKpiDetails({
    hasVenues: venueRecords.length > 0,
    hasLiveVenues: liveVenueCount > 0,
  });

  if (venues.length === 0) {
    return {
      timeRange,
      timeRangeLabel: labelForRange(timeRange),
      kpis: [
        { label: "Inbound inquiries", value: "0", detail: kpiDetails.inquiries },
        { label: "Confirmed bookings", value: "0", detail: kpiDetails.confirmed },
        { label: "Deposit conversion", value: "0%", detail: kpiDetails.conversion },
        { label: "Estimated booked revenue", value: "$0", detail: kpiDetails.revenue },
      ],
      venues: [],
      portfolio: [],
      flags: [],
      patterns: [],
      analytics: [],
      activity: [],
      source: "empty",
    };
  }

  const confirmedBookings = rangedVenueRecords.reduce((total, venue) => total + confirmedCountForVenue(venue), 0);
  const inquiryCount = rangedVenueRecords.reduce((total, venue) => total + venue.inquiries.length, 0);
  const liveVenues = rangedVenueRecords.filter((venue) => venue.aiEnabled).length || 1;
  const avgConversion = Math.round(
    rangedVenueRecords.reduce((total, venue) => total + depositConversionForVenue(venue), 0) / liveVenues,
  );
  const bookedRevenueCents = rangedVenueRecords.reduce((total, venue) => total + bookedRevenueForVenue(venue), 0);
  const persistedAlerts = await listOpenAlerts();
  const patterns = buildPatterns(venueRecords);
  const analytics = buildAnalytics(rangedVenueRecords);
  const portfolio = buildPortfolio(analytics);
  const activity = await listRecentActivity();
  const flags = persistedAlerts.map((alert) => ({
    id: alert.id,
    flag: alert.severity === "CRITICAL" ? "Critical" : alert.severity === "WARNING" ? "Warning" : "Info",
    tone:
      alert.severity === "CRITICAL"
        ? ("danger" as const)
        : alert.severity === "WARNING"
          ? ("warning" as const)
          : ("neutral" as const),
    venue: alert.venueName ?? "Platform",
    venueSlug: alert.venueSlug,
    guest: alert.title,
    summary: alert.description,
    channel: "Alert",
    updatedAt: alert.createdAt,
  }));

  return {
    timeRange,
    timeRangeLabel: labelForRange(timeRange),
    kpis: [
      {
        label: "Inbound inquiries",
        value: String(inquiryCount),
        detail: kpiDetails.inquiries,
      },
      {
        label: "Confirmed bookings",
        value: String(confirmedBookings),
        detail: kpiDetails.confirmed,
      },
      {
        label: "Deposit conversion",
        value: `${avgConversion}%`,
        detail: kpiDetails.conversion,
      },
      {
        label: "Estimated booked revenue",
        value: currency(bookedRevenueCents),
        detail: kpiDetails.revenue,
      },
    ],
    venues,
    portfolio,
    flags,
    patterns,
    analytics,
    activity,
    source: "database",
  };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function makeBaseTableCode(value: string) {
  const normalized = slugify(value).replace(/-/g, "_").toUpperCase();
  return normalized || "TABLE";
}

async function generateTableOptionCode(venueId: string, name: string, excludingId?: string) {
  const base = makeBaseTableCode(name);
  const existing = await prisma.tableOption.findMany({
    where: {
      venueId,
      ...(excludingId ? { id: { not: excludingId } } : {}),
    },
    select: { code: true },
  });

  const taken = new Set(existing.map((item) => item.code));
  if (!taken.has(base)) {
    return base;
  }

  let suffix = 2;
  while (taken.has(`${base}_${suffix}`)) {
    suffix += 1;
  }

  return `${base}_${suffix}`;
}

export async function createVenue(input: {
  name: string;
  addressLine1?: string;
  city: string;
  state?: string;
  postalCode?: string;
  phoneNumber?: string;
  timezone: string;
  channelsSummary: string;
  hoursSummary?: string;
  primaryOperatorName?: string;
  primaryOperatorRole?: string;
  primaryOperatorEmail?: string;
  brandTone: string;
  depositPolicy: string;
}, actorUserId?: string) {
  const repository = getRepository();
  const slug = slugify(input.name);

  const venue = await repository.venue.create({
    data: {
      slug,
      name: input.name,
      addressLine1: input.addressLine1 || null,
      city: input.city,
      state: input.state || null,
      postalCode: input.postalCode || null,
      phoneNumber: input.phoneNumber || null,
      timezone: input.timezone,
      channelsSummary: input.channelsSummary,
      hoursSummary: input.hoursSummary || null,
      primaryOperatorName: input.primaryOperatorName || null,
      primaryOperatorRole: input.primaryOperatorRole || null,
      primaryOperatorEmail: input.primaryOperatorEmail || null,
      brandTone: input.brandTone,
      depositPolicy: input.depositPolicy,
      responseSlaSeconds: 30,
      status: "DRAFT",
      aiEnabled: true,
      websiteChatEnabled: isWebsiteChatListedInChannels(input.channelsSummary),
      websiteChatWidgetKey: isWebsiteChatListedInChannels(input.channelsSummary) ? makeWebsiteChatWidgetKey() : null,
    },
  });

  await logActivity({
    actorUserId,
    venueId: venue.id,
    entityType: "venue",
    entityId: venue.id,
    action: "venue.created",
    summary: `Created venue ${venue.name}.`,
  });
  await syncVenueAlerts(venue.id);

  revalidatePath("/");
  revalidatePath("/venues");
  revalidatePath("/alerts");
  revalidatePath("/analytics");
}

export async function updateVenueState(
  slug: string,
  data: { status?: VenueStatus; aiEnabled?: boolean },
  actorUserId?: string,
) {
  const repository = getRepository();

  const venue = await repository.venue.update({
    where: { slug },
    data,
  });

  if (data.status) {
    await logActivity({
      actorUserId,
      venueId: venue.id,
      entityType: "venue",
      entityId: venue.id,
      action: "venue.status_changed",
      summary: `Changed ${venue.name} to ${humanizeStatus(data.status)}.`,
    });
  }

  if (typeof data.aiEnabled === "boolean") {
    await logActivity({
      actorUserId,
      venueId: venue.id,
      entityType: "venue",
      entityId: venue.id,
      action: data.aiEnabled ? "venue.ai_resumed" : "venue.ai_paused",
      summary: `${data.aiEnabled ? "Resumed" : "Paused"} AI for ${venue.name}.`,
    });
  }
  await syncVenueAlerts(venue.id);

  revalidatePath("/");
  revalidatePath("/venues");
  revalidatePath(`/venues/${slug}`);
  revalidatePath("/alerts");
  revalidatePath("/analytics");
}

export async function updateVenueProfile(
  slug: string,
  data: {
    addressLine1: string;
    city: string;
    state: string;
    postalCode: string;
    phoneNumber: string;
    timezone: string;
    channelsSummary: string;
    hoursSummary: string;
    primaryOperatorName: string;
    primaryOperatorRole: string;
    primaryOperatorEmail: string;
    brandTone: string;
    depositPolicy: string;
  },
  actorUserId?: string,
) {
  const existing = await prisma.venue.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      websiteChatWidgetKey: true,
    },
  });

  if (!existing) {
    throw new Error("Venue not found.");
  }

  const websiteChatEnabled = isWebsiteChatListedInChannels(data.channelsSummary);
  const repository = getRepository();
  const venue = await repository.venue.update({
    where: { slug },
    data: {
      ...data,
      websiteChatEnabled,
      websiteChatWidgetKey:
        websiteChatEnabled
          ? existing.websiteChatWidgetKey ?? makeWebsiteChatWidgetKey()
          : existing.websiteChatWidgetKey,
    },
  });
  await logActivity({
    actorUserId,
    venueId: venue.id,
    entityType: "venue",
    entityId: venue.id,
    action: "venue.profile_updated",
    summary: `Updated onboarding configuration for ${venue.name}.`,
  });
  await syncVenueAlerts(venue.id);

  revalidatePath("/");
  revalidatePath("/venues");
  revalidatePath(`/venues/${slug}`);
  revalidatePath("/alerts");
  revalidatePath("/analytics");
}

export async function addVenueTableOption(
  slug: string,
  input: {
    name: string;
    quantity: number;
    minSpendCents: number;
    depositAmountCents: number;
    capacityMin: number;
    capacityMax: number;
    description: string;
  },
  actorUserId?: string,
) {
  const repository = getRepository();
  const venue = await repository.venue.findUnique({
    where: { slug },
  });

  if (!venue) return;

  const code = await generateTableOptionCode(venue.id, input.name);

  const tableOption = await repository.tableOption.create({
    data: {
      venueId: venue.id,
      ...input,
      code,
    },
  });
  await logActivity({
    actorUserId,
    venueId: venue.id,
    entityType: "table_option",
    entityId: tableOption.id,
    action: "venue.table_added",
    summary: `Added table option ${input.name} for ${venue.name}.`,
  });
  await syncVenueAlerts(venue.id);

  revalidatePath("/");
  revalidatePath("/venues");
  revalidatePath(`/venues/${slug}`);
  revalidatePath("/analytics");
}

export async function updateVenueTableOption(
  tableOptionId: string,
  input: {
    name: string;
    quantity: number;
    minSpendCents: number;
    depositAmountCents: number;
    capacityMin: number;
    capacityMax: number;
    description: string;
  },
  actorUserId?: string,
) {
  const repository = getRepository();
  const existing = await prisma.tableOption.findUnique({
    where: { id: tableOptionId },
    select: { id: true, venueId: true, name: true },
  });

  if (!existing) return;

  const code = await generateTableOptionCode(existing.venueId, input.name, existing.id);
  const tableOption = await repository.tableOption.update({
    where: { id: tableOptionId },
    data: {
      ...input,
      code,
    },
  });

  await logActivity({
    actorUserId,
    venueId: tableOption.venueId,
    entityType: "table_option",
    entityId: tableOption.id,
    action: "venue.table_updated",
    summary: `Updated table option ${tableOption.name}.`,
  });
  await syncVenueAlerts(tableOption.venueId);

  revalidatePath("/venues");
  revalidatePath(`/venues`);
}

export async function deleteVenueTableOption(tableOptionId: string, actorUserId?: string) {
  const repository = getRepository();
  const tableOption = await repository.tableOption.delete({
    where: { id: tableOptionId },
  });

  await logActivity({
    actorUserId,
    venueId: tableOption.venueId,
    entityType: "table_option",
    entityId: tableOption.id,
    action: "venue.table_deleted",
    summary: `Deleted table option ${tableOption.name}.`,
  });
  await syncVenueAlerts(tableOption.venueId);

  revalidatePath("/venues");
  revalidatePath(`/venues`);
}

export async function seedDemoPlatformData() {
  const repository = getRepository();
  const count = await repository.venue.count();
  if (count > 0) return;

  const luma = await repository.venue.create({
    data: {
      slug: "luma-saturdays",
      name: "Luma Saturdays",
      city: "Miami",
      timezone: "America/New_York",
      status: "ACTIVE",
      aiEnabled: true,
      channelsSummary: "SMS, Instagram, WhatsApp",
      hoursSummary: "Thu-Sun · 10 PM-4 AM",
      brandTone: "Confident, premium, fast-moving nightlife host",
      depositPolicy: "$400 to secure tables under $2,500 minimum spend",
      responseSlaSeconds: 30,
    },
  });

  const solstice = await repository.venue.create({
    data: {
      slug: "solstice-lounge",
      name: "Solstice Lounge",
      city: "New York",
      timezone: "America/New_York",
      status: "PILOT",
      aiEnabled: true,
      channelsSummary: "SMS, Instagram",
      hoursSummary: "Fri-Sat · 9 PM-3 AM",
      brandTone: "Refined, concise, hospitality-first",
      depositPolicy: "$250 deposit required for bookings over $1,000 minimum spend",
      responseSlaSeconds: 30,
    },
  });

  const monarch = await repository.venue.create({
    data: {
      slug: "monarch-room",
      name: "Monarch Room",
      city: "Las Vegas",
      timezone: "America/Los_Angeles",
      status: "PAUSED",
      aiEnabled: false,
      channelsSummary: "SMS, Phone",
      hoursSummary: "Thu-Sat · 10 PM-4 AM",
      brandTone: "Premium nightlife concierge",
      depositPolicy: "$500 deposit for prime-room inventory",
      responseSlaSeconds: 30,
    },
  });

  const lumaMain = await repository.tableOption.create({
    data: {
      venueId: luma.id,
      name: "Dancefloor Prime",
      code: "DF-PRIME",
      minSpendCents: 200000,
      depositAmountCents: 40000,
      capacityMin: 6,
      capacityMax: 8,
      quantity: 2,
      description: "Prime floor visibility near the DJ booth.",
    },
  });

  const solsticeMain = await repository.tableOption.create({
    data: {
      venueId: solstice.id,
      name: "Main Room Luxe",
      code: "MR-LUXE",
      minSpendCents: 125000,
      depositAmountCents: 25000,
      capacityMin: 4,
      capacityMax: 6,
      quantity: 5,
      description: "Balanced option with strong close rates for mid-spend groups.",
    },
  });

  const monarchMain = await repository.tableOption.create({
    data: {
      venueId: monarch.id,
      name: "Grand Booth",
      code: "GB-01",
      minSpendCents: 300000,
      depositAmountCents: 60000,
      capacityMin: 8,
      capacityMax: 12,
      quantity: 3,
      description: "Large-format booth for premium bottle service groups.",
    },
  });

  const now = new Date();
  const threeDaysAgo = new Date(now);
  threeDaysAgo.setDate(now.getDate() - 3);
  const tenDaysAgo = new Date(now);
  tenDaysAgo.setDate(now.getDate() - 10);
  const seventeenDaysAgo = new Date(now);
  seventeenDaysAgo.setDate(now.getDate() - 17);

  const seedInquiries = [
    {
      venueId: luma.id,
      tableOptionId: lumaMain.id,
      guestName: "Chris P.",
      channel: "PHONE" as const,
      status: "NEEDS_HUMAN" as const,
      requestedAt: now,
      requestedDateLabel: "Tonight, 12:15 AM",
      partySize: 14,
      spendIntentLabel: "$3,000+",
      spendIntentMinCents: 300000,
      spendIntentMaxCents: 400000,
      aiConfidence: 0.41,
      nextAction: "Route to VIP manager immediately",
      message: "Need two adjacent tables and custom champagne parade.",
      reservationStatus: "DEPOSIT_PENDING" as const,
      depositAmountCents: 40000,
    },
    {
      venueId: solstice.id,
      tableOptionId: solsticeMain.id,
      guestName: "Maya R.",
      channel: "SMS" as const,
      status: "QUALIFYING" as const,
      requestedAt: threeDaysAgo,
      requestedDateLabel: "Friday, 10:45 PM",
      partySize: 5,
      spendIntentLabel: "$800-$1,200",
      spendIntentMinCents: 80000,
      spendIntentMaxCents: 120000,
      aiConfidence: 0.63,
      nextAction: "Clarify Friday upsell policy and re-offer main room table.",
      message: "Looking for a girls night table, not too crazy on spend.",
      reservationStatus: "PENDING" as const,
      depositAmountCents: 25000,
    },
    {
      venueId: solstice.id,
      tableOptionId: solsticeMain.id,
      guestName: "Nia T.",
      channel: "INSTAGRAM_DM" as const,
      status: "CONFIRMED" as const,
      requestedAt: tenDaysAgo,
      requestedDateLabel: "Saturday, 11:00 PM",
      partySize: 6,
      spendIntentLabel: "$1,200-$1,500",
      spendIntentMinCents: 120000,
      spendIntentMaxCents: 150000,
      aiConfidence: 0.94,
      nextAction: "Send host confirmation and birthday note.",
      message: "Deposit paid. See you Saturday.",
      reservationStatus: "CONFIRMED" as const,
      depositAmountCents: 25000,
    },
    {
      venueId: monarch.id,
      tableOptionId: monarchMain.id,
      guestName: "Darren S.",
      channel: "SMS" as const,
      status: "NEEDS_HUMAN" as const,
      requestedAt: seventeenDaysAgo,
      requestedDateLabel: "Saturday, 1:00 AM",
      partySize: 10,
      spendIntentLabel: "$2,500-$3,500",
      spendIntentMinCents: 250000,
      spendIntentMaxCents: 350000,
      aiConfidence: 0.52,
      nextAction: "AI paused. Manual follow-up required for pending demand.",
      message: "Can someone call me back? Ready to book tonight.",
      reservationStatus: "PENDING" as const,
      depositAmountCents: 60000,
    },
  ];

  for (const item of seedInquiries) {
    const inquiry = await repository.inquiry.create({
      data: {
        venueId: item.venueId,
        guestName: item.guestName,
        channel: item.channel,
        status: item.status,
        requestedAt: item.requestedAt,
        requestedDateLabel: item.requestedDateLabel,
        partySize: item.partySize,
        spendIntentLabel: item.spendIntentLabel,
        spendIntentMinCents: item.spendIntentMinCents,
        spendIntentMaxCents: item.spendIntentMaxCents,
        aiConfidence: item.aiConfidence,
        nextAction: item.nextAction,
        isHumanTakeover: item.status === "NEEDS_HUMAN",
      },
    } as never);

    await repository.inquiryMessage.create({
      data: {
        inquiryId: (inquiry as { id: string }).id,
        authorRole: "guest",
        content: item.message,
      },
    });

    await repository.reservation.create({
      data: {
        inquiryId: (inquiry as { id: string }).id,
        tableOptionId: item.tableOptionId,
        status: item.reservationStatus,
        depositAmountCents: item.depositAmountCents,
        depositPaidCents: item.reservationStatus === "CONFIRMED" ? item.depositAmountCents : 0,
        confirmationCode: `${item.guestName.split(" ")[0].toUpperCase()}-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 6)
          .toUpperCase()}`,
        arrivalTimeLabel: item.requestedDateLabel,
      },
    });
  }
  await syncVenueAlerts(luma.id);
  await syncVenueAlerts(solstice.id);
  await syncVenueAlerts(monarch.id);
  await logActivity({
    entityType: "system",
    action: "platform.demo_seeded",
    summary: "Loaded demo venues, inquiries, and reservations.",
  });

  revalidatePath("/");
  revalidatePath("/venues");
  revalidatePath("/alerts");
  revalidatePath("/analytics");
}
