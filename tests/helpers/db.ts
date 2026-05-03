import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export async function resetDatabase() {
  await prisma.venueAsset.deleteMany();
  await prisma.eventOccurrenceOverride.deleteMany();
  await prisma.eventSeries.deleteMany();
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

export async function createTableOption(venueId: string) {
  return prisma.tableOption.create({
    data: {
      venueId,
      name: "Dance Floor Table",
      code: "DFT",
      quantity: 2,
      minSpendCents: 100_000,
      depositAmountCents: 20_000,
      capacityMin: 2,
      capacityMax: 8,
      description: "Prime room placement.",
    },
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
