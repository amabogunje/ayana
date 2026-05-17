import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  buildWebsiteChatSnippet,
  isWebsiteChatListedInChannels,
  makeWebsiteChatWidgetKey,
} from "@/lib/website-chat-service";
import { saveVenueAssetUpload } from "@/lib/venue-assets";
import { hashOperatorPassword } from "@/lib/operator-auth";
import { sendStaffInviteEmail } from "@/lib/staff-invite-email";
import type {
  OperatorActivityItem,
  OperatorAlertItem,
  OperatorEventOverride,
  OperatorEventSeries,
  OperatorInboxItem,
  OperatorInquiryDetail,
  OperatorOverviewData,
  OperatorOverviewDepositPoint,
  OperatorOverviewEvent,
  OperatorOverviewReservation,
  OperatorReservationItem,
  OperatorTableOption,
  OperatorVenueAgentSettings,
  OperatorVenueAsset,
  OperatorVenueUserOption,
  OperatorVenueSettings,
  OperatorWorkflowTaskItem,
} from "@/lib/operator-types";
import { parseRecurringDays } from "@/lib/venue-knowledge-service";
import {
  buildVenueAgentConfigFromVenueCompatibility,
  getVenueAgentConfigForVenue,
} from "@/lib/venue-agent/venue-agent-config-service";
import type { VenueAgentAutonomyLevel } from "@/lib/venue-agent/venue-agent-types";

const allowedInquiryTransitions: Record<
  "NEW" | "QUALIFYING" | "QUOTED" | "DEPOSIT_SENT" | "CONFIRMED" | "NEEDS_HUMAN" | "LOST",
  Array<"NEW" | "QUALIFYING" | "QUOTED" | "DEPOSIT_SENT" | "CONFIRMED" | "NEEDS_HUMAN" | "LOST">
> = {
  NEW: ["QUALIFYING", "NEEDS_HUMAN", "LOST"],
  QUALIFYING: ["QUOTED", "NEEDS_HUMAN", "LOST"],
  QUOTED: ["QUALIFYING", "DEPOSIT_SENT", "NEEDS_HUMAN", "LOST"],
  DEPOSIT_SENT: ["CONFIRMED", "NEEDS_HUMAN", "LOST"],
  CONFIRMED: [],
  NEEDS_HUMAN: ["QUALIFYING", "QUOTED", "DEPOSIT_SENT", "CONFIRMED", "LOST"],
  LOST: ["QUALIFYING", "NEEDS_HUMAN"],
};

const allowedReservationTransitions: Record<
  "PENDING" | "DEPOSIT_PENDING" | "CONFIRMED" | "CANCELLED",
  Array<"PENDING" | "DEPOSIT_PENDING" | "CONFIRMED" | "CANCELLED">
> = {
  PENDING: ["DEPOSIT_PENDING", "CONFIRMED", "CANCELLED"],
  DEPOSIT_PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["CANCELLED"],
  CANCELLED: [],
};

export type OperatorVenueAgentConfigInput = {
  enabled: boolean;
  agentName: string;
  brandVoice: string;
  autonomyLevel: number;
  canAnswerFaqs: boolean;
  canQualifyLeads: boolean;
  canRecommendPackages: boolean;
  canCreateQuotes: boolean;
  canSendDepositLinks: boolean;
  canCreateReservations: boolean;
  confidenceThreshold: number;
  escalateOnLowConfidence: boolean;
  escalateForVipRequests: boolean;
  escalateForUnavailableInventory: boolean;
  escalateForOversizedParty: boolean;
  partySizeThreshold?: number | null;
  websiteChatEnabled: boolean;
  advancedInstructions: string;
};

function clampOperatorAutonomyLevel(value: number): VenueAgentAutonomyLevel {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 5) return 5;
  return Math.round(value) as VenueAgentAutonomyLevel;
}

function validateAgentText(value: string, label: string, maxLength: number) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }
  if (trimmed.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer.`);
  }
  return trimmed;
}

function validateOptionalAgentText(value: string, label: string, maxLength: number) {
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer.`);
  }
  return trimmed || null;
}

function validateConfidenceThreshold(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error("Confidence threshold must be between 0 and 1.");
  }
  return Number(value.toFixed(2));
}

function validatePartySizeThreshold(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  if (!Number.isFinite(value) || value < 1 || value > 999) {
    throw new Error("Party size threshold must be between 1 and 999 guests.");
  }
  return Math.round(value);
}

