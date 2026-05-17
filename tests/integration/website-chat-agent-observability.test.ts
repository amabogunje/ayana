import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { setOpenAIApiKey } from "@/lib/platform-config";
import { runWebsiteChatAgent } from "@/lib/website-chat-agent";
import { createInquiry, createTableOption, createVenue, resetDatabase } from "../helpers/db";

describe("website chat agent observability", () => {
  const previousOpenAiApiKey = process.env.OPENAI_API_KEY;

  beforeEach(async () => {
    delete process.env.OPENAI_API_KEY;
    await resetDatabase();
    await setOpenAIApiKey(null);
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = previousOpenAiApiKey;
  });

  it("records an agent run and tool calls without requiring OpenAI", async () => {
    const venue = await createVenue({
      name: "Observability Room",
      brandTone: "polished and direct",
      depositPolicy: "A deposit is required to hold a table.",
    });
    await createTableOption(venue.id, {
      name: "Main Room Booth",
      code: "MRB",
      capacityMin: 2,
      capacityMax: 6,
      minSpendCents: 120_000,
      depositAmountCents: 30_000,
    });
    const inquiry = await createInquiry(venue.id, {
      guestName: "Taylor Run",
      requestedDateLabel: "Friday",
      partySize: 4,
    });
    const guestMessage = await prisma.inquiryMessage.create({
      data: {
        inquiryId: inquiry.id,
        authorRole: "guest",
        content: "Looking for a table Friday for 4 people.",
      },
    });

    await runWebsiteChatAgent({
      inquiryId: inquiry.id,
      guestMessageId: guestMessage.id,
    });

    const run = await prisma.agentRun.findFirst({
      where: {
        inquiryId: inquiry.id,
        venueId: venue.id,
      },
      include: {
        toolCalls: {
          orderBy: { startedAt: "asc" },
        },
      },
    });

    expect(run).toBeTruthy();
    expect(run?.channel).toBe("WEBSITE_CHAT");
    expect(run?.status).toBe("COMPLETED");
    expect(run?.model).toBe("gpt-4.1-mini");
    expect(run?.intent).toBeTruthy();
    expect(run?.confidence).toBeGreaterThanOrEqual(0);
    expect(run?.durationMs).toBeGreaterThanOrEqual(0);
    expect(run?.toolCalls.map((toolCall) => toolCall.toolName)).toEqual(
      expect.arrayContaining([
        "searchVenueKnowledge",
        "recommendPackage",
        "createQuote",
        "createReservation",
        "createDepositCheckout",
        "scheduleFollowUp",
      ]),
    );
    expect(run?.toolCalls.every((toolCall) => toolCall.inputSummary !== null)).toBe(true);
    expect(run?.toolCalls.every((toolCall) => toolCall.status !== "FAILED")).toBe(true);
  });

  it("schedules unpaid deposit follow-up tasks when venue config allows reminders", async () => {
    const venue = await createVenue({
      name: "Reminder Room",
      brandTone: "polished and direct",
      depositPolicy: "A deposit is required to hold a table.",
      depositCheckoutMode: "MOCK",
    });
    await createTableOption(venue.id, {
      name: "Main Room Booth",
      code: "MRB",
      capacityMin: 2,
      capacityMax: 6,
      minSpendCents: 120_000,
      depositAmountCents: 30_000,
    });
    await prisma.venueAgentConfig.create({
      data: {
        venueId: venue.id,
        enabled: true,
        agentName: "Reminder Room Concierge",
        brandVoice: "polished and direct",
        autonomyLevel: 5,
        canAnswerFaqs: true,
        canQualifyLeads: true,
        canRecommendPackages: true,
        canCreateQuotes: true,
        canSendDepositLinks: true,
        canCreateReservations: true,
        confidenceThreshold: 0.5,
        escalationRules: {
          escalateOnLowConfidence: true,
          lowConfidenceThreshold: 0.5,
          escalateForVipRequests: true,
          escalateForUnavailableInventory: true,
          escalateForOversizedParty: true,
        },
        followUpRules: {
          enabled: true,
          unpaidDepositReminderHours: 2,
          abandonedChatReminderHours: null,
        },
        enabledChannels: "WEBSITE_CHAT",
      },
    });
    const inquiry = await createInquiry(venue.id, {
      guestName: "Jordan Reminder",
      phone: "2674756962",
      requestedDateLabel: "Friday",
      partySize: 4,
      spendIntentLabel: "$1500",
    });
    const guestMessage = await prisma.inquiryMessage.create({
      data: {
        inquiryId: inquiry.id,
        authorRole: "guest",
        content: "Friday for 4, I can do the booth and my phone is 2674756962. Send the deposit link.",
      },
    });

    await runWebsiteChatAgent({
      inquiryId: inquiry.id,
      guestMessageId: guestMessage.id,
    });

    const task = await prisma.workflowTask.findFirst({
      where: {
        venueId: venue.id,
        inquiryId: inquiry.id,
        type: "UNPAID_DEPOSIT_REMINDER",
      },
    });
    const scheduleToolCall = await prisma.agentToolCall.findFirst({
      where: {
        venueId: venue.id,
        inquiryId: inquiry.id,
        toolName: "scheduleFollowUp",
      },
    });

    expect(task?.status).toBe("PENDING");
    expect(task?.scheduledFor.getTime()).toBeGreaterThan(Date.now());
    expect(scheduleToolCall?.status).toBe("COMPLETED");
  });
});
