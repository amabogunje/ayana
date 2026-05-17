import { describe, expect, it } from "vitest";
import {
  evaluateAgentActionPolicy,
  evaluateConversationSafetyPolicy,
  evaluatePackagePolicy,
  evaluateReservationDepositPolicy,
} from "@/lib/agent/agent-policies";
import { getDefaultVenueAgentConfig } from "@/lib/venue-agent/venue-agent-config-service";
import type { VenueAgentConfig } from "@/lib/venue-agent/venue-agent-types";

const tableOption = {
  id: "table_1",
  name: "Main Booth",
  capacityMin: 2,
  capacityMax: 6,
  minSpendCents: 100_000,
  depositAmountCents: 25_000,
  description: "Main room booth.",
};

function defaultConfig(overrides: Partial<VenueAgentConfig> = {}): VenueAgentConfig {
  const config = getDefaultVenueAgentConfig({
    venueId: "venue_1",
    venueName: "Policy Room",
    brandVoice: "polished",
  });

  return {
    ...config,
    ...overrides,
    actionPermissions: {
      ...config.actionPermissions,
      ...overrides.actionPermissions,
    },
    escalationRules: {
      ...config.escalationRules,
      ...overrides.escalationRules,
    },
    toolPermissions: overrides.toolPermissions ?? config.toolPermissions,
  };
}

