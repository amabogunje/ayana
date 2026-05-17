import type { ConversationChannel } from "@/lib/conversation/conversation-types";
import type { AgentToolName } from "@/lib/agent-tools/tool-types";
import type { TableOptionForAgent } from "@/lib/agent-tools/table-options-tool";
import type { VenueAgentConfig } from "@/lib/venue-agent/venue-agent-types";

export type AgentPolicyStatus = "allowed" | "blocked" | "escalate";

export type AgentPolicyDecision = {
  status: AgentPolicyStatus;
  allowed: boolean;
  shouldEscalate: boolean;
  reason: string;
  code: string;
  safeNextAction: string;
  requiresHumanApproval: boolean;
};

export type ClosedNightPolicyInput = {
  requestedDateLabel: string;
  requestedWeekday: string;
  nextOpenWeekday: string | null;
} | null;

export type AgentPolicyContext = {
  config: VenueAgentConfig;
  channel: ConversationChannel;
  latestGuestMessage: string;
  aiConfidence?: number | null;
  hasPhone?: boolean;
  isVenueKnowledgeQuestion?: boolean;
  isHumanTakeover?: boolean;
  readyForQuote?: boolean;
  closedNight?: ClosedNightPolicyInput;
  recommendedTableOption?: TableOptionForAgent | null;
  knownPartySize?: number | null;
  largestCapacity?: number;
  proposedReply?: string | null;
};

export type AgentActionPolicyInput = AgentPolicyContext & {
  action: "respond" | "recommendPackage" | "createQuote" | "createReservationDeposit";
};

function isFaqOrVenueKnowledgeTurn(input: AgentPolicyContext) {
  return Boolean(input.isVenueKnowledgeQuestion);
}

const allowedDecision = (reason: string, code = "allowed"): AgentPolicyDecision => ({
  status: "allowed",
  allowed: true,
  shouldEscalate: false,
  reason,
  code,
  safeNextAction: "Continue with the proposed agent action.",
  requiresHumanApproval: false,
});

const blockedDecision = (
  reason: string,
  code: string,
  safeNextAction: string,
): AgentPolicyDecision => ({
  status: "blocked",
  allowed: false,
  shouldEscalate: false,
  reason,
  code,
  safeNextAction,
  requiresHumanApproval: false,
});

const escalationDecision = (
  reason: string,
  code: string,
  safeNextAction = "Hand off to a venue operator.",
): AgentPolicyDecision => ({
  status: "escalate",
  allowed: false,
  shouldEscalate: true,
  reason,
  code,
  safeNextAction,
  requiresHumanApproval: true,
});

export function isExplicitHumanRequest(message: string) {
  return /\bi want a human\b|\breal person\b|\bspeak to someone\b|\btalk to someone\b|\bhuman please\b/.test(
    message.toLowerCase(),
  );
}

export function isVipCustomRequest(message: string) {
  return /\bcustom\b|\bvip\b|\bcelebrity\b|\bbuyout\b|\bprivate\s+(?:area|room|section)\b|\bspecial setup\b|\bsomething special\b/.test(
    message.toLowerCase(),
  );
}

export function includesPotentiallyInventedDiscount(reply: string | null | undefined) {
  if (!reply) return false;

  return /\bdiscount\b|\bdeal\b|\bcomp(?:ed|s)?\b|\bfree\b|\bwaive\b|\breduced\b|\bcheaper than\b/i.test(reply);
}

export function evaluateToolPolicy(input: {
  config: VenueAgentConfig;
  channel: ConversationChannel;
  toolName: AgentToolName;
}): AgentPolicyDecision {
  if (!input.config.enabled) {
    return escalationDecision(
      "Venue agent automation is disabled.",
      "agent_disabled",
      "Route the conversation to a venue operator.",
    );
  }

  if (!input.config.enabledChannels.includes(input.channel)) {
    return escalationDecision(
      `${input.channel} is not enabled for this venue agent.`,
      "channel_not_allowed",
      "Route the conversation to a venue operator.",
    );
  }

  const permission = input.config.toolPermissions.find((item) => item.toolName === input.toolName);

  if (!permission?.enabled) {
    return blockedDecision(
      `${input.toolName} is not enabled for this venue agent.`,
      "tool_not_allowed",
      "Do not run the tool; continue the conversation or hand off if the guest is ready for that action.",
    );
  }

  if (permission.allowedChannels && !permission.allowedChannels.includes(input.channel)) {
    return blockedDecision(
      `${input.toolName} is not allowed on ${input.channel}.`,
      "tool_channel_not_allowed",
      "Do not run the tool on this channel.",
    );
  }

  return {
    ...allowedDecision(`${input.toolName} is allowed by the current venue agent configuration.`, "tool_allowed"),
    requiresHumanApproval: Boolean(permission.requiresHumanApproval),
  };
}