function formatRelative(date: Date) {
  const diffMs = Date.now() - new Date(date).getTime();
  const minutes = Math.max(1, Math.round(diffMs / 60000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.round(hours / 24)} day ago`;
}

function formatCurrencyCents(valueCents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(valueCents / 100);
}

function formatShortDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function makeDepositPoints(
  reservations: Array<{ updatedAt: Date; depositPaidCents: number }>,
): OperatorOverviewDepositPoint[] {
  const today = new Date();
  const points = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    return {
      date,
      label: new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date),
      valueCents: 0,
    };
  });

  for (const reservation of reservations) {
    const point = points.find(
      (item) =>
        item.date.getFullYear() === reservation.updatedAt.getFullYear() &&
        item.date.getMonth() === reservation.updatedAt.getMonth() &&
        item.date.getDate() === reservation.updatedAt.getDate(),
    );

    if (point) {
      point.valueCents += reservation.depositPaidCents;
    }
  }

  return points.map(({ label, valueCents }) => ({ label, valueCents }));
}

function mapOverviewReservation(reservation: {
  id: string;
  inquiryId: string;
  status: string;
  arrivalTimeLabel: string;
  depositAmountCents: number;
  depositPaidCents: number;
  inquiry: {
    guestName: string;
    partySize: number;
  };
  tableOption: {
    name: string;
  };
}): OperatorOverviewReservation {
  const remainingDepositCents = Math.max(0, reservation.depositAmountCents - reservation.depositPaidCents);
  const isPaid = remainingDepositCents === 0 && reservation.depositAmountCents > 0;
  const hasPartialDeposit = reservation.depositPaidCents > 0 && remainingDepositCents > 0;

  return {
    id: reservation.id,
    inquiryId: reservation.inquiryId,
    timeLabel: reservation.arrivalTimeLabel,
    guestName: reservation.inquiry.guestName,
    tableLabel: reservation.tableOption.name,
    partySizeLabel: `${reservation.inquiry.partySize} guest${reservation.inquiry.partySize === 1 ? "" : "s"}`,
    depositLabel: formatCurrencyCents(reservation.depositPaidCents || reservation.depositAmountCents),
    depositStatusLabel: isPaid
      ? "Deposit paid"
      : hasPartialDeposit
        ? `${formatCurrencyCents(remainingDepositCents)} due`
        : "Deposit pending",
    depositStatusTone: isPaid ? "success" : "warning",
  };
}

function mapOverviewEvents(input: {
  series: OperatorEventSeries[];
  overrides: OperatorEventOverride[];
}): OperatorOverviewEvent[] {
  const overrideEvents = input.overrides
    .filter((item) => item.active && !item.isCancelled)
    .slice(0, 3)
    .map((item) => ({
      id: item.id,
      title: item.title ?? item.eventSeriesTitle ?? "Special event",
      dateLabel: formatShortDate(new Date(`${item.occurrenceDate}T00:00:00`)),
      timeLabel: "Venue schedule",
      statusLabel: "Upcoming",
      flyerUrl: item.flyer?.publicUrl ?? null,
    }));

  const seriesEvents = input.series
    .filter((item) => item.active)
    .slice(0, Math.max(0, 3 - overrideEvents.length))
    .map((item) => ({
      id: item.id,
      title: item.title,
      dateLabel: item.recurringDays.slice(0, 2).join(", ") || "Weekly",
      timeLabel: "Recurring night",
      statusLabel: "Live",
      flyerUrl: item.flyer?.publicUrl ?? null,
    }));

  return [...overrideEvents, ...seriesEvents];
}

function eventRepository() {
  return prisma as typeof prisma & {
    eventSeries?: {
      findMany: (args: Record<string, unknown>) => Promise<Array<Record<string, unknown>>>;
      create: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
      findFirst: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
    };
    eventOccurrenceOverride?: {
      findMany: (args: Record<string, unknown>) => Promise<Array<Record<string, unknown>>>;
      upsert: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
    };
  };
}

function assertInquiryTransition(
  current: "NEW" | "QUALIFYING" | "QUOTED" | "DEPOSIT_SENT" | "CONFIRMED" | "NEEDS_HUMAN" | "LOST",
  next: "NEW" | "QUALIFYING" | "QUOTED" | "DEPOSIT_SENT" | "CONFIRMED" | "NEEDS_HUMAN" | "LOST",
) {
  if (current === next) return;
  if (!allowedInquiryTransitions[current].includes(next)) {
    throw new Error(`Cannot move inquiry from ${current} to ${next}.`);
  }
}

function assertReservationTransition(
  current: "PENDING" | "DEPOSIT_PENDING" | "CONFIRMED" | "CANCELLED",
  next: "PENDING" | "DEPOSIT_PENDING" | "CONFIRMED" | "CANCELLED",
) {
  if (current === next) return;
  if (!allowedReservationTransitions[current].includes(next)) {
    throw new Error(`Cannot move reservation from ${current} to ${next}.`);
  }
}

function validateReservationFinancials(input: {
  status: "PENDING" | "DEPOSIT_PENDING" | "CONFIRMED" | "CANCELLED";
  depositAmountCents: number;
  depositPaidCents: number;
}) {
  if (input.depositPaidCents < 0) {
    throw new Error("Deposit paid cannot be negative.");
  }

  if (input.depositPaidCents > input.depositAmountCents) {
    throw new Error("Deposit paid cannot exceed the required deposit.");
  }

  if (input.status === "CONFIRMED" && input.depositPaidCents < input.depositAmountCents) {
    throw new Error("A reservation cannot be confirmed until the full deposit is paid.");
  }

  if (input.status === "PENDING" && input.depositPaidCents > 0) {
    throw new Error("Use Deposit Pending or Confirmed once payment has started.");
  }
}

function makeConfirmationCode(guestName: string) {
  const guestToken = guestName.split(" ")[0]?.toUpperCase().replace(/[^A-Z0-9]/g, "") || "GUEST";
  return `${guestToken}-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

async function logOperatorActivity(input: {
  actorVenueUserId?: string;
  venueId: string;
  entityType: string;
  entityId?: string;
  action: string;
  summary: string;
}) {
  const activityRepository = prisma as unknown as {
    activityLog: {
      create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
    };
  };

  await activityRepository.activityLog.create({
    data: {
      actorVenueUserId: input.actorVenueUserId ?? null,
      venueId: input.venueId,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      action: input.action,
      summary: input.summary,
    },
  });
}

function mapInboxItem(inquiry: {
  id: string;
  guestName: string;
  channel: string;
  status: string;
  requestedDateLabel: string;
  partySize: number;
  spendIntentLabel: string;
  nextAction: string;
  aiConfidence: number;
  isHumanTakeover: boolean;
  updatedAt: Date;
  messages: Array<{ content: string }>;
  assignedVenueUser?: { fullName: string } | null;
  reservation?: { status: string } | null;
}): OperatorInboxItem {
  return {
    id: inquiry.id,
    guestName: inquiry.guestName,
    channel: inquiry.channel,
    status: inquiry.status,
    requestedDateLabel: inquiry.requestedDateLabel,
    partySize: inquiry.partySize,
    spendIntentLabel: inquiry.spendIntentLabel,
    nextAction: inquiry.nextAction,
    aiConfidence: inquiry.aiConfidence,
    isHumanTakeover: inquiry.isHumanTakeover,
    updatedAt: formatRelative(inquiry.updatedAt),
    assignedTo: inquiry.assignedVenueUser?.fullName,
    lastMessage: inquiry.messages[0]?.content ?? "No guest message yet.",
    reservationStatus: inquiry.reservation?.status,
  };
}

export async function listOperatorInbox(
  venueId: string,
  filter?: "all" | "needs-human" | "quoted" | "deposit-pending" | "confirmed" | "unassigned",
) {
  const whereClause =
    filter === "needs-human"
      ? { venueId, isHumanTakeover: true }
      : filter === "quoted"
        ? { venueId, status: "QUOTED" as const }
        : filter === "deposit-pending"
          ? { venueId, reservation: { is: { status: "DEPOSIT_PENDING" as const } } }
          : filter === "confirmed"
            ? { venueId, reservation: { is: { status: "CONFIRMED" as const } } }
            : filter === "unassigned"
              ? { venueId, assignedVenueUserId: null }
              : { venueId };

  const inquiries = await prisma.inquiry.findMany({
    where: whereClause,
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      reservation: true,
      assignedVenueUser: {
        select: { fullName: true },
      },
    },
    orderBy: [{ isHumanTakeover: "desc" }, { updatedAt: "desc" }],
  });

  return inquiries.map(mapInboxItem);
}

export async function getOperatorInquiry(venueId: string, inquiryId: string): Promise<OperatorInquiryDetail | null> {
  const inquiry = await prisma.inquiry.findFirst({
    where: {
      id: inquiryId,
      venueId,
    },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
      quoteOptions: {
        include: {
          tableOption: {
            select: {
              id: true,
              name: true,
              code: true,
              minSpendCents: true,
              depositAmountCents: true,
              capacityMin: true,
              capacityMax: true,
            },
          },
        },
        orderBy: { sentAt: "asc" },
      },
      reservation: {
        include: {
          tableOption: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      },
      assignedVenueUser: {
        select: { fullName: true },
      },
    },
  });

  if (!inquiry) return null;

  return {
    id: inquiry.id,
    guestName: inquiry.guestName,
    phone: inquiry.phone,
    instagramHandle: inquiry.instagramHandle,
    channel: inquiry.channel,
    status: inquiry.status,
    requestedDateLabel: inquiry.requestedDateLabel,
    partySize: inquiry.partySize,
    spendIntentLabel: inquiry.spendIntentLabel,
    spendIntentMinCents: inquiry.spendIntentMinCents,
    spendIntentMaxCents: inquiry.spendIntentMaxCents,
    occasion: inquiry.occasion,
    aiConfidence: inquiry.aiConfidence,
    nextAction: inquiry.nextAction,
    isHumanTakeover: inquiry.isHumanTakeover,
    assignedVenueUserId: inquiry.assignedVenueUserId,
    assignedTo: inquiry.assignedVenueUser?.fullName,
    messages: inquiry.messages.map((message) => ({
      id: message.id,
      authorRole: message.authorRole,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    })),
    aiSummary: inquiry.channel === "WEBSITE_CHAT"
      ? {
          capturedFields: [
            { label: "Requested night", value: inquiry.requestedDateLabel },
            { label: "Party size", value: `${inquiry.partySize} guest${inquiry.partySize === 1 ? "" : "s"}` },
            { label: "Spend intent", value: inquiry.spendIntentLabel },
            { label: "Occasion", value: inquiry.occasion ?? "Not provided yet" },
            { label: "Phone", value: inquiry.phone ?? "Not provided yet" },
          ],
          latestAiMessage: [...inquiry.messages].reverse().find((message) => message.authorRole === "ai")?.content,
          draftQuoteCount: inquiry.quoteOptions.filter((quote) => !quote.sentAt).length,
          needsHumanReason: inquiry.isHumanTakeover ? inquiry.nextAction : undefined,
        }
      : undefined,
    quoteOptions: inquiry.quoteOptions.map((quote) => ({
      id: quote.id,
      label: quote.label,
      pitch: quote.pitch,
      sentAt: quote.sentAt?.toISOString() ?? null,
      tableOption: quote.tableOption,
    })),
    reservation: inquiry.reservation
      ? {
          id: inquiry.reservation.id,
          status: inquiry.reservation.status,
          depositAmountCents: inquiry.reservation.depositAmountCents,
          depositPaidCents: inquiry.reservation.depositPaidCents,
          confirmationCode: inquiry.reservation.confirmationCode,
          arrivalTimeLabel: inquiry.reservation.arrivalTimeLabel,
          notes: inquiry.reservation.notes,
          tableOption: inquiry.reservation.tableOption,
        }
      : null,
  };
}

export async function updateOperatorInquiryStatus(
  venueId: string,
  inquiryId: string,
  status: "NEW" | "QUALIFYING" | "QUOTED" | "DEPOSIT_SENT" | "CONFIRMED" | "NEEDS_HUMAN" | "LOST",
  actorVenueUserId?: string,
) {
  const inquiry = await prisma.inquiry.findFirst({
    where: {
      id: inquiryId,
      venueId,
    },
    select: {
      id: true,
      guestName: true,
      venueId: true,
      status: true,
    },
  });

  if (!inquiry) {
    throw new Error("Inquiry not found.");
  }

  assertInquiryTransition(inquiry.status, status);

  const updated = await prisma.inquiry.update({
    where: { id: inquiry.id },
    data: {
      status,
      isHumanTakeover: status === "NEEDS_HUMAN",
    },
  });

  await logOperatorActivity({
    actorVenueUserId,
    venueId,
    entityType: "inquiry",
    entityId: updated.id,
    action: "operator.inquiry_status_updated",
    summary: `Updated ${updated.guestName} inquiry to ${status}.`,
  });

  revalidatePath("/operator");
  revalidatePath("/operator/inbox");

  return updated;
}

export async function listOperatorVenueUsers(venueId: string): Promise<OperatorVenueUserOption[]> {
  const users = await prisma.venueUser.findMany({
    where: {
      venueId,
      isActive: true,
    },
    orderBy: [{ fullName: "asc" }],
  });

  return users.map((user) => ({
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    inviteAcceptedAt: user.inviteAcceptedAt?.toISOString() ?? null,
  }));
}

export async function assignOperatorInquiry(
  venueId: string,
  inquiryId: string,
  assignedVenueUserId: string | null,
  actorVenueUserId?: string,
) {
  const inquiry = await prisma.inquiry.findFirst({
    where: {
      id: inquiryId,
      venueId,
    },
    select: {
      id: true,
      guestName: true,
      status: true,
    },
  });

  if (!inquiry) {
    throw new Error("Inquiry not found.");
  }

  if (inquiry.status === "CONFIRMED" || inquiry.status === "LOST") {
    throw new Error("Cannot create a quote for a closed inquiry.");
  }

  let assigneeName = "Unassigned";
  if (assignedVenueUserId) {
    const assignee = await prisma.venueUser.findFirst({
      where: {
        id: assignedVenueUserId,
        venueId,
        isActive: true,
      },
      select: {
        fullName: true,
      },
    });

    if (!assignee) {
      throw new Error("Assignee not found.");
    }
    assigneeName = assignee.fullName;
  }

  const updated = await prisma.inquiry.update({
    where: { id: inquiry.id },
    data: {
      assignedVenueUserId,
    },
  });

  await logOperatorActivity({
    actorVenueUserId,
    venueId,
    entityType: "inquiry",
    entityId: updated.id,
    action: assignedVenueUserId ? "operator.inquiry_assigned" : "operator.inquiry_unassigned",
    summary: `${assignedVenueUserId ? "Assigned" : "Cleared assignment for"} ${inquiry.guestName}${assignedVenueUserId ? ` to ${assigneeName}` : ""}.`,
  });

  revalidatePath(`/operator/inbox/${inquiry.id}`);
  revalidatePath("/operator/inbox");

  return updated;
}

export async function addOperatorMessage(
  venueId: string,
  inquiryId: string,
  content: string,
  actorVenueUserId?: string,
) {
  const inquiry = await prisma.inquiry.findFirst({
    where: {
      id: inquiryId,
      venueId,
    },
    select: {
      id: true,
      guestName: true,
      status: true,
    },
  });

  if (!inquiry) {
    throw new Error("Inquiry not found.");
  }

  const message = await prisma.inquiryMessage.create({
    data: {
      inquiryId: inquiry.id,
      authorRole: "operator",
      content,
    },
  });

  await prisma.inquiry.update({
    where: { id: inquiry.id },
    data: {
      lastOutboundAt: new Date(),
      status:
        inquiry.status === "NEW" || inquiry.status === "NEEDS_HUMAN"
          ? "QUALIFYING"
          : undefined,
      isHumanTakeover: false,
      nextAction: "Await guest reply or continue follow-up.",
    },
  });

  await logOperatorActivity({
    actorVenueUserId,
    venueId,
    entityType: "inquiry_message",
    entityId: message.id,
    action: "operator.message_sent",
    summary: `Sent operator reply to ${inquiry.guestName}.`,
  });

  revalidatePath(`/operator/inbox/${inquiry.id}`);
  revalidatePath("/operator/inbox");

  return message;
}

export async function listOperatorTableOptions(venueId: string): Promise<OperatorTableOption[]> {
  const tableOptions = await prisma.tableOption.findMany({
    where: {
      venueId,
      active: true,
    },
    orderBy: [{ minSpendCents: "asc" }, { name: "asc" }],
  });

  return tableOptions.map((option) => ({
    id: option.id,
    name: option.name,
    code: option.code,
    minSpendCents: option.minSpendCents,
    depositAmountCents: option.depositAmountCents,
    capacityMin: option.capacityMin,
    capacityMax: option.capacityMax,
    quantity: option.quantity,
    description: option.description,
  }));
}

export async function createOperatorQuote(
  venueId: string,
  inquiryId: string,
  input: {
    tableOptionId: string;
    label: string;
    pitch: string;
    markSent: boolean;
  },
  actorVenueUserId?: string,
) {
  const inquiry = await prisma.inquiry.findFirst({
    where: {
      id: inquiryId,
      venueId,
    },
    select: {
      id: true,
      guestName: true,
    },
  });

  if (!inquiry) {
    throw new Error("Inquiry not found.");
  }

  const tableOption = await prisma.tableOption.findFirst({
    where: {
      id: input.tableOptionId,
      venueId,
      active: true,
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!tableOption) {
    throw new Error("Table option not found.");
  }

  const quote = await prisma.quoteOption.create({
    data: {
      inquiryId: inquiry.id,
      tableOptionId: tableOption.id,
      label: input.label,
      pitch: input.pitch,
      sentAt: input.markSent ? new Date() : null,
    },
  });

  await prisma.inquiry.update({
    where: { id: inquiry.id },
    data: {
      status: "QUOTED",
      isHumanTakeover: false,
      lastOutboundAt: input.markSent ? new Date() : undefined,
      nextAction: input.markSent
        ? `Follow up on quoted option: ${input.label}.`
        : `Review draft quote for ${tableOption.name}.`,
    },
  });

  await logOperatorActivity({
    actorVenueUserId,
    venueId,
    entityType: "quote_option",
    entityId: quote.id,
    action: input.markSent ? "operator.quote_sent" : "operator.quote_created",
    summary: `${input.markSent ? "Sent" : "Created"} quote ${input.label} for ${inquiry.guestName}.`,
  });

  revalidatePath(`/operator/inbox/${inquiry.id}`);
  revalidatePath("/operator/inbox");

  return quote;
}

export async function createOperatorReservation(
  venueId: string,
  inquiryId: string,
  input: {
    tableOptionId: string;
    status: "PENDING" | "DEPOSIT_PENDING" | "CONFIRMED" | "CANCELLED";
    depositPaidDollars: number;
    notes: string;
    arrivalTimeLabel: string;
  },
  actorVenueUserId?: string,
) {
  const inquiry = await prisma.inquiry.findFirst({
    where: {
      id: inquiryId,
      venueId,
    },
    include: {
      reservation: true,
    },
  });

  if (!inquiry) {
    throw new Error("Inquiry not found.");
  }

  if (inquiry.reservation) {
    throw new Error("Reservation already exists for this inquiry.");
  }

  const tableOption = await prisma.tableOption.findFirst({
    where: {
      id: input.tableOptionId,
      venueId,
      active: true,
    },
  });

  if (!tableOption) {
    throw new Error("Table option not found.");
  }

  if (inquiry.status === "LOST" || inquiry.status === "CONFIRMED") {
    throw new Error("Cannot create a reservation from a closed inquiry.");
  }

  const depositPaidCents = Math.max(0, Math.round(input.depositPaidDollars * 100));
  validateReservationFinancials({
    status: input.status,
    depositAmountCents: tableOption.depositAmountCents,
    depositPaidCents,
  });
  const reservation = await prisma.reservation.create({
    data: {
      inquiryId: inquiry.id,
      tableOptionId: tableOption.id,
      status: input.status,
      depositAmountCents: tableOption.depositAmountCents,
      depositPaidCents,
      confirmationCode: makeConfirmationCode(inquiry.guestName),
      arrivalTimeLabel: input.arrivalTimeLabel || inquiry.requestedDateLabel,
      notes: input.notes || null,
    },
  });

  const inquiryStatus = input.status === "CONFIRMED" ? "CONFIRMED" : input.status === "DEPOSIT_PENDING" ? "DEPOSIT_SENT" : "QUALIFYING";
  await prisma.inquiry.update({
    where: { id: inquiry.id },
    data: {
      status: inquiryStatus,
      nextAction:
        input.status === "CONFIRMED"
          ? "Reservation confirmed. Send final host confirmation."
          : "Track reservation and deposit progress.",
    },
  });

  await logOperatorActivity({
    actorVenueUserId,
    venueId,
    entityType: "reservation",
    entityId: reservation.id,
    action: "operator.reservation_created",
    summary: `Created reservation for ${inquiry.guestName}.`,
  });

  revalidatePath(`/operator/inbox/${inquiry.id}`);
  revalidatePath("/operator/inbox");
  revalidatePath("/operator/reservations");

  return reservation;
}

export async function createOperatorStaffReservation(
  venueId: string,
  input: {
    guestName: string;
    phone?: string;
    requestedDateLabel: string;
    partySize: number;
    tableOptionId: string;
    depositPaidDollars?: number;
    arrivalTimeLabel: string;
    notes: string;
  },
  actorVenueUserId?: string,
) {
  const guestName = input.guestName.trim();
  const requestedDateLabel = input.requestedDateLabel.trim() || "Not provided yet";
  const arrivalTimeLabel = input.arrivalTimeLabel.trim();

  if (!guestName) {
    throw new Error("Guest name is required.");
  }

  if (!arrivalTimeLabel) {
    throw new Error("Arrival time is required.");
  }

  if (!Number.isInteger(input.partySize) || input.partySize < 1) {
    throw new Error("Party size must be at least 1.");
  }

  const [tableOption, creator] = await Promise.all([
    prisma.tableOption.findFirst({
      where: {
        id: input.tableOptionId,
        venueId,
        active: true,
      },
    }),
    actorVenueUserId
      ? prisma.venueUser.findFirst({
          where: {
            id: actorVenueUserId,
            venueId,
          },
          select: {
            fullName: true,
          },
        })
      : null,
  ]);

  if (!tableOption) {
    throw new Error("Table option not found.");
  }

  const depositPaidCents =
    typeof input.depositPaidDollars === "number" && Number.isFinite(input.depositPaidDollars)
      ? Math.max(0, Math.round(input.depositPaidDollars * 100))
      : 0;
  const creatorName = creator?.fullName ?? "Venue staff";

  const inquiry = await prisma.inquiry.create({
    data: {
      venueId,
      assignedVenueUserId: creator ? actorVenueUserId : null,
      guestName,
      phone: input.phone?.trim() || null,
      channel: "MANUAL",
      status: "CONFIRMED",
      requestedAt: new Date(),
      lastInboundAt: new Date(),
      requestedDateLabel,
      partySize: input.partySize,
      spendIntentLabel: `${formatCurrencyCents(tableOption.minSpendCents)} minimum`,
      spendIntentMinCents: tableOption.minSpendCents,
      spendIntentMaxCents: null,
      occasion: null,
      aiConfidence: 1,
      nextAction: "Staff-created reservation. Keep table ready.",
      isHumanTakeover: false,
      messages: {
        create: [
          {
            authorRole: "operator",
            content: `${creatorName} manually created this confirmed reservation.`,
          },
        ],
      },
    },
  });

  const reservation = await prisma.reservation.create({
    data: {
      inquiryId: inquiry.id,
      tableOptionId: tableOption.id,
      status: "CONFIRMED",
      depositAmountCents: tableOption.depositAmountCents,
      depositPaidCents,
      confirmationCode: makeConfirmationCode(guestName),
      arrivalTimeLabel,
      notes: input.notes.trim() || null,
    },
  });

  await logOperatorActivity({
    actorVenueUserId,
    venueId,
    entityType: "reservation",
    entityId: reservation.id,
    action: "operator.staff_reservation_created",
    summary: `${creatorName} created manual reservation for ${guestName}.`,
  });

  revalidatePath("/operator");
  revalidatePath("/operator/inbox");
  revalidatePath("/operator/reservations");

  return reservation;
}

export async function updateOperatorReservation(
  venueId: string,
  inquiryId: string,
  input: {
    status: "PENDING" | "DEPOSIT_PENDING" | "CONFIRMED" | "CANCELLED";
    depositPaidDollars: number;
    notes: string;
  },
  actorVenueUserId?: string,
) {
  const inquiry = await prisma.inquiry.findFirst({
    where: {
      id: inquiryId,
      venueId,
    },
    include: {
      reservation: true,
    },
  });

  if (!inquiry?.reservation) {
    throw new Error("Reservation not found.");
  }

  const depositPaidCents = Math.max(0, Math.round(input.depositPaidDollars * 100));
  assertReservationTransition(inquiry.reservation.status, input.status);
  validateReservationFinancials({
    status: input.status,
    depositAmountCents: inquiry.reservation.depositAmountCents,
    depositPaidCents,
  });
  const reservation = await prisma.reservation.update({
    where: {
      id: inquiry.reservation.id,
    },
    data: {
      status: input.status,
      depositPaidCents,
      notes: input.notes || null,
    },
  });

  const inquiryStatus =
    input.status === "CONFIRMED"
      ? "CONFIRMED"
      : input.status === "DEPOSIT_PENDING"
        ? "DEPOSIT_SENT"
        : input.status === "CANCELLED"
          ? "LOST"
          : "QUALIFYING";
  assertInquiryTransition(inquiry.status, inquiryStatus);

  await prisma.inquiry.update({
    where: { id: inquiry.id },
    data: {
      status: inquiryStatus,
      nextAction:
        input.status === "CONFIRMED"
          ? "Reservation confirmed. Send final host confirmation."
          : input.status === "CANCELLED"
            ? "Reservation cancelled. Archive or recover if guest re-engages."
            : "Continue reservation follow-up.",
    },
  });

  await logOperatorActivity({
    actorVenueUserId,
    venueId,
    entityType: "reservation",
    entityId: reservation.id,
    action: "operator.reservation_updated",
    summary: `Updated reservation for ${inquiry.guestName} to ${input.status}.`,
  });

  revalidatePath(`/operator/inbox/${inquiry.id}`);
  revalidatePath("/operator/inbox");
  revalidatePath("/operator/reservations");

  return reservation;
}

export async function listOperatorReservations(venueId: string): Promise<OperatorReservationItem[]> {
  const reservations = await prisma.reservation.findMany({
    where: {
      inquiry: {
        venueId,
      },
    },
    include: {
      inquiry: {
        select: {
          id: true,
          guestName: true,
          requestedDateLabel: true,
          assignedVenueUser: {
            select: {
              fullName: true,
            },
          },
        },
      },
      tableOption: {
        select: {
          name: true,
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  return reservations.map((reservation) => ({
    id: reservation.id,
    inquiryId: reservation.inquiry.id,
    guestName: reservation.inquiry.guestName,
    sourceName: reservation.inquiry.assignedVenueUser?.fullName ?? "AI Host",
    status: reservation.status,
    arrivalTimeLabel: reservation.arrivalTimeLabel,
    depositAmountCents: reservation.depositAmountCents,
    depositPaidCents: reservation.depositPaidCents,
    confirmationCode: reservation.confirmationCode,
    tableOptionName: reservation.tableOption.name,
    requestedDateLabel: reservation.inquiry.requestedDateLabel,
  }));
}

export async function getOperatorOverview(venueId: string): Promise<OperatorOverviewData> {
  const [inquiries, reservations, tableOptions, series, overrides] = await Promise.all([
    listOperatorInbox(venueId),
    prisma.reservation.findMany({
      where: {
        inquiry: {
          venueId,
        },
      },
      include: {
        inquiry: {
          select: {
            id: true,
            guestName: true,
            partySize: true,
            requestedAt: true,
            requestedDateLabel: true,
          },
        },
        tableOption: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }],
    }),
    prisma.tableOption.findMany({
      where: {
        venueId,
        active: true,
      },
      select: {
        quantity: true,
        capacityMax: true,
      },
    }),
    listOperatorEventSeries(venueId),
    listOperatorEventOverrides(venueId),
  ]);

  const openInquiries = inquiries.filter((item) => item.status !== "CONFIRMED" && item.status !== "LOST").length;
  const confirmedReservations = reservations.filter((item) => item.status === "CONFIRMED");
  const depositPendingReservations = reservations.filter((item) => item.status === "DEPOSIT_PENDING");
  const collectedDepositCents = reservations.reduce((total, item) => total + item.depositPaidCents, 0);
  const pendingDepositCents = depositPendingReservations.reduce(
    (total, item) => total + Math.max(0, item.depositAmountCents - item.depositPaidCents),
    0,
  );
  const occupiedSeats = confirmedReservations.reduce((total, item) => total + item.inquiry.partySize, 0);
  const totalSeats = tableOptions.reduce((total, item) => total + item.quantity * item.capacityMax, 0);
  const occupancyPercent = totalSeats > 0 ? Math.min(100, Math.round((occupiedSeats / totalSeats) * 100)) : 0;

  return {
    metrics: [
      {
        label: "Open inquiries",
        value: String(openInquiries),
        detail: `${inquiries.filter((item) => item.isHumanTakeover).length} need a human response`,
        tone: "purple",
      },
      {
        label: "Reservations",
        value: String(reservations.length),
        detail: `${confirmedReservations.length} confirmed bookings`,
        tone: "blue",
      },
      {
        label: "Collected deposits",
        value: formatCurrencyCents(collectedDepositCents),
        detail: "Recorded from reservation deposits",
        tone: "green",
      },
      {
        label: "Table occupancy",
        value: `${occupancyPercent}%`,
        detail: `${occupiedSeats} / ${totalSeats || 0} seats`,
        tone: "purple",
      },
      {
        label: "Deposit pending",
        value: String(depositPendingReservations.length),
        detail: `${formatCurrencyCents(pendingDepositCents)} outstanding`,
        tone: "cyan",
      },
    ],
    reservationsTonight: reservations.slice(0, 4).map(mapOverviewReservation),
    depositOverview: {
      totalCollectedCents: collectedDepositCents,
      periodLabel: "Last 7 days",
      points: makeDepositPoints(reservations),
    },
    inboxPreview: inquiries.slice(0, 3),
    upcomingEvents: mapOverviewEvents({ series, overrides }),
    alerts: [],
    quickActions: [
      { label: "New Reservation", href: "/operator/inbox", tone: "purple" },
      { label: "Walk-in Guest", href: "/operator/reservations", tone: "blue" },
      { label: "Block Date", href: "/operator/events", tone: "cyan" },
      { label: "Send Message", href: "/operator/inbox", tone: "blue" },
      { label: "Create Event", href: "/operator/events", tone: "purple" },
    ],
  };
}

export async function getOperatorVenueSettings(venueId: string): Promise<OperatorVenueSettings | null> {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
  });

  if (!venue) return null;

  const assetRepository = prisma as typeof prisma & {
    venueAsset?: {
      findMany: (args: Record<string, unknown>) => Promise<
        Array<{
          id: string;
          type: "BOTTLE_MENU" | "FOOD_MENU" | "HOOKAH_MENU" | "EVENT_FLYER";
          label: string;
          publicUrl: string;
          fileName: string;
          mimeType: string;
          eventSeriesId: string | null;
          eventOverrideId: string | null;
          createdAt: Date;
        }>
      >;
    };
  };

  const assets = assetRepository.venueAsset
    ? await assetRepository.venueAsset.findMany({
        where: {
          venueId,
          active: true,
        },
        orderBy: { createdAt: "desc" },
      })
    : [];
  const staffUsers = await listOperatorVenueUsers(venueId);

  return {
    id: venue.id,
    slug: venue.slug,
    name: venue.name,
    addressLine1: venue.addressLine1,
    city: venue.city,
    state: venue.state,
    postalCode: venue.postalCode,
    phoneNumber: venue.phoneNumber,
    timezone: venue.timezone,
    channelsSummary: venue.channelsSummary,
    hoursSummary: venue.hoursSummary,
    primaryOperatorName: venue.primaryOperatorName,
    primaryOperatorRole: venue.primaryOperatorRole,
    primaryOperatorEmail: venue.primaryOperatorEmail,
      brandTone: venue.brandTone,
      depositPolicy: venue.depositPolicy,
      servesFood: venue.servesFood,
      servesHookah: venue.servesHookah,
      hasParking: venue.hasParking,
      hasValet: venue.hasValet,
      dressCodeSummary: venue.dressCodeSummary,
      agePolicySummary: venue.agePolicySummary,
      aiEnabled: venue.aiEnabled,
      status: venue.status,
    responseSlaSeconds: venue.responseSlaSeconds,
    websiteChatEnabled: venue.websiteChatEnabled,
    websiteChatWidgetKey: venue.websiteChatWidgetKey,
    websiteChatAllowedOrigins: venue.websiteChatAllowedOrigins,
    websiteChatWelcomeMessage: venue.websiteChatWelcomeMessage,
      websiteChatPromptPlaceholder: venue.websiteChatPromptPlaceholder,
      depositCheckoutMode: venue.depositCheckoutMode,
      stripeConnectAccountId: venue.stripeConnectAccountId,
      stripeOnboardingComplete: venue.stripeOnboardingComplete,
      stripeChargesEnabled: venue.stripeChargesEnabled,
      stripePayoutsEnabled: venue.stripePayoutsEnabled,
      websiteChatInstallSnippet:
        venue.websiteChatWidgetKey && process.env.NEXT_PUBLIC_APP_URL
          ? buildWebsiteChatSnippet({
              appUrl: process.env.NEXT_PUBLIC_APP_URL,
              widgetKey: venue.websiteChatWidgetKey,
            })
          : null,
      staffUsers,
      assets: assets.map((asset) => ({
        id: asset.id,
        type: asset.type,
        label: asset.label,
        publicUrl: asset.publicUrl,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        eventSeriesId: asset.eventSeriesId,
        eventOverrideId: asset.eventOverrideId,
        createdAt: asset.createdAt.toISOString(),
      })),
    };
}

export async function getOperatorVenueAgentSettings(venueId: string): Promise<OperatorVenueAgentSettings | null> {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: {
      id: true,
      name: true,
      brandTone: true,
      aiEnabled: true,
      websiteChatEnabled: true,
      websiteChatWidgetKey: true,
    },
  });

  if (!venue) return null;

  const config = await getVenueAgentConfigForVenue({
    venueId: venue.id,
    venueName: venue.name,
    brandTone: venue.brandTone,
    aiEnabled: venue.aiEnabled,
    websiteChatEnabled: venue.websiteChatEnabled,
  });

  return {
    venue,
    config: {
      id: config.id,
      source: config.source,
      enabled: config.enabled,
      agentName: config.agentName,
      brandVoice: config.brandVoice,
      autonomyLevel: config.autonomyLevel,
      confidenceThreshold: config.confidenceThreshold,
      enabledChannels: config.enabledChannels,
      actionPermissions: config.actionPermissions,
      escalationRules: config.escalationRules,
      followUpRules: config.followUpRules,
      advancedInstructions: config.advancedInstructions,
    },
  };
}

export async function updateOperatorVenueAgentConfig(
  venueId: string,
  input: OperatorVenueAgentConfigInput,
  actorVenueUserId?: string,
) {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: {
      id: true,
      name: true,
      brandTone: true,
      aiEnabled: true,
      websiteChatEnabled: true,
    },
  });

  if (!venue) {
    throw new Error("Venue not found.");
  }

  const agentName = validateAgentText(input.agentName, "Agent name", 80);
  const brandVoice = validateAgentText(input.brandVoice, "Brand voice", 800);
  const advancedInstructions = validateOptionalAgentText(input.advancedInstructions, "Advanced instructions", 3000);
  const autonomyLevel = clampOperatorAutonomyLevel(input.autonomyLevel);
  const confidenceThreshold = validateConfidenceThreshold(input.confidenceThreshold);
  const partySizeThreshold = validatePartySizeThreshold(input.partySizeThreshold);
  const enabledChannels = input.websiteChatEnabled ? "WEBSITE_CHAT" : "";

  const updated = await prisma.venueAgentConfig.upsert({
    where: { venueId },
    create: {
      venueId,
      enabled: input.enabled,
      agentName,
      brandVoice,
      autonomyLevel,
      canAnswerFaqs: input.canAnswerFaqs,
      canQualifyLeads: input.canQualifyLeads,
      canRecommendPackages: input.canRecommendPackages,
      canCreateQuotes: input.canCreateQuotes,
      canSendDepositLinks: input.canSendDepositLinks,
      canCreateReservations: input.canCreateReservations,
      confidenceThreshold,
      escalationRules: {
        escalateOnLowConfidence: input.escalateOnLowConfidence,
        lowConfidenceThreshold: confidenceThreshold,
        escalateForVipRequests: input.escalateForVipRequests,
        escalateForUnavailableInventory: input.escalateForUnavailableInventory,
        escalateForOversizedParty: input.escalateForOversizedParty,
        partySizeThreshold,
      },
      followUpRules: {
        enabled: false,
        unpaidDepositReminderHours: null,
        abandonedChatReminderHours: null,
      },
      advancedInstructions,
      enabledChannels,
    },
    update: {
      enabled: input.enabled,
      agentName,
      brandVoice,
      autonomyLevel,
      canAnswerFaqs: input.canAnswerFaqs,
      canQualifyLeads: input.canQualifyLeads,
      canRecommendPackages: input.canRecommendPackages,
      canCreateQuotes: input.canCreateQuotes,
      canSendDepositLinks: input.canSendDepositLinks,
      canCreateReservations: input.canCreateReservations,
      confidenceThreshold,
      escalationRules: {
        escalateOnLowConfidence: input.escalateOnLowConfidence,
        lowConfidenceThreshold: confidenceThreshold,
        escalateForVipRequests: input.escalateForVipRequests,
        escalateForUnavailableInventory: input.escalateForUnavailableInventory,
        escalateForOversizedParty: input.escalateForOversizedParty,
        partySizeThreshold,
      },
      advancedInstructions,
      enabledChannels,
    },
  });

  await logOperatorActivity({
    actorVenueUserId,
    venueId,
    entityType: "venue_agent_config",
    entityId: updated.id,
    action: "operator.agent_config_updated",
    summary: `Updated AI agent settings for ${venue.name}.`,
  });

  revalidatePath("/operator/settings/agent");
  revalidatePath("/operator/settings");

  return updated;
}

export async function resetOperatorVenueAgentConfig(venueId: string, actorVenueUserId?: string) {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: {
      id: true,
      name: true,
      brandTone: true,
      aiEnabled: true,
      websiteChatEnabled: true,
    },
  });

  if (!venue) {
    throw new Error("Venue not found.");
  }

  const defaults = buildVenueAgentConfigFromVenueCompatibility({
    venueId: venue.id,
    venueName: venue.name,
    brandTone: venue.brandTone,
    aiEnabled: venue.aiEnabled,
    websiteChatEnabled: venue.websiteChatEnabled,
  });

  const reset = await prisma.venueAgentConfig.upsert({
    where: { venueId },
    create: {
      venueId,
      enabled: defaults.enabled,
      agentName: defaults.agentName,
      brandVoice: defaults.brandVoice,
      autonomyLevel: defaults.autonomyLevel,
      canAnswerFaqs: defaults.actionPermissions.canAnswerFaqs,
      canQualifyLeads: defaults.actionPermissions.canQualifyLeads,
      canRecommendPackages: defaults.actionPermissions.canRecommendPackages,
      canCreateQuotes: defaults.actionPermissions.canCreateQuotes,
      canSendDepositLinks: defaults.actionPermissions.canSendDepositLinks,
      canCreateReservations: defaults.actionPermissions.canCreateReservations,
      confidenceThreshold: defaults.confidenceThreshold,
      escalationRules: defaults.escalationRules,
      followUpRules: defaults.followUpRules,
      advancedInstructions: defaults.advancedInstructions,
      enabledChannels: defaults.enabledChannels.includes("website_chat") ? "WEBSITE_CHAT" : "",
    },
    update: {
      enabled: defaults.enabled,
      agentName: defaults.agentName,
      brandVoice: defaults.brandVoice,
      autonomyLevel: defaults.autonomyLevel,
      canAnswerFaqs: defaults.actionPermissions.canAnswerFaqs,
      canQualifyLeads: defaults.actionPermissions.canQualifyLeads,
      canRecommendPackages: defaults.actionPermissions.canRecommendPackages,
      canCreateQuotes: defaults.actionPermissions.canCreateQuotes,
      canSendDepositLinks: defaults.actionPermissions.canSendDepositLinks,
      canCreateReservations: defaults.actionPermissions.canCreateReservations,
      confidenceThreshold: defaults.confidenceThreshold,
      escalationRules: defaults.escalationRules,
      followUpRules: defaults.followUpRules,
      advancedInstructions: defaults.advancedInstructions,
      enabledChannels: defaults.enabledChannels.includes("website_chat") ? "WEBSITE_CHAT" : "",
    },
  });

  await logOperatorActivity({
    actorVenueUserId,
    venueId,
    entityType: "venue_agent_config",
    entityId: reset.id,
    action: "operator.agent_config_reset",
    summary: `Reset AI agent settings for ${venue.name} to venue defaults.`,
  });

  revalidatePath("/operator/settings/agent");
  revalidatePath("/operator/settings");

  return reset;
}

