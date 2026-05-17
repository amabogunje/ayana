import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  canVenueAgentCreateQuote,
  canVenueAgentCreateReservationDeposit,
  canVenueAgentUseWebsiteChat,
  ensureVenueAgentConfigForVenue,
  getVenueAgentConfigForVenue,
} from "@/lib/venue-agent/venue-agent-config-service";
import { createVenue, resetDatabase } from "../helpers/db";

describe("venue agent config service", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("derives behavior-preserving defaults from the venue", async () => {
    const venue = await createVenue({
      name: "Default Club",
      brandTone: "warm and sales-forward",
      aiEnabled: true,
      websiteChatEnabled: true,
    });

    const config = await getVenueAgentConfigForVenue({
      venueId: venue.id,
      venueName: venue.name,
      brandTone: venue.brandTone,
      aiEnabled: venue.aiEnabled,
      websiteChatEnabled: venue.websiteChatEnabled,
    });

    expect(config.source).toBe("venue_compatibility");
    expect(config.enabled).toBe(true);
    expect(config.agentName).toBe("Default Club Concierge");
    expect(config.brandVoice).toBe("warm and sales-forward");
    expect(config.autonomyLevel).toBe(5);
    expect(config.confidenceThreshold).toBe(0.5);
    expect(config.enabledChannels).toEqual(["website_chat"]);
    expect(config.actionPermissions).toMatchObject({
      canAnswerFaqs: true,
      canQualifyLeads: true,
      canRecommendPackages: true,
      canCreateQuotes: true,
      canSendDepositLinks: true,
      canCreateReservations: true,
    });
    expect(canVenueAgentUseWebsiteChat(config)).toBe(true);
    expect(canVenueAgentCreateQuote(config)).toBe(true);
    expect(canVenueAgentCreateReservationDeposit(config)).toBe(true);
  });

  it("persists defaults for a venue when requested", async () => {
    const venue = await createVenue({
      name: "Persisted Lounge",
      brandTone: "concise and polished",
    });

    const config = await ensureVenueAgentConfigForVenue({
      venueId: venue.id,
      venueName: venue.name,
      brandTone: venue.brandTone,
      aiEnabled: venue.aiEnabled,
      websiteChatEnabled: venue.websiteChatEnabled,
    });
    const storedCount = await prisma.venueAgentConfig.count({
      where: { venueId: venue.id },
    });

    expect(config.source).toBe("persisted");
    expect(storedCount).toBe(1);
    expect(config.brandVoice).toBe("concise and polished");
    expect(config.enabledChannels).toEqual(["website_chat"]);
  });

  it("honors persisted permission and autonomy checks", async () => {
    const venue = await createVenue({
      name: "Controlled Room",
      brandTone: "measured",
    });

    await prisma.venueAgentConfig.create({
      data: {
        venueId: venue.id,
        enabled: true,
        agentName: "Controlled Room Agent",
        brandVoice: "measured",
        autonomyLevel: 2,
        canAnswerFaqs: true,
        canQualifyLeads: true,
        canRecommendPackages: true,
        canCreateQuotes: false,
        canSendDepositLinks: false,
        canCreateReservations: false,
        confidenceThreshold: 0.7,
        escalationRules: {
          escalateOnLowConfidence: true,
          lowConfidenceThreshold: 0.7,
          escalateForVipRequests: true,
          escalateForUnavailableInventory: true,
          escalateForOversizedParty: true,
        },
        followUpRules: {
          enabled: false,
        },
        enabledChannels: "WEBSITE_CHAT",
      },
    });

    const config = await getVenueAgentConfigForVenue({
      venueId: venue.id,
      venueName: venue.name,
      brandTone: venue.brandTone,
      aiEnabled: venue.aiEnabled,
      websiteChatEnabled: venue.websiteChatEnabled,
    });

    expect(config.source).toBe("persisted");
    expect(config.confidenceThreshold).toBe(0.7);
    expect(canVenueAgentUseWebsiteChat(config)).toBe(true);
    expect(canVenueAgentCreateQuote(config)).toBe(false);
    expect(canVenueAgentCreateReservationDeposit(config)).toBe(false);
    expect(config.toolPermissions.find((permission) => permission.toolName === "createQuote")?.enabled).toBe(false);
    expect(config.toolPermissions.find((permission) => permission.toolName === "sendDepositLink")?.enabled).toBe(false);
  });

  it("keeps website chat disabled when venue compatibility disables the channel", async () => {
    const venue = await createVenue({
      name: "Quiet Room",
      websiteChatEnabled: false,
    });

    const config = await getVenueAgentConfigForVenue({
      venueId: venue.id,
      venueName: venue.name,
      brandTone: venue.brandTone,
      aiEnabled: venue.aiEnabled,
      websiteChatEnabled: venue.websiteChatEnabled,
    });

    expect(config.enabledChannels).toEqual([]);
    expect(canVenueAgentUseWebsiteChat(config)).toBe(false);
  });

  it("keeps an explicitly empty persisted channel list disabled", async () => {
    const venue = await createVenue({
      name: "Persisted Silent Room",
      websiteChatEnabled: true,
    });

    await prisma.venueAgentConfig.create({
      data: {
        venueId: venue.id,
        enabled: true,
        agentName: "Silent Room Agent",
        brandVoice: "measured",
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
          enabled: false,
        },
        enabledChannels: "",
      },
    });

    const config = await getVenueAgentConfigForVenue({
      venueId: venue.id,
      venueName: venue.name,
      brandTone: venue.brandTone,
      aiEnabled: venue.aiEnabled,
      websiteChatEnabled: venue.websiteChatEnabled,
    });

    expect(config.source).toBe("persisted");
    expect(config.enabledChannels).toEqual([]);
    expect(canVenueAgentUseWebsiteChat(config)).toBe(false);
  });

  it("derives tool permissions from autonomy level and action switches", async () => {
    const venue = await createVenue({
      name: "Autonomy Room",
    });

    await prisma.venueAgentConfig.create({
      data: {
        venueId: venue.id,
        enabled: true,
        agentName: "Autonomy Room Agent",
        brandVoice: "measured",
        autonomyLevel: 2,
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
          enabled: false,
        },
        enabledChannels: "WEBSITE_CHAT",
      },
    });

    const config = await getVenueAgentConfigForVenue({
      venueId: venue.id,
      venueName: venue.name,
      brandTone: venue.brandTone,
      aiEnabled: venue.aiEnabled,
      websiteChatEnabled: venue.websiteChatEnabled,
    });

    expect(config.toolPermissions.find((permission) => permission.toolName === "searchVenueKnowledge")?.enabled).toBe(true);
    expect(config.toolPermissions.find((permission) => permission.toolName === "recommendPackage")?.enabled).toBe(true);
    expect(config.toolPermissions.find((permission) => permission.toolName === "createQuote")?.enabled).toBe(false);
    expect(config.toolPermissions.find((permission) => permission.toolName === "createDepositCheckout")?.enabled).toBe(false);
    expect(config.toolPermissions.find((permission) => permission.toolName === "createReservation")?.enabled).toBe(false);
    expect(canVenueAgentCreateQuote(config)).toBe(false);
    expect(canVenueAgentCreateReservationDeposit(config)).toBe(false);
  });

  it("allows venue-specific config differences across venues", async () => {
    const autopilotVenue = await createVenue({ name: "Autopilot Room" });
    const draftOnlyVenue = await createVenue({ name: "Draft Room" });

    await prisma.venueAgentConfig.create({
      data: {
        venueId: draftOnlyVenue.id,
        enabled: true,
        agentName: "Draft Room Concierge",
        brandVoice: "measured",
        autonomyLevel: 1,
        canAnswerFaqs: true,
        canQualifyLeads: true,
        canRecommendPackages: false,
        canCreateQuotes: false,
        canSendDepositLinks: false,
        canCreateReservations: false,
        confidenceThreshold: 0.85,
        escalationRules: {
          escalateOnLowConfidence: true,
          lowConfidenceThreshold: 0.85,
          escalateForVipRequests: true,
          escalateForUnavailableInventory: true,
          escalateForOversizedParty: true,
        },
        followUpRules: {
          enabled: false,
        },
        enabledChannels: "WEBSITE_CHAT",
      },
    });

    const autopilotConfig = await getVenueAgentConfigForVenue({
      venueId: autopilotVenue.id,
      venueName: autopilotVenue.name,
      brandTone: autopilotVenue.brandTone,
      aiEnabled: autopilotVenue.aiEnabled,
      websiteChatEnabled: autopilotVenue.websiteChatEnabled,
    });
    const draftOnlyConfig = await getVenueAgentConfigForVenue({
      venueId: draftOnlyVenue.id,
      venueName: draftOnlyVenue.name,
      brandTone: draftOnlyVenue.brandTone,
      aiEnabled: draftOnlyVenue.aiEnabled,
      websiteChatEnabled: draftOnlyVenue.websiteChatEnabled,
    });

    expect(canVenueAgentCreateReservationDeposit(autopilotConfig)).toBe(true);
    expect(canVenueAgentCreateReservationDeposit(draftOnlyConfig)).toBe(false);
    expect(draftOnlyConfig.confidenceThreshold).toBe(0.85);
  });
});