export function evaluateResponsePolicy(input: {
  config: VenueAgentConfig;
  isVenueKnowledgeQuestion?: boolean;
  aiConfidence?: number | null;
}): AgentPolicyDecision {
  if (input.config.autonomyLevel <= 0) {
    return escalationDecision(
      "Venue agent autonomy is draft-only.",
      "autonomy_draft_only",
      "Route the conversation to a venue operator before any customer-facing AI reply.",
    );
  }

  if (input.isVenueKnowledgeQuestion) {
    if (!input.config.actionPermissions.canAnswerFaqs || input.config.autonomyLevel < 1) {
      return escalationDecision(
        "Venue agent is not allowed to answer FAQs on this channel.",
        "faq_not_allowed",
        "Hand off the FAQ to a venue operator.",
      );
    }
  } else if (!input.config.actionPermissions.canQualifyLeads || input.config.autonomyLevel < 2) {
    return escalationDecision(
      "Venue agent is not allowed to qualify leads autonomously.",
      "qualification_not_allowed",
      "Hand off the lead to a venue operator.",
    );
  }

  const threshold = input.config.confidenceThreshold ?? input.config.escalationRules.lowConfidenceThreshold;
  const confidence = input.aiConfidence ?? 1;

  if (input.config.escalationRules.escalateOnLowConfidence && confidence < threshold) {
    return escalationDecision(
      `AI confidence ${confidence} is below the configured threshold ${threshold}.`,
      "low_confidence",
    );
  }

  return allowedDecision("Response is allowed by the current venue agent configuration.", "response_allowed");
}

export function evaluateConversationSafetyPolicy(input: AgentPolicyContext): AgentPolicyDecision {
  if (!input.config.enabled) {
    return escalationDecision(
      "Venue agent automation is disabled.",
      "agent_disabled",
      "Route the conversation to a venue operator.",
    );
  }

  if (!input.config.enabledChannels.includes(input.channel)) {
    return escalationDecision(
      `${input.channel} is not enabled for this venue agent.`,
      "channel_not_allowed",
      "Route the conversation to a venue operator.",
    );
  }

  if (isExplicitHumanRequest(input.latestGuestMessage)) {
    return escalationDecision(
      "Guest explicitly requested a human.",
      "explicit_human_request",
      "Hand off to a venue operator.",
    );
  }

  if (input.config.escalationRules.escalateForVipRequests && isVipCustomRequest(input.latestGuestMessage)) {
    return escalationDecision(
      "Guest requested a VIP, custom, or special setup.",
      "vip_custom_request",
      "Hand off to a venue operator for custom handling.",
    );
  }

  const largestCapacity = input.largestCapacity ?? 0;
  const configuredPartySizeThreshold = input.config.escalationRules.partySizeThreshold ?? null;
  if (
    input.config.escalationRules.escalateForOversizedParty &&
    input.knownPartySize &&
    configuredPartySizeThreshold &&
    input.knownPartySize > configuredPartySizeThreshold
  ) {
    return escalationDecision(
      `Party size ${input.knownPartySize} exceeds configured escalation threshold ${configuredPartySizeThreshold}.`,
      "party_size_threshold",
      "Hand off to a venue operator for custom availability.",
    );
  }

  if (
    input.config.escalationRules.escalateForOversizedParty &&
    input.knownPartySize &&
    largestCapacity > 0 &&
    input.knownPartySize > largestCapacity
  ) {
    return escalationDecision(
      `Party size ${input.knownPartySize} exceeds configured capacity ${largestCapacity}.`,
      "party_too_large",
      "Hand off to a venue operator for custom availability.",
    );
  }

  if (!input.isHumanTakeover) {
    const confidenceDecision = evaluateResponsePolicy({
      config: input.config,
      isVenueKnowledgeQuestion: isFaqOrVenueKnowledgeTurn(input),
      aiConfidence: input.aiConfidence,
    });
    if (!confidenceDecision.allowed) {
      return confidenceDecision;
    }
  }

  return allowedDecision("Conversation-level policy checks passed.", "conversation_allowed");
}