export async function createOperatorVenueStaff(
  venueId: string,
  input: {
    fullName: string;
    email: string;
    role: "VENUE_OWNER" | "VENUE_MANAGER" | "VENUE_AGENT";
  },
  actorVenueUserId?: string,
) {
  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();

  if (!fullName || !email) {
    throw new Error("Staff name and email are required.");
  }

  const existing = await prisma.venueUser.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existing) {
    throw new Error("A staff user with that email already exists.");
  }

  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { name: true },
  });

  if (!venue) {
    throw new Error("Venue not found.");
  }

  const user = await prisma.venueUser.create({
    data: {
      venueId,
      fullName,
      email,
      role: input.role,
      passwordHash: hashOperatorPassword(randomBytes(32).toString("hex")),
      isActive: true,
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const inviteUrl = `${appUrl.replace(/\/$/, "")}/operator/invite/${user.id}`;
  await sendStaffInviteEmail({
    to: user.email,
    inviteeName: user.fullName,
    venueName: venue.name,
    inviteUrl,
  });

  await logOperatorActivity({
    actorVenueUserId,
    venueId,
    entityType: "venue_user",
    entityId: user.id,
    action: "operator.staff_invited",
    summary: `Invited staff user ${user.fullName}.`,
  });

  revalidatePath("/operator/settings");
  return { user, inviteUrl };
}

export async function updateOperatorVenueStaff(
  venueId: string,
  staffUserId: string,
  input: {
    fullName: string;
    email: string;
    role: "VENUE_MANAGER" | "VENUE_AGENT";
  },
  actorVenueUserId?: string,
) {
  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();

  if (!fullName || !email) {
    throw new Error("Staff name and email are required.");
  }

  const existing = await prisma.venueUser.findFirst({
    where: {
      id: staffUserId,
      venueId,
      isActive: true,
    },
  });

  if (!existing) {
    throw new Error("Staff user not found.");
  }

  if (existing.role === "VENUE_OWNER") {
    throw new Error("Protected users cannot be edited here.");
  }

  const emailOwner = await prisma.venueUser.findUnique({
    where: { email },
    select: { id: true },
  });

  if (emailOwner && emailOwner.id !== staffUserId) {
    throw new Error("A staff user with that email already exists.");
  }

  const user = await prisma.venueUser.update({
    where: { id: staffUserId },
    data: {
      fullName,
      email,
      role: input.role,
    },
  });

  await logOperatorActivity({
    actorVenueUserId,
    venueId,
    entityType: "venue_user",
    entityId: user.id,
    action: "operator.staff_updated",
    summary: `Updated staff user ${user.fullName}.`,
  });

  revalidatePath("/operator/settings");
  return user;
}

export async function deactivateOperatorVenueStaff(
  venueId: string,
  staffUserId: string,
  actorVenueUserId?: string,
) {
  const existing = await prisma.venueUser.findFirst({
    where: {
      id: staffUserId,
      venueId,
      isActive: true,
    },
  });

  if (!existing) {
    throw new Error("Staff user not found.");
  }

  if (existing.role === "VENUE_OWNER") {
    throw new Error("Protected users cannot be removed.");
  }

  const user = await prisma.venueUser.update({
    where: { id: staffUserId },
    data: {
      isActive: false,
    },
  });

  await prisma.venueSession.deleteMany({
    where: { userId: staffUserId },
  });

  await logOperatorActivity({
    actorVenueUserId,
    venueId,
    entityType: "venue_user",
    entityId: user.id,
    action: "operator.staff_deactivated",
    summary: `Removed staff user ${user.fullName}.`,
  });

  revalidatePath("/operator/settings");
  return user;
}

export async function updateOperatorVenueSettings(
  venueId: string,
    input: {
      addressLine1: string;
      city: string;
      state: string;
    postalCode: string;
    phoneNumber: string;
    timezone: string;
    hoursSummary: string;
      primaryOperatorName: string;
      primaryOperatorRole: string;
      primaryOperatorEmail: string;
      depositPolicy: string;
      servesFood: boolean;
      servesHookah: boolean;
      hasParking: boolean;
      hasValet: boolean;
      dressCodeSummary: string;
      agePolicySummary: string;
      websiteChatEnabled?: boolean;
      websiteChatAllowedOrigins?: string;
      websiteChatWelcomeMessage?: string;
    websiteChatPromptPlaceholder?: string;
      depositCheckoutMode: "MOCK" | "STRIPE_CONNECT";
      stripeConnectAccountId: string;
      stripeOnboardingComplete: boolean;
      stripeChargesEnabled: boolean;
      stripePayoutsEnabled: boolean;
  },
  actorVenueUserId?: string,
) {
  const existing = await prisma.venue.findUnique({
    where: { id: venueId },
    select: {
      id: true,
      name: true,
      websiteChatWidgetKey: true,
    },
  });

  if (!existing) {
    throw new Error("Venue not found.");
  }

  const widgetKey =
    input.websiteChatEnabled
      ? existing.websiteChatWidgetKey ?? makeWebsiteChatWidgetKey()
      : existing.websiteChatWidgetKey;

  const venue = await prisma.venue.update({
    where: { id: venueId },
    data: {
      addressLine1: input.addressLine1 || null,
      city: input.city,
      state: input.state || null,
      postalCode: input.postalCode || null,
      phoneNumber: input.phoneNumber || null,
      timezone: input.timezone,
      hoursSummary: input.hoursSummary || null,
        primaryOperatorName: input.primaryOperatorName || null,
        primaryOperatorRole: input.primaryOperatorRole || null,
        primaryOperatorEmail: input.primaryOperatorEmail || null,
        depositPolicy: input.depositPolicy,
        servesFood: input.servesFood,
        servesHookah: input.servesHookah,
        hasParking: input.hasParking,
        hasValet: input.hasValet,
        dressCodeSummary: input.dressCodeSummary || null,
        agePolicySummary: input.agePolicySummary || null,
        ...(typeof input.websiteChatEnabled === "boolean"
          ? {
              websiteChatEnabled: input.websiteChatEnabled,
            websiteChatWidgetKey: widgetKey,
          }
        : {}),
      ...(input.websiteChatAllowedOrigins !== undefined
        ? { websiteChatAllowedOrigins: input.websiteChatAllowedOrigins || null }
        : {}),
      ...(input.websiteChatWelcomeMessage !== undefined
        ? { websiteChatWelcomeMessage: input.websiteChatWelcomeMessage || null }
        : {}),
      ...(input.websiteChatPromptPlaceholder !== undefined
        ? { websiteChatPromptPlaceholder: input.websiteChatPromptPlaceholder || null }
        : {}),
      depositCheckoutMode: input.depositCheckoutMode,
      stripeConnectAccountId: input.stripeConnectAccountId || null,
      stripeOnboardingComplete: input.stripeOnboardingComplete,
      stripeChargesEnabled: input.stripeChargesEnabled,
      stripePayoutsEnabled: input.stripePayoutsEnabled,
    },
  });

  await logOperatorActivity({
    actorVenueUserId,
    venueId,
    entityType: "venue",
    entityId: venue.id,
    action: "operator.venue_settings_updated",
    summary: `Updated operator settings for ${venue.name}.`,
  });

  revalidatePath("/operator/settings");

  return venue;
}

export async function generateOperatorWebsiteChatSnippet(venueId: string, actorVenueUserId?: string) {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
  });

  if (!venue) {
    throw new Error("Venue not found.");
  }

  if (!isWebsiteChatListedInChannels(venue.channelsSummary)) {
    throw new Error("Website chat must be enabled by admin before an install snippet can be generated.");
  }

  const widgetKey = venue.websiteChatWidgetKey ?? makeWebsiteChatWidgetKey();

  if (!venue.websiteChatWidgetKey) {
    await prisma.venue.update({
      where: { id: venueId },
      data: {
        websiteChatWidgetKey: widgetKey,
      },
    });
  }

  await logOperatorActivity({
    actorVenueUserId,
    venueId,
    entityType: "venue",
    entityId: venue.id,
    action: "operator.website_chat_snippet_generated",
    summary: `Generated website chat install snippet for ${venue.name}.`,
  });

  revalidatePath("/operator/settings");

  return {
    websiteChatWidgetKey: widgetKey,
    websiteChatInstallSnippet:
      process.env.NEXT_PUBLIC_APP_URL
        ? buildWebsiteChatSnippet({
            appUrl: process.env.NEXT_PUBLIC_APP_URL,
            widgetKey,
          })
        : null,
  };
}

