import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createInquiry, createTableOption, createVenue, resetDatabase } from "../helpers/db";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("operator service", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("rejects illegal inquiry status transitions", async () => {
    const { updateOperatorInquiryStatus } = await import("@/lib/operator-service");
    const venue = await createVenue();
    const inquiry = await createInquiry(venue.id, { status: "NEW" });

    await expect(updateOperatorInquiryStatus(venue.id, inquiry.id, "CONFIRMED")).rejects.toThrow(
      "Cannot move inquiry from NEW to CONFIRMED.",
    );
  });

  it("creates a quote and moves the inquiry to quoted", async () => {
    const { createOperatorQuote } = await import("@/lib/operator-service");
    const venue = await createVenue();
    const tableOption = await createTableOption(venue.id);
    const inquiry = await createInquiry(venue.id);

    const quote = await createOperatorQuote(venue.id, inquiry.id, {
      tableOptionId: tableOption.id,
      label: "Prime table",
      pitch: "Best fit for the group.",
      markSent: true,
    });

    const updatedInquiry = await prisma.inquiry.findUnique({ where: { id: inquiry.id } });
    expect(quote.sentAt).toBeInstanceOf(Date);
    expect(updatedInquiry?.status).toBe("QUOTED");
    expect(updatedInquiry?.isHumanTakeover).toBe(false);
  });

  it("prevents confirming reservations before full deposit is paid", async () => {
    const { createOperatorReservation } = await import("@/lib/operator-service");
    const venue = await createVenue();
    const tableOption = await createTableOption(venue.id);
    const inquiry = await createInquiry(venue.id, { status: "QUOTED" });

    await expect(
      createOperatorReservation(venue.id, inquiry.id, {
        tableOptionId: tableOption.id,
        status: "CONFIRMED",
        depositPaidDollars: 50,
        notes: "",
        arrivalTimeLabel: "Saturday 11 PM",
      }),
    ).rejects.toThrow("A reservation cannot be confirmed until the full deposit is paid.");
  });

  it("creates deposit-pending reservations and syncs inquiry status", async () => {
    const { createOperatorReservation } = await import("@/lib/operator-service");
    const venue = await createVenue();
    const tableOption = await createTableOption(venue.id);
    const inquiry = await createInquiry(venue.id, { status: "QUOTED" });

    const reservation = await createOperatorReservation(venue.id, inquiry.id, {
      tableOptionId: tableOption.id,
      status: "DEPOSIT_PENDING",
      depositPaidDollars: 0,
      notes: "Window preferred.",
      arrivalTimeLabel: "Saturday 11 PM",
    });

    const updatedInquiry = await prisma.inquiry.findUnique({ where: { id: inquiry.id } });
    expect(reservation.depositAmountCents).toBe(20_000);
    expect(reservation.status).toBe("DEPOSIT_PENDING");
    expect(updatedInquiry?.status).toBe("DEPOSIT_SENT");
  });

  it("updates venue agent configuration from validated operator input", async () => {
    const { getOperatorVenueAgentSettings, updateOperatorVenueAgentConfig } = await import("@/lib/operator-service");
    const venue = await createVenue({ name: "Config Club", brandTone: "warm" });

    await updateOperatorVenueAgentConfig(venue.id, {
      enabled: true,
      agentName: "Config Club Host",
      brandVoice: "Direct, polished, and concise.",
      autonomyLevel: 3,
      canAnswerFaqs: true,
      canQualifyLeads: true,
      canRecommendPackages: true,
      canCreateQuotes: true,
      canSendDepositLinks: false,
      canCreateReservations: false,
      confidenceThreshold: 0.75,
      escalateOnLowConfidence: true,
      escalateForVipRequests: true,
      escalateForUnavailableInventory: true,
      escalateForOversizedParty: true,
      partySizeThreshold: 14,
      websiteChatEnabled: true,
      advancedInstructions: "Mention valet only when asked.",
    });

    const settings = await getOperatorVenueAgentSettings(venue.id);
    const stored = await prisma.venueAgentConfig.findUnique({ where: { venueId: venue.id } });

    expect(settings?.config.agentName).toBe("Config Club Host");
    expect(settings?.config.autonomyLevel).toBe(3);
    expect(settings?.config.confidenceThreshold).toBe(0.75);
    expect(settings?.config.actionPermissions.canSendDepositLinks).toBe(false);
    expect(settings?.config.enabledChannels).toEqual(["website_chat"]);
    expect(settings?.config.escalationRules.partySizeThreshold).toBe(14);
    expect(stored?.advancedInstructions).toBe("Mention valet only when asked.");
  });

  it("rejects invalid venue agent confidence thresholds", async () => {
    const { updateOperatorVenueAgentConfig } = await import("@/lib/operator-service");
    const venue = await createVenue();

    await expect(
      updateOperatorVenueAgentConfig(venue.id, {
        enabled: true,
        agentName: "Invalid Host",
        brandVoice: "Helpful.",
        autonomyLevel: 5,
        canAnswerFaqs: true,
        canQualifyLeads: true,
        canRecommendPackages: true,
        canCreateQuotes: true,
        canSendDepositLinks: true,
        canCreateReservations: true,
        confidenceThreshold: 1.5,
        escalateOnLowConfidence: true,
        escalateForVipRequests: true,
        escalateForUnavailableInventory: true,
        escalateForOversizedParty: true,
        partySizeThreshold: null,
        websiteChatEnabled: true,
        advancedInstructions: "",
      }),
    ).rejects.toThrow("Confidence threshold must be between 0 and 1.");
  });

  it("resets venue agent configuration to compatibility defaults", async () => {
    const { getOperatorVenueAgentSettings, resetOperatorVenueAgentConfig, updateOperatorVenueAgentConfig } =
      await import("@/lib/operator-service");
    const venue = await createVenue({ name: "Reset Room", brandTone: "bright", websiteChatEnabled: true });

    await updateOperatorVenueAgentConfig(venue.id, {
      enabled: false,
      agentName: "Paused Host",
      brandVoice: "Muted.",
      autonomyLevel: 1,
      canAnswerFaqs: true,
      canQualifyLeads: false,
      canRecommendPackages: false,
      canCreateQuotes: false,
      canSendDepositLinks: false,
      canCreateReservations: false,
      confidenceThreshold: 0.9,
      escalateOnLowConfidence: true,
      escalateForVipRequests: false,
      escalateForUnavailableInventory: true,
      escalateForOversizedParty: true,
      partySizeThreshold: 20,
      websiteChatEnabled: false,
      advancedInstructions: "Temporary override.",
    });

    await resetOperatorVenueAgentConfig(venue.id);
    const settings = await getOperatorVenueAgentSettings(venue.id);

    expect(settings?.config.enabled).toBe(true);
    expect(settings?.config.agentName).toBe("Reset Room Concierge");
    expect(settings?.config.brandVoice).toBe("bright");
    expect(settings?.config.autonomyLevel).toBe(5);
    expect(settings?.config.enabledChannels).toEqual(["website_chat"]);
    expect(settings?.config.advancedInstructions).toBeNull();
  });
});