export function evaluatePackagePolicy(input: AgentPolicyContext): AgentPolicyDecision {
  if (!input.config.actionPermissions.canRecommendPackages || input.config.autonomyLevel < 2) {
    return blockedDecision(
      "Venue agent is not allowed to recommend packages autonomously.",
      "recommend_packages_not_allowed",
      "Do not recommend a package; hand off to a venue operator if the guest needs package guidance.",
    );
  }

  const toolDecision = evaluateToolPolicy({
    config: input.config,
    channel: input.channel,
    toolName: "recommendPackage",
  });
  if (!toolDecision.allowed) return toolDecision;

  if (
    input.readyForQuote &&
    !input.recommendedTableOption &&
    !input.isVenueKnowledgeQuestion
  ) {
    return blockedDecision(
      "The agent requested a quote-ready recommendation, but no configured package matches.",
      "unconfigured_package",
      "Do not quote or imply an unconfigured package; explain that only configured table options can be offered.",
    );
  }

  if (input.proposedReply && includesPotentiallyInventedDiscount(input.proposedReply)) {
    return blockedDecision(
      "The proposed reply may imply a discount, comp, or unconfigured deal.",
      "invented_discount",
      "Keep the reply anchored to configured package minimums and deposits only.",
    );
  }

  return allowedDecision("Package recommendation policy checks passed.", "package_allowed");
}

export function evaluateQuotePolicy(input: AgentPolicyContext): AgentPolicyDecision {
  if (!input.config.actionPermissions.canCreateQuotes || input.config.autonomyLevel < 3) {
    return blockedDecision(
      "Venue agent is not allowed to create quotes autonomously.",
      "create_quotes_not_allowed",
      "Do not create a quote; keep the conversation in qualification or hand off to a venue operator.",
    );
  }

  const toolDecision = evaluateToolPolicy({
    config: input.config,
    channel: input.channel,
    toolName: "createQuote",
  });
  if (!toolDecision.allowed) return toolDecision;

  const packageDecision = evaluatePackagePolicy(input);
  if (!packageDecision.allowed) return packageDecision;

  if (input.closedNight) {
    return blockedDecision(
      `Cannot quote ${input.closedNight.requestedDateLabel}; venue is closed on ${input.closedNight.requestedWeekday}.`,
      "closed_night",
      "Do not create a quote; tell the guest the requested night is closed.",
    );
  }

  return allowedDecision("Quote creation policy checks passed.", "quote_allowed");
}

export function evaluateReservationDepositPolicy(input: AgentPolicyContext): AgentPolicyDecision {
  if (!input.config.actionPermissions.canCreateReservations || input.config.autonomyLevel < 4) {
    return blockedDecision(
      "Venue agent is not allowed to create reservations autonomously.",
      "create_reservations_not_allowed",
      "Do not create a reservation; hand off if the guest is ready to book.",
    );
  }

  if (!input.config.actionPermissions.canSendDepositLinks || input.config.autonomyLevel < 3) {
    return blockedDecision(
      "Venue agent is not allowed to send deposit links autonomously.",
      "send_deposit_links_not_allowed",
      "Do not send a deposit link; hand off if the guest is ready to pay.",
    );
  }

  const reservationDecision = evaluateToolPolicy({
    config: input.config,
    channel: input.channel,
    toolName: "createReservation",
  });
  if (!reservationDecision.allowed) return reservationDecision;

  const depositDecision = evaluateToolPolicy({
    config: input.config,
    channel: input.channel,
    toolName: "createDepositCheckout",
  });
  if (!depositDecision.allowed) return depositDecision;

  const quoteDecision = evaluateQuotePolicy(input);
  if (!quoteDecision.allowed) return quoteDecision;

  if (!input.hasPhone) {
    return blockedDecision(
      "A valid phone number is required before sending a deposit link.",
      "phone_required",
      "Collect a valid phone number before creating or sending a deposit link.",
    );
  }

  return allowedDecision("Reservation and deposit policy checks passed.", "reservation_deposit_allowed");
}

export function evaluateAgentActionPolicy(input: AgentActionPolicyInput): AgentPolicyDecision {
  const conversationDecision = evaluateConversationSafetyPolicy(input);
  if (!conversationDecision.allowed) return conversationDecision;

  switch (input.action) {
    case "respond":
      return allowedDecision("Response policy checks passed.", "respond_allowed");
    case "recommendPackage":
      return evaluatePackagePolicy(input);
    case "createQuote":
      return evaluateQuotePolicy(input);
    case "createReservationDeposit":
      return evaluateReservationDepositPolicy(input);
  }
}