describe("agent policies", () => {
  it("escalates explicit human requests, VIP/custom requests, and oversized parties", () => {
    expect(
      evaluateConversationSafetyPolicy({
        config: defaultConfig(),
        channel: "website_chat",
        latestGuestMessage: "Can I speak to a real person?",
      }).code,
    ).toBe("explicit_human_request");

    expect(
      evaluateConversationSafetyPolicy({
        config: defaultConfig(),
        channel: "website_chat",
        latestGuestMessage: "We need something custom and VIP for a celebrity.",
      }).code,
    ).toBe("vip_custom_request");

    expect(
      evaluateConversationSafetyPolicy({
        config: defaultConfig(),
        channel: "website_chat",
        latestGuestMessage: "Need a table for 40",
        knownPartySize: 40,
        largestCapacity: 6,
      }).code,
    ).toBe("party_too_large");

    expect(
      evaluateConversationSafetyPolicy({
        config: defaultConfig({
          escalationRules: {
            escalateOnLowConfidence: true,
            lowConfidenceThreshold: 0.5,
            escalateForVipRequests: true,
            escalateForUnavailableInventory: true,
            escalateForOversizedParty: true,
            partySizeThreshold: 10,
          },
        }),
        channel: "website_chat",
        latestGuestMessage: "Need a table for 12",
        knownPartySize: 12,
        largestCapacity: 20,
      }).code,
    ).toBe("party_size_threshold");
  });

  it("enforces FAQ and qualification response permissions", () => {
    expect(
      evaluateAgentActionPolicy({
        config: defaultConfig({
          actionPermissions: {
            canAnswerFaqs: false,
            canQualifyLeads: true,
            canRecommendPackages: true,
            canCreateQuotes: true,
            canSendDepositLinks: true,
            canCreateReservations: true,
          },
        }),
        channel: "website_chat",
        latestGuestMessage: "Do you have parking?",
        isVenueKnowledgeQuestion: true,
        action: "respond",
      }).code,
    ).toBe("faq_not_allowed");

    expect(
      evaluateAgentActionPolicy({
        config: defaultConfig({
          autonomyLevel: 1,
        }),
        channel: "website_chat",
        latestGuestMessage: "Friday for 4 people",
        isVenueKnowledgeQuestion: false,
        action: "respond",
      }).code,
    ).toBe("qualification_not_allowed");

    expect(
      evaluateAgentActionPolicy({
        config: defaultConfig({
          autonomyLevel: 0,
        }),
        channel: "website_chat",
        latestGuestMessage: "Do you have parking?",
        isVenueKnowledgeQuestion: true,
        action: "respond",
      }).code,
    ).toBe("autonomy_draft_only");
  });

  it("blocks closed nights and missing phone before reservation deposit actions", () => {
    expect(
      evaluateReservationDepositPolicy({
        config: defaultConfig(),
        channel: "website_chat",
        latestGuestMessage: "Book it",
        hasPhone: true,
        readyForQuote: true,
        recommendedTableOption: tableOption,
        closedNight: {
          requestedDateLabel: "Tuesday",
          requestedWeekday: "Tuesday",
          nextOpenWeekday: "Friday",
        },
      }).code,
    ).toBe("closed_night");

    expect(
      evaluateReservationDepositPolicy({
        config: defaultConfig(),
        channel: "website_chat",
        latestGuestMessage: "Book it",
        hasPhone: false,
        readyForQuote: true,
        recommendedTableOption: tableOption,
      }).code,
    ).toBe("phone_required");
  });

  it("blocks unconfigured packages and possible invented discounts", () => {
    expect(
      evaluatePackagePolicy({
        config: defaultConfig(),
        channel: "website_chat",
        latestGuestMessage: "Quote that",
        readyForQuote: true,
        recommendedTableOption: null,
      }).code,
    ).toBe("unconfigured_package");

    expect(
      evaluatePackagePolicy({
        config: defaultConfig(),
        channel: "website_chat",
        latestGuestMessage: "Can you do a deal?",
        readyForQuote: true,
        recommendedTableOption: tableOption,
        proposedReply: "I can give you a free upgrade and discount.",
      }).code,
    ).toBe("invented_discount");
  });

  it("enforces venue config permissions and channel checks", () => {
    const noQuoteConfig = defaultConfig({
      actionPermissions: {
        canAnswerFaqs: true,
        canQualifyLeads: true,
        canRecommendPackages: true,
        canCreateQuotes: false,
        canSendDepositLinks: true,
        canCreateReservations: true,
      },
      toolPermissions: getDefaultVenueAgentConfig({
        venueId: "venue_1",
        venueName: "Policy Room",
      }).toolPermissions.map((permission) =>
        permission.toolName === "createQuote" ? { ...permission, enabled: false } : permission,
      ),
    });

    expect(
      evaluateAgentActionPolicy({
        config: noQuoteConfig,
        channel: "website_chat",
        latestGuestMessage: "Quote it",
        action: "createQuote",
        readyForQuote: true,
        recommendedTableOption: tableOption,
      }).code,
    ).toBe("create_quotes_not_allowed");

    expect(
      evaluateAgentActionPolicy({
        config: defaultConfig({ enabledChannels: ["sms"] }),
        channel: "website_chat",
        latestGuestMessage: "Hello",
        action: "respond",
      }).code,
    ).toBe("channel_not_allowed");
  });

  it("escalates below configured confidence threshold", () => {
    const decision = evaluateConversationSafetyPolicy({
      config: defaultConfig({
        confidenceThreshold: 0.8,
        escalationRules: {
          escalateOnLowConfidence: true,
          lowConfidenceThreshold: 0.8,
          escalateForVipRequests: true,
          escalateForUnavailableInventory: true,
          escalateForOversizedParty: true,
        },
      }),
      channel: "website_chat",
      latestGuestMessage: "Maybe not sure yet",
      aiConfidence: 0.4,
    });

    expect(decision.code).toBe("low_confidence");
    expect(decision.shouldEscalate).toBe(true);
  });

  it("blocks deposit links when venue config or tool permissions do not allow them", () => {
    const noDepositConfig = defaultConfig({
      actionPermissions: {
        canAnswerFaqs: true,
        canQualifyLeads: true,
        canRecommendPackages: true,
        canCreateQuotes: true,
        canSendDepositLinks: false,
        canCreateReservations: true,
      },
      toolPermissions: defaultConfig().toolPermissions.map((permission) =>
        permission.toolName === "createDepositCheckout" || permission.toolName === "sendDepositLink"
          ? { ...permission, enabled: false }
          : permission,
      ),
    });

    const decision = evaluateReservationDepositPolicy({
      config: noDepositConfig,
      channel: "website_chat",
      latestGuestMessage: "Send the deposit link",
      hasPhone: true,
      readyForQuote: true,
      recommendedTableOption: tableOption,
    });

    expect(decision.code).toBe("send_deposit_links_not_allowed");
    expect(decision.allowed).toBe(false);
  });

  it("enforces autonomy levels for package, quote, deposit, and reservation actions", () => {
    expect(
      evaluatePackagePolicy({
        config: defaultConfig({ autonomyLevel: 1 }),
        channel: "website_chat",
        latestGuestMessage: "Friday for 4 people",
        readyForQuote: true,
        recommendedTableOption: tableOption,
      }).code,
    ).toBe("recommend_packages_not_allowed");

    expect(
      evaluateAgentActionPolicy({
        config: defaultConfig({ autonomyLevel: 2 }),
        channel: "website_chat",
        latestGuestMessage: "Quote it",
        action: "createQuote",
        readyForQuote: true,
        recommendedTableOption: tableOption,
      }).code,
    ).toBe("create_quotes_not_allowed");

    expect(
      evaluateReservationDepositPolicy({
        config: defaultConfig({ autonomyLevel: 3 }),
        channel: "website_chat",
        latestGuestMessage: "Send the deposit link",
        hasPhone: true,
        readyForQuote: true,
        recommendedTableOption: tableOption,
      }).code,
    ).toBe("create_reservations_not_allowed");
  });
});