function mapVenueAsset(asset: {
  id: string;
  type: "BOTTLE_MENU" | "FOOD_MENU" | "HOOKAH_MENU" | "EVENT_FLYER";
  label: string;
  publicUrl: string;
  fileName: string;
  mimeType: string;
  eventSeriesId: string | null;
  eventOverrideId: string | null;
  createdAt: Date;
}): OperatorVenueAsset {
  return {
    id: asset.id,
    type: asset.type,
    label: asset.label,
    publicUrl: asset.publicUrl,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    eventSeriesId: asset.eventSeriesId,
    eventOverrideId: asset.eventOverrideId,
    createdAt: asset.createdAt.toISOString(),
  };
}

export async function uploadOperatorVenueAsset(
  venueId: string,
  input: {
    type: "BOTTLE_MENU" | "FOOD_MENU" | "HOOKAH_MENU";
    label: string;
    file: File;
  },
  actorVenueUserId?: string,
) {
  const asset = await saveVenueAssetUpload({
    venueId,
    type: input.type,
    label: input.label,
    file: input.file,
  });

  await logOperatorActivity({
    actorVenueUserId,
    venueId,
    entityType: "venue_asset",
    entityId: asset.id,
    action: "operator.venue_asset_uploaded",
    summary: `Uploaded ${input.label} for venue knowledge.`,
  });

  revalidatePath("/operator/settings");
  return mapVenueAsset(asset);
}

