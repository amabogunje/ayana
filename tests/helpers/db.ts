import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export async function resetDatabase() {
  await prisma.venueAsset.deleteMany();
  await prisma.eventOccurrenceOverride.deleteMany();
  await prisma.eventSeries.deleteMany();
  await prisma.workflowTask.deleteMany();
  await prisma.agentToolCall.deleteMany();
  await prisma.agentRun.deleteMany();
  await prisma.venueAgentConfig.deleteMany();
  await prisma.activityLog.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.quoteOption.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.websiteChatSession.deleteMany();
  await prisma.inquiryMessage.deleteMany();
  await prisma.inquiry.deleteMany();
  await prisma.venueSession.deleteMany();
  await prisma.venueUser.deleteMany();
  await prisma.tableOption.deleteMany();
  await prisma.platformSession.deleteMany();
  await prisma.platformUser.deleteMany();
  await prisma.platformConfig.deleteMany();
  await prisma.venue.deleteMany();
}

export async function deleteVenueData(venueId: string) {
  const inquiries = await prisma.inquiry.findMany({
    where: { venueId },
    select: { id: true },
  });
  const inquiryIds = inquiries.map((inquiry) => inquiry.id);

  await prisma.venueAsset.deleteMany({ where: { venueId } });
  await prisma.eventOccurrenceOverride.deleteMany({ where: { venueId } });
  await prisma.eventSeries.deleteMany({ where: { venueId } });
  await prisma.workflowTask.deleteMany({ where: { venueId } });
  await prisma.agentToolCall.deleteMany({ where: { venueId } });
  await prisma.agentRun.deleteMany({ where: { venueId } });
  await prisma.venueAgentConfig.deleteMany({ where: { venueId } });
  await prisma.alert.deleteMany({ where: { venueId } });
  await prisma.activityLog.deleteMany({ where: { venueId } });
  await prisma.quoteOption.deleteMany({ where: { inquiryId: { in: inquiryIds } } });
  await prisma.reservation.deleteMany({ where: { inquiryId: { in: inquiryIds } } });
  await prisma.websiteChatSession.deleteMany({ where: { venueId } });
  await prisma.inquiryMessage.deleteMany({ where: { inquiryId: { in: inquiryIds } } });
  await prisma.inquiry.deleteMany({ where: { venueId } });
  await prisma.venueSession.deleteMany({ where: { user: { venueId } } });
  await prisma.venueUser.deleteMany({ where: { venueId } });
  await prisma.tableOption.deleteMany({ where: { venueId } });
  await prisma.venue.deleteMany({ where: { id: venueId } });
}

export async function createVenue(overrides: Partial<Parameters<typeof prisma.venue.create>[0]["data"]> = {}) {
  const idSuffix = Math.random().toString(36).slice(2, 8);

  return prisma.venue.create({
    data: {
      slug: `test-venue-${idSuffix}`,
      name: "Test Venue",
      city: "New York",
      timezone: "America/New_York",
      status: "ACTIVE",
      channelsSummary: "SMS, Website Chat",
      brandTone: "polished and helpful",
      depositPolicy: "Deposits are required to confirm reservations.",
      websiteChatEnabled: true,
      websiteChatWidgetKey: `wc_test_${idSuffix}`,
      ...overrides,
    },
  });
}

export async function createTableOption(
  venueId: string,
  overrides: Partial<Prisma.TableOptionUncheckedCreateInput> = {},
) {
  const data: Prisma.TableOptionUncheckedCreateInput = {
    venueId,
    name: "Dance Floor Table",
    code: "DFT",
    quantity: 2,
    minSpendCents: 100_000,
    depositAmountCents: 20_000,
    capacityMin: 2,
    capacityMax: 8,
    description: "Prime room placement.",
    ...overrides,
  };

  return prisma.tableOption.create({
    data,
  });
}

export async function createInquiry(venueId: string, overrides: Partial<Prisma.InquiryUncheckedCreateInput> = {}) {
  return prisma.inquiry.create({
    data: {
      venueId,
      guestName: "Avery Guest",
      channel: "WEBSITE_CHAT",
      status: "NEW",
      requestedAt: new Date("2026-04-25T20:00:00.000Z"),
      requestedDateLabel: "Friday",
      partySize: 4,
      spendIntentLabel: "$1500",
      aiConfidence: 0.5,
      nextAction: "Qualify inquiry.",
      ...overrides,
    },
  });
}
