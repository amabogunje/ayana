import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OperatorAgentSettingsForm } from "@/components/operator-agent-settings-form";
import type { OperatorVenueAgentSettings } from "@/lib/operator-types";

function makeSettings(overrides: Partial<OperatorVenueAgentSettings> = {}): OperatorVenueAgentSettings {
  const base: OperatorVenueAgentSettings = {
    venue: {
      id: "venue_1",
      name: "Render Room",
      brandTone: "polished",
      aiEnabled: true,
      websiteChatEnabled: false,
      websiteChatWidgetKey: "wc_render",
    },
    config: {
      id: "config_1",
      source: "persisted",
      enabled: true,
      agentName: "Render Room Concierge",
      brandVoice: "Concise and helpful.",
      autonomyLevel: 2,
      confidenceThreshold: 0.7,
      enabledChannels: ["website_chat"],
      actionPermissions: {
        canAnswerFaqs: true,
        canQualifyLeads: true,
        canRecommendPackages: true,
        canCreateQuotes: true,
        canSendDepositLinks: true,
        canCreateReservations: true,
      },
      escalationRules: {
        escalateOnLowConfidence: true,
        lowConfidenceThreshold: 0.7,
        escalateForVipRequests: true,
        escalateForUnavailableInventory: true,
        escalateForOversizedParty: true,
        partySizeThreshold: 12,
      },
      followUpRules: {
        enabled: false,
        unpaidDepositReminderHours: null,
        abandonedChatReminderHours: null,
      },
      advancedInstructions: "Mention valet only when asked.",
    },
  };

  return {
    ...base,
    ...overrides,
    venue: {
      ...base.venue,
      ...overrides.venue,
    },
    config: {
      ...base.config,
      ...overrides.config,
      actionPermissions: {
        ...base.config.actionPermissions,
        ...overrides.config?.actionPermissions,
      },
      escalationRules: {
        ...base.config.escalationRules,
        ...overrides.config?.escalationRules,
      },
      followUpRules: {
        ...base.config.followUpRules,
        ...overrides.config?.followUpRules,
      },
    },
  };
}

describe("OperatorAgentSettingsForm", () => {
  it("renders runtime-truthful agent settings guidance", () => {
    const html = renderToStaticMarkup(<OperatorAgentSettingsForm settings={makeSettings()} />);

    expect(html).toContain("Autonomy is the ceiling");
    expect(html).toContain("Limited by Level 2");
    expect(html).toContain("Venue chat");
    expect(html).toContain("Agent chat");
    expect(html).toContain("Venue channel off");
    expect(html).toContain("Stored for a future prompt policy pass");
    expect(html).toContain("name=\"advancedInstructions\"");
    expect(html).toContain("value=\"Mention valet only when asked.\"");
  });
});