export async function listOperatorEventSeries(venueId: string): Promise<OperatorEventSeries[]> {
  const repository = eventRepository();
  if (!repository.eventSeries) {
    return [];
  }

  const series = (await repository.eventSeries.findMany({
    where: { venueId },
    include: {
      assets: {
        where: { type: "EVENT_FLYER", active: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      overrides: {
        where: { active: true },
        select: { id: true },
      },
    },
    orderBy: [{ active: "desc" }, { title: "asc" }],
  })) as Array<{
    id: string;
    title: string;
    description?: string | null;
    recurringDays: string;
    startDate?: Date | null;
    endDate?: Date | null;
    active: boolean;
    assets: Array<{
      id: string;
      type: "BOTTLE_MENU" | "FOOD_MENU" | "HOOKAH_MENU" | "EVENT_FLYER";
      label: string;
      publicUrl: string;
      fileName: string;
      mimeType: string;
      eventSeriesId: string | null;
      eventOverrideId: string | null;
      createdAt: Date;
    }>;
    overrides: Array<{ id: string }>;
  }>;

  return series.map((item) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    recurringDays: parseRecurringDays(item.recurringDays),
    startDate: item.startDate?.toISOString().slice(0, 10) ?? null,
    endDate: item.endDate?.toISOString().slice(0, 10) ?? null,
    active: item.active,
    flyer: item.assets[0] ? mapVenueAsset(item.assets[0]) : null,
    upcomingOverrideCount: item.overrides.length,
  }));
}

