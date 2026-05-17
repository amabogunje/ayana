import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { setOpenAIApiKey } from "@/lib/platform-config";
import { runWebsiteChatAgent } from "@/lib/website-chat-agent";
import {
  addWebsiteChatGuestMessage,
  listWebsiteChatMessages,
  startWebsiteChatSession,
} from "@/lib/website-chat-service";
import { createInquiry, createTableOption, createVenue, resetDatabase } from "../helpers/db";

async function createConfiguredVenue() {
  const venue = await createVenue({
    name: "Architecture Room",
    brandTone: "polished and direct",
    depositPolicy: "A deposit is required to hold a table.",
    websiteChatAllowedOrigins: "https://club.example.com",
    hoursSummary: "Friday 9 PM-2 AM | Saturday 9 PM-2 AM",
    depositCheckoutMode: "MOCK",
  });
  const smallTable = await createTableOption(venue.id, {
    name: "VIP Booth",
    code: "VIPB",
    capacityMin: 2,
    capacityMax: 4,
    minSpendCents: 100_000,
    depositAmountCents: 25_000,
    description: "Main room booth with strong visibility.",
  });
  const largeTable = await createTableOption(venue.id, {
    name: "Main Floor Table",
    code: "MFT",
    capacityMin: 5,
    capacityMax: 8,
    minSpendCents: 150_000,
    depositAmountCents: 30_000,
    description: "Larger table on the main floor.",
  });

  return { venue, smallTable, largeTable };
}

async function createPersistedAgentConfig(
  venueId: string,
  overrides: Partial<{
    autonomyLevel: number;
    canAnswerFaqs: boolean;
    canQualifyLeads: boolean;
    canRecommendPackages: boolean;
    canCreateQuotes: boolean;
    canSendDepositLinks: boolean;
    canCreateReservations: boolean;
    enabledChannels: string;
    partySizeThreshold: number | null;
  }> = {},
) {
  return prisma.venueAgentConfig.create({
    data: {
      venueId,
      enabled: true,
      agentName: "Architecture Room Agent",
      brandVoice: "polished and direct",
      autonomyLevel: overrides.autonomyLevel ?? 5,
      canAnswerFaqs: overrides.canAnswerFaqs ?? true,
      canQualifyLeads: overrides.canQualifyLeads ?? true,
      canRecommendPackages: overrides.canRecommendPackages ?? true,
      canCreateQuotes: overrides.canCreateQuotes ?? true,
      canSendDepositLinks: overrides.canSendDepositLinks ?? true,
      canCreateReservations: overrides.canCreateReservations ?? true,
      confidenceThreshold: 0.5,
      escalationRules: {
        escalateOnLowConfidence: true,
        lowConfidenceThreshold: 0.5,
        escalateForVipRequests: true,
        escalateForUnavailableInventory: true,
        escalateForOversizedParty: true,
        partySizeThreshold: overrides.partySizeThreshold ?? null,
      },
      followUpRules: {
        enabled: false,
      },
      enabledChannels: overrides.enabledChannels ?? "WEBSITE_CHAT",
    },
  });
}

