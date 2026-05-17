import { prisma } from "@/lib/prisma";
import { createDepositCheckoutForAgent } from "@/lib/agent-tools/deposit-tool";
import {
  findRecommendedTableOptionForAgent,
  hasEnoughTableQualification,
  type AgentResultForTableOptions,
  type TableOptionContext,
} from "@/lib/agent-tools/table-options-tool";

export type CreateReservationDepositResult = AgentResultForTableOptions & {
  isHumanTakeover: boolean;
  extracted: AgentResultForTableOptions["extracted"] & {
    phone?: string | null;
  };
};

export type CreateReservationDepositContext = TableOptionContext & {
  guestName: string;
  phone: string | null;
  venue: TableOptionContext["venue"] & {
    id: string;
    name: string;
    depositCheckoutMode: "MOCK" | "STRIPE_CONNECT";
    stripeConnectAccountId: string | null;
    stripeChargesEnabled: boolean;
    stripePayoutsEnabled: boolean;
  };
};

function makeConfirmationCode(guestName: string) {
  const guestToken = guestName.split(" ")[0]?.toUpperCase().replace(/[^A-Z0-9]/g, "") || "GUEST";
  return `${guestToken}-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export async function createReservationDepositIfReadyForAgent(input: {
  inquiryId: string;
  result: CreateReservationDepositResult;
  context: CreateReservationDepositContext;
  isClosedNight?: boolean;
}) {
  if (input.result.isHumanTakeover) return null;
  if (!hasEnoughTableQualification(input.result, input.context)) return null;
  if (input.isClosedNight) return null;

  const phone = input.result.extracted.phone || input.context.phone;
  if (!phone) return null;

  const tableOption = findRecommendedTableOptionForAgent(input.result, input.context);
  if (!tableOption) return null;

  const existingReservation = await prisma.reservation.findUnique({
    where: { inquiryId: input.inquiryId },
    include: { tableOption: true },
  });

  if (existingReservation) {
    return existingReservation;
  }

  const reservation = await prisma.reservation.create({
    data: {
      inquiryId: input.inquiryId,
      tableOptionId: tableOption.id,
      status: "DEPOSIT_PENDING",
      depositAmountCents: tableOption.depositAmountCents,
      depositPaidCents: 0,
      depositCheckoutMode: input.context.venue.depositCheckoutMode,
      confirmationCode: makeConfirmationCode(input.context.guestName),
      arrivalTimeLabel: input.result.extracted.requestedDateLabel || input.context.requestedDateLabel,
      notes: "Created automatically from website chat qualification.",
    },
    include: {
      tableOption: true,
    },
  });

  const checkout = await createDepositCheckoutForAgent({
    reservationId: reservation.id,
    venueId: input.context.venue.id,
    venueName: input.context.venue.name,
    tableName: tableOption.name,
    guestName: input.context.guestName,
    depositAmountCents: tableOption.depositAmountCents,
    checkoutMode: input.context.venue.depositCheckoutMode,
    stripeConnectAccountId: input.context.venue.stripeConnectAccountId,
    stripeChargesEnabled: input.context.venue.stripeChargesEnabled,
    stripePayoutsEnabled: input.context.venue.stripePayoutsEnabled,
  });

  if (!checkout) {
    return reservation;
  }

  return prisma.reservation.update({
    where: { id: reservation.id },
    data: {
      depositCheckoutUrl: checkout.url,
      depositCheckoutSessionId: checkout.sessionId,
    },
    include: {
      tableOption: true,
    },
  });
}