export async function listOperatorEventOverrides(venueId: string): Promise<OperatorEventOverride[]> {
  const repository = eventRepository();
  if (!repository.eventOccurrenceOverride) {
    return [];
  }

  const overrides = (await repository.eventOccurrenceOverride.findMany({
    where: { venueId },
    include: {
      eventSeries: {
        select: { title: true },
      },
      assets: {
        where: { type: "EVENT_FLYER", active: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: [{ occurrenceDate: "asc" }],
  })) as Array<{
    id: string;
    eventSeriesId?: string | null;
    occurrenceDate: Date;
    title?: string | null;
    description?: string | null;
    isCancelled: boolean;
    active: boolean;
    eventSeries?: { title: string } | null;
    assets: Array<{
      id: string;
      type: "BOTTLE_MENU" | "FOOD_MENU" | "HOOKAH_MENU" | "EVENT_FLYER";
      label: string;
      publicUrl: string;
      fileName: string;
      mimeType: string;
      eventSeriesId: string | null;
      eventOverrideId: string | null;
      createdAt: Date;
    }>;
  }>;

  return overrides.map((item) => ({
    id: item.id,
    eventSeriesId: item.eventSeriesId,
    eventSeriesTitle: item.eventSeries?.title ?? null,
    occurrenceDate: item.occurrenceDate.toISOString().slice(0, 10),
    title: item.title,
    description: item.description,
    isCancelled: item.isCancelled,
    active: item.active,
    flyer: item.assets[0] ? mapVenueAsset(item.assets[0]) : null,
  }));
}

export async function createOperatorEventSeries(
  venueId: string,
  input: {
    title: string;
    description: string;
    recurringDays: string[];
    startDate?: string;
    endDate?: string;
    flyerFile?: File | null;
  },
  actorVenueUserId?: string,
) {
  if (!input.title.trim()) {
    throw new Error("Event title is required.");
  }

  const recurringDays = input.recurringDays
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);

  if (recurringDays.length === 0) {
    throw new Error("Choose at least one recurring weekday.");
  }

  const series = await prisma.eventSeries.create({
    data: {
      venueId,
      title: input.title.trim(),
      description: input.description.trim() || null,
      recurringDays: recurringDays.join(","),
      startDate: input.startDate ? new Date(`${input.startDate}T00:00:00.000Z`) : null,
      endDate: input.endDate ? new Date(`${input.endDate}T00:00:00.000Z`) : null,
    },
  });

  if (input.flyerFile && input.flyerFile.size > 0) {
    await saveVenueAssetUpload({
      venueId,
      type: "EVENT_FLYER",
      label: `${series.title} flyer`,
      file: input.flyerFile,
      eventSeriesId: series.id,
    });
  }

  await logOperatorActivity({
    actorVenueUserId,
    venueId,
    entityType: "event_series",
    entityId: series.id,
    action: "operator.event_series_created",
    summary: `Created recurring event ${series.title}.`,
  });

  revalidatePath("/operator/events");
  return series;
}

export async function createOperatorEventOverride(
  venueId: string,
  input: {
    eventSeriesId?: string | null;
    occurrenceDate: string;
    title: string;
    description: string;
    isCancelled: boolean;
    flyerFile?: File | null;
  },
  actorVenueUserId?: string,
) {
  if (!input.occurrenceDate) {
    throw new Error("Override date is required.");
  }

  const linkedSeries = input.eventSeriesId
    ? await prisma.eventSeries.findFirst({
        where: {
          id: input.eventSeriesId,
          venueId,
        },
        select: { title: true },
      })
    : null;

  const title = input.title.trim() || linkedSeries?.title || "Special event";
  const override = await prisma.eventOccurrenceOverride.upsert({
    where: {
      venueId_occurrenceDate: {
        venueId,
        occurrenceDate: new Date(`${input.occurrenceDate}T00:00:00.000Z`),
      },
    },
    update: {
      eventSeriesId: input.eventSeriesId || null,
      title,
      description: input.description.trim() || null,
      isCancelled: input.isCancelled,
      active: true,
    },
    create: {
      venueId,
      eventSeriesId: input.eventSeriesId || null,
      occurrenceDate: new Date(`${input.occurrenceDate}T00:00:00.000Z`),
      title,
      description: input.description.trim() || null,
      isCancelled: input.isCancelled,
      active: true,
    },
  });

  if (input.flyerFile && input.flyerFile.size > 0) {
    await saveVenueAssetUpload({
      venueId,
      type: "EVENT_FLYER",
      label: `${title} flyer`,
      file: input.flyerFile,
      eventOverrideId: override.id,
    });
  }

  await logOperatorActivity({
    actorVenueUserId,
    venueId,
    entityType: "event_override",
    entityId: override.id,
    action: "operator.event_override_saved",
    summary: `Saved event override for ${input.occurrenceDate}: ${title}.`,
  });

  revalidatePath("/operator/events");
  return override;
}

export async function updateOperatorEventSeries(
  venueId: string,
  seriesId: string,
  input: {
    title: string;
    description: string;
    recurringDays: string[];
    startDate?: string;
    endDate?: string;
    active: boolean;
    flyerFile?: File | null;
  },
  actorVenueUserId?: string,
) {
  if (!input.title.trim()) {
    throw new Error("Event title is required.");
  }

  const recurringDays = input.recurringDays
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);

  if (recurringDays.length === 0) {
    throw new Error("Choose at least one recurring weekday.");
  }

  const series = await prisma.eventSeries.update({
    where: {
      id: seriesId,
      venueId,
    },
    data: {
      title: input.title.trim(),
      description: input.description.trim() || null,
      recurringDays: recurringDays.join(","),
      startDate: input.startDate ? new Date(`${input.startDate}T00:00:00.000Z`) : null,
      endDate: input.endDate ? new Date(`${input.endDate}T00:00:00.000Z`) : null,
      active: input.active,
    },
  });

  if (input.flyerFile && input.flyerFile.size > 0) {
    await saveVenueAssetUpload({
      venueId,
      type: "EVENT_FLYER",
      label: `${series.title} flyer`,
      file: input.flyerFile,
      eventSeriesId: series.id,
    });
  }

  await logOperatorActivity({
    actorVenueUserId,
    venueId,
    entityType: "event_series",
    entityId: series.id,
    action: "operator.event_series_updated",
    summary: `Updated recurring event ${series.title}.`,
  });

  revalidatePath("/operator/events");
  return series;
}

export async function updateOperatorEventOverride(
  venueId: string,
  overrideId: string,
  input: {
    occurrenceDate: string;
    title: string;
    description: string;
    isCancelled: boolean;
    active: boolean;
    flyerFile?: File | null;
  },
  actorVenueUserId?: string,
) {
  if (!input.occurrenceDate) {
    throw new Error("Event date is required.");
  }

  const title = input.title.trim() || "Special event";
  const override = await prisma.eventOccurrenceOverride.update({
    where: {
      id: overrideId,
      venueId,
    },
    data: {
      occurrenceDate: new Date(`${input.occurrenceDate}T00:00:00.000Z`),
      title,
      description: input.description.trim() || null,
      isCancelled: input.isCancelled,
      active: input.active,
    },
  });

  if (input.flyerFile && input.flyerFile.size > 0) {
    await saveVenueAssetUpload({
      venueId,
      type: "EVENT_FLYER",
      label: `${title} flyer`,
      file: input.flyerFile,
      eventOverrideId: override.id,
    });
  }

  await logOperatorActivity({
    actorVenueUserId,
    venueId,
    entityType: "event_override",
    entityId: override.id,
    action: "operator.event_override_updated",
    summary: `Updated event for ${input.occurrenceDate}: ${title}.`,
  });

  revalidatePath("/operator/events");
  return override;
}

export async function listOperatorAlerts(venueId: string): Promise<OperatorAlertItem[]> {
  const alerts = await prisma.alert.findMany({
    where: {
      venueId,
      status: "OPEN",
    },
    orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
  });

  return alerts.map((alert) => ({
    id: alert.id,
    type: alert.type,
    severity: alert.severity,
    title: alert.title,
    description: alert.description,
    createdAt: formatRelative(alert.createdAt),
    inquiryId: alert.inquiryId ?? undefined,
  }));
}

export async function listOperatorActivity(venueId: string): Promise<OperatorActivityItem[]> {
  const activity = await prisma.activityLog.findMany({
    where: {
      venueId,
    },
    include: {
      actor: {
        select: { fullName: true },
      },
      actorVenueUser: {
        select: { fullName: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return activity.map((item) => ({
    id: item.id,
    action: item.action,
    summary: item.summary,
    createdAt: formatRelative(item.createdAt),
    actorName: item.actorVenueUser?.fullName ?? item.actor?.fullName ?? "System",
    actorType: item.actorVenueUser ? "venue" : item.actor ? "platform" : "system",
  }));
}

function describeWorkflowTask(task: {
  type: string;
  payload: unknown;
  inquiry?: { guestName: string } | null;
}) {
  const payload = task.payload && typeof task.payload === "object" && !Array.isArray(task.payload)
    ? task.payload as Record<string, unknown>
    : {};
  const guestName = task.inquiry?.guestName ?? (typeof payload.guestName === "string" ? payload.guestName : null);
  const tableName = typeof payload.tableName === "string" ? payload.tableName : null;

  if (task.type === "UNPAID_DEPOSIT_REMINDER") {
    return [guestName ? `Deposit reminder for ${guestName}` : "Deposit reminder", tableName ? `table ${tableName}` : null]
      .filter(Boolean)
      .join(" · ");
  }

  if (task.type === "ABANDONED_CHAT_FOLLOW_UP") {
    return guestName ? `Follow up with ${guestName}` : "Abandoned chat follow-up";
  }

  if (task.type === "STALE_QUOTE_EXPIRATION") {
    return guestName ? `Review stale quote for ${guestName}` : "Stale quote review";
  }

  if (task.type === "POST_BOOKING_CONFIRMATION") {
    return guestName ? `Post-booking confirmation for ${guestName}` : "Post-booking confirmation";
  }

  return guestName ? `Operator workflow alert for ${guestName}` : "Operator workflow alert";
}

export async function listOperatorWorkflowTasks(venueId: string): Promise<OperatorWorkflowTaskItem[]> {
  const tasks = await prisma.workflowTask.findMany({
    where: {
      venueId,
      status: {
        in: ["PENDING", "PROCESSING", "FAILED", "COMPLETED"],
      },
    },
    include: {
      inquiry: {
        select: {
          id: true,
          guestName: true,
        },
      },
    },
    orderBy: [
      { status: "asc" },
      { scheduledFor: "asc" },
    ],
    take: 25,
  });

  return tasks.map((task) => ({
    id: task.id,
    type: task.type,
    status: task.status,
    scheduledFor: formatDateTime(task.scheduledFor),
    createdAt: formatRelative(task.createdAt),
    attempts: task.attempts,
    lastError: task.lastError,
    inquiryId: task.inquiryId ?? undefined,
    guestName: task.inquiry?.guestName,
    description: describeWorkflowTask(task),
  }));
}