describe("website chat shared architecture flows", () => {
  const previousOpenAiApiKey = process.env.OPENAI_API_KEY;

  beforeEach(async () => {
    delete process.env.OPENAI_API_KEY;
    await resetDatabase();
    await setOpenAIApiKey(null);
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = previousOpenAiApiKey;
  });

  it("keeps website chat API compatibility while routing guest messages through shared runtime", async () => {
    const { venue } = await createConfiguredVenue();
    const session = await startWebsiteChatSession({
      widgetKey: venue.websiteChatWidgetKey!,
      origin: "https://club.example.com",
      guestName: "Runtime Guest",
      message: "Hi",
    });

    const guestMessage = await addWebsiteChatGuestMessage({
      sessionToken: session.sessionToken,
      origin: "https://club.example.com",
      content: "Friday for 3 people",
    });
    const listed = await listWebsiteChatMessages(session.sessionToken, "https://club.example.com");
    const agentRunCount = await prisma.agentRun.count({
      where: { inquiryId: listed.inquiryId, venueId: venue.id, channel: "WEBSITE_CHAT" },
    });
    const sharedRuntimeRun = await prisma.agentRun.findFirst({
      where: {
        inquiryId: listed.inquiryId,
        venueId: venue.id,
        source: "shared_agent_runtime",
      },
      include: { toolCalls: true },
    });

    expect(guestMessage.authorRole).toBe("guest");
    expect(listed.messages.some((message) => message.id === guestMessage.id)).toBe(true);
    expect(listed.messages.some((message) => message.authorRole === "ai")).toBe(true);
    expect(agentRunCount).toBeGreaterThan(0);
    expect(sharedRuntimeRun?.status).toBe("COMPLETED");
    expect(sharedRuntimeRun?.toolCalls.length).toBeGreaterThan(0);
  });

  it("recommends the configured package that fits the party size without inventing pricing", async () => {
    const { venue, largeTable } = await createConfiguredVenue();
    const session = await startWebsiteChatSession({
      widgetKey: venue.websiteChatWidgetKey!,
      origin: "https://club.example.com",
      guestName: "Package Guest",
      message: "Friday",
    });

    await addWebsiteChatGuestMessage({
      sessionToken: session.sessionToken,
      origin: "https://club.example.com",
      content: "7 people",
    });

    const quote = await prisma.quoteOption.findFirst({
      where: { inquiry: { venueId: venue.id } },
      include: { tableOption: true },
    });
    const listed = await listWebsiteChatMessages(session.sessionToken, "https://club.example.com");
    const aiText = listed.messages
      .filter((message) => message.authorRole === "ai")
      .map((message) => message.content.toLowerCase())
      .join("\n");

    expect(quote?.tableOptionId).toBe(largeTable.id);
    expect(aiText).toContain("main floor table");
    expect(aiText).not.toMatch(/\bfree\b|\bdiscount\b|\bcomp\b|\bwaive\b/);
  });

  it("requires a phone number before creating a deposit checkout link", async () => {
    const { venue } = await createConfiguredVenue();
    const session = await startWebsiteChatSession({
      widgetKey: venue.websiteChatWidgetKey!,
      origin: "https://club.example.com",
      guestName: "Deposit Guest",
      message: "Friday",
    });

    await addWebsiteChatGuestMessage({
      sessionToken: session.sessionToken,
      origin: "https://club.example.com",
      content: "3 people, send me the deposit link",
    });
    const beforePhoneReservationCount = await prisma.reservation.count({
      where: { inquiry: { venueId: venue.id } },
    });

    await addWebsiteChatGuestMessage({
      sessionToken: session.sessionToken,
      origin: "https://club.example.com",
      content: "2674756962",
    });
    const reservation = await prisma.reservation.findFirst({
      where: { inquiry: { venueId: venue.id } },
    });

    expect(beforePhoneReservationCount).toBe(0);
    expect(reservation?.depositCheckoutUrl).toContain("/api/public/deposits/");
  }, 15_000);

  it("refuses closed nights and does not create quotes or reservations", async () => {
    const { venue } = await createConfiguredVenue();
    const inquiry = await createInquiry(venue.id, {
      guestName: "Closed Night Guest",
      requestedDateLabel: "Tuesday",
      partySize: 3,
      phone: "2674756962",
    });
    await prisma.inquiryMessage.create({
      data: {
        inquiryId: inquiry.id,
        authorRole: "guest",
        content: "Tuesday for 3 people and my phone is 2674756962",
      },
    });

    await runWebsiteChatAgent({ inquiryId: inquiry.id });

    const latestAi = (await prisma.inquiryMessage.findFirst({
      where: { inquiryId: inquiry.id, authorRole: "ai" },
      orderBy: { createdAt: "desc" },
    }))?.content ?? "";
    const quoteCount = await prisma.quoteOption.count({ where: { inquiry: { venueId: venue.id } } });
    const reservationCount = await prisma.reservation.count({ where: { inquiry: { venueId: venue.id } } });
    expect(latestAi.toLowerCase()).toContain("closed");
    expect(quoteCount).toBe(0);
    expect(reservationCount).toBe(0);
  });

  it("prevents duplicate AI replies for one guest message", async () => {
    const { venue } = await createConfiguredVenue();
    const session = await startWebsiteChatSession({
      widgetKey: venue.websiteChatWidgetKey!,
      origin: "https://club.example.com",
      guestName: "Duplicate Reply Guest",
      message: null,
    });
    const guestMessage = await addWebsiteChatGuestMessage({
      sessionToken: session.sessionToken,
      origin: "https://club.example.com",
      content: "Friday for 3 people",
    });
    const listedBefore = await listWebsiteChatMessages(session.sessionToken, "https://club.example.com");

    await runWebsiteChatAgent({
      inquiryId: listedBefore.inquiryId,
      guestMessageId: guestMessage.id,
    });
    const listedAfter = await listWebsiteChatMessages(session.sessionToken, "https://club.example.com");
    const skippedRun = await prisma.agentRun.findFirst({
      where: {
        venueId: venue.id,
        inquiryId: listedBefore.inquiryId,
        status: "SKIPPED",
        finalAction: "Duplicate AI reply skipped.",
      },
    });

    expect(listedAfter.messages.filter((message) => message.authorRole === "ai")).toHaveLength(
      listedBefore.messages.filter((message) => message.authorRole === "ai").length,
    );
    expect(skippedRun).toBeTruthy();
  });

  it("prevents duplicate quotes and reservations when an action is retried", async () => {
    const { venue } = await createConfiguredVenue();
    const inquiry = await createInquiry(venue.id, {
      guestName: "Retry Guest",
      phone: "2674756962",
      requestedDateLabel: "Friday",
      partySize: 3,
      spendIntentLabel: "$1500",
    });
    await prisma.inquiryMessage.create({
      data: {
        inquiryId: inquiry.id,
        authorRole: "guest",
        content: "Friday for 3, my phone is 2674756962, send the deposit link.",
      },
    });

    await runWebsiteChatAgent({ inquiryId: inquiry.id });
    await runWebsiteChatAgent({ inquiryId: inquiry.id });

    expect(await prisma.quoteOption.count({ where: { inquiryId: inquiry.id } })).toBe(1);
    expect(await prisma.reservation.count({ where: { inquiryId: inquiry.id } })).toBe(1);
  });

  it("hands off FAQ questions when FAQ answering is disabled", async () => {
    const { venue } = await createConfiguredVenue();
    await createPersistedAgentConfig(venue.id, {
      canAnswerFaqs: false,
    });
    const session = await startWebsiteChatSession({
      widgetKey: venue.websiteChatWidgetKey!,
      origin: "https://club.example.com",
      guestName: "FAQ Control Guest",
      message: null,
    });

    await addWebsiteChatGuestMessage({
      sessionToken: session.sessionToken,
      origin: "https://club.example.com",
      content: "Do you have parking?",
    });

    const listed = await listWebsiteChatMessages(session.sessionToken, "https://club.example.com");
    const aiText = listed.messages.find((message) => message.authorRole === "ai")?.content.toLowerCase() ?? "";
    const knowledgeTool = await prisma.agentToolCall.findFirst({
      where: { venueId: venue.id, toolName: "searchVenueKnowledge" },
      orderBy: { createdAt: "desc" },
    });

    expect(aiText).toMatch(/\b(operator|person|team)\b/);
    expect(knowledgeTool?.status).toBe("SKIPPED");
    expect(knowledgeTool?.inputSummary).toContain("tool_not_allowed");
  });

  it("prevents package recommendations and quotes when package recommendations are disabled", async () => {
    const { venue } = await createConfiguredVenue();
    await createPersistedAgentConfig(venue.id, {
      canRecommendPackages: false,
    });
    const session = await startWebsiteChatSession({
      widgetKey: venue.websiteChatWidgetKey!,
      origin: "https://club.example.com",
      guestName: "Package Control Guest",
      message: "Friday",
    });

    await addWebsiteChatGuestMessage({
      sessionToken: session.sessionToken,
      origin: "https://club.example.com",
      content: "3 people",
    });

    const listed = await listWebsiteChatMessages(session.sessionToken, "https://club.example.com");
    const aiText = listed.messages.filter((message) => message.authorRole === "ai").map((message) => message.content.toLowerCase()).join("\n");
    const recommendationTool = await prisma.agentToolCall.findFirst({
      where: { venueId: venue.id, toolName: "recommendPackage" },
      orderBy: { createdAt: "desc" },
    });

    expect(aiText).toContain("team");
    expect(await prisma.quoteOption.count({ where: { inquiry: { venueId: venue.id } } })).toBe(0);
    expect(recommendationTool?.inputSummary).toContain("recommend_packages_not_allowed");
  });

  it("prevents reservation and deposit checkout actions when those controls are disabled", async () => {
    const { venue } = await createConfiguredVenue();
    await createPersistedAgentConfig(venue.id, {
      canSendDepositLinks: false,
      canCreateReservations: false,
    });
    const inquiry = await createInquiry(venue.id, {
      guestName: "Reservation Control Guest",
      requestedDateLabel: "Friday",
      partySize: 3,
      phone: "2674756962",
    });
    await prisma.inquiryMessage.create({
      data: {
        inquiryId: inquiry.id,
        authorRole: "guest",
        content: "Friday for 3, my phone is 2674756962, send the deposit link.",
      },
    });

    await runWebsiteChatAgent({ inquiryId: inquiry.id });

    const reservationTool = await prisma.agentToolCall.findFirst({
      where: { venueId: venue.id, inquiryId: inquiry.id, toolName: "createReservation" },
      orderBy: { createdAt: "desc" },
    });

    expect(await prisma.quoteOption.count({ where: { inquiryId: inquiry.id } })).toBe(1);
    expect(await prisma.reservation.count({ where: { inquiryId: inquiry.id } })).toBe(0);
    expect(reservationTool?.status).toBe("SKIPPED");
    expect(reservationTool?.inputSummary).toContain("create_reservations_not_allowed");
  });
});
