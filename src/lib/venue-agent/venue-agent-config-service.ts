import { prisma } from "@/lib/prisma";
import type { ConversationChannel } from "@/lib/conversation/conversation-types";
import type { AgentToolName, AgentToolPermission } from "@/lib/agent-tools/tool-types";
import type {
  VenueAgentActionPermissions,
  VenueAgentAutonomyLevel,
  VenueAgentConfig,
  VenueAgentEscalationRules,
  VenueAgentFollowUpRules,
} from "@/lib/venue-agent/venue-agent-types";

type PersistedVenueAgentConfig = {
  id: string;
  venueId: string;
  enabled: boolean;
  agentName: string;
  brandVoice: string;
  autonomyLevel: number;
  canAnswerFaqs: boolean;
  canQualifyLeads: boolean;
  canRecommendPackages: boolean;
  canCreateQuotes: boolean;
  canSendDepositLinks: boolean;
  canCreateReservations: boolean;
  confidenceThreshold: number;
  escalationRules: unknown;
  followUpRules: unknown;
  advancedInstructions: string | null;
  enabledChannels: string;
};

type VenueCompatibilityInput = {
  venueId: string;
  venueName: string;
  brandTone?: string | null;
  aiEnabled?: boolean | null;
  websiteChatEnabled?: boolean | null;
};

const defaultToolNames: AgentToolName[] = [
  "searchVenueKnowledge",
  "getTableOptions",
  "recommendPackage",
  "createQuote",
  "createReservation",
  "createDepositCheckout",
  "sendDepositLink",
  "assignHumanOperator",
  "summarizeConversation",
];

const channelToPersistedValue: Record<ConversationChannel, string> = {
  website_chat: "WEBSITE_CHAT",
  sms: "SMS",
  instagram_dm: "INSTAGRAM_DM",
  whatsapp: "WHATSAPP",
  email: "EMAIL",
  voice: "VOICE",
  operator_dashboard: "OPERATOR_DASHBOARD",
};

const persistedValueToChannel: Record<string, ConversationChannel> = Object.fromEntries(
  Object.entries(channelToPersistedValue).map(([channel, persisted]) => [persisted, channel]),
) as Record<string, ConversationChannel>;

export const defaultVenueAgentActionPermissions: VenueAgentActionPermissions = {
  canAnswerFaqs: true,
  canQualifyLeads: true,
  canRecommendPackages: true,
  canCreateQuotes: true,
  canSendDepositLinks: true,
  canCreateReservations: true,
};

export const defaultVenueAgentEscalationRules: VenueAgentEscalationRules = {
  escalateOnLowConfidence: true,
  lowConfidenceThreshold: 0.5,
  escalateForVipRequests: true,
  escalateForUnavailableInventory: true,
  escalateForOversizedParty: true,
  partySizeThreshold: null,
};

export const defaultVenueAgentFollowUpRules: VenueAgentFollowUpRules = {
  enabled: false,
  unpaidDepositReminderHours: null,
  abandonedChatReminderHours: null,
};

function clampAutonomyLevel(value: number): VenueAgentAutonomyLevel {
  if (value <= 0) return 0;
  if (value >= 5) return 5;
  return Math.round(value) as VenueAgentAutonomyLevel;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseEnabledChannels(value: string | null | undefined): ConversationChannel[] {
  const channels = (value ?? "")
    .split(",")
    .map((item) => persistedValueToChannel[item.trim().toUpperCase()])
    .filter((item): item is ConversationChannel => Boolean(item));

  return channels;
}

function serializeEnabledChannels(channels: ConversationChannel[]) {
  return channels.map((channel) => channelToPersistedValue[channel]).join(",");
}

function parseEscalationRules(value: unknown): VenueAgentEscalationRules {
  if (!isRecord(value)) return defaultVenueAgentEscalationRules;

  return {
    escalateOnLowConfidence:
      typeof value.escalateOnLowConfidence === "boolean"
        ? value.escalateOnLowConfidence
        : defaultVenueAgentEscalationRules.escalateOnLowConfidence,
    lowConfidenceThreshold:
      typeof value.lowConfidenceThreshold === "number"
        ? value.lowConfidenceThreshold
        : defaultVenueAgentEscalationRules.lowConfidenceThreshold,
    escalateForVipRequests:
      typeof value.escalateForVipRequests === "boolean"
        ? value.escalateForVipRequests
        : defaultVenueAgentEscalationRules.escalateForVipRequests,
    escalateForUnavailableInventory:
      typeof value.escalateForUnavailableInventory === "boolean"
        ? value.escalateForUnavailableInventory
        : defaultVenueAgentEscalationRules.escalateForUnavailableInventory,
    escalateForOversizedParty:
      typeof value.escalateForOversizedParty === "boolean"
        ? value.escalateForOversizedParty
        : defaultVenueAgentEscalationRules.escalateForOversizedParty,
    partySizeThreshold:
      typeof value.partySizeThreshold === "number" ? value.partySizeThreshold : defaultVenueAgentEscalationRules.partySizeThreshold,
  };
}

function parseFollowUpRules(value: unknown): VenueAgentFollowUpRules {
  if (!isRecord(value)) return defaultVenueAgentFollowUpRules;

  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : defaultVenueAgentFollowUpRules.enabled,
    unpaidDepositReminderHours:
      typeof value.unpaidDepositReminderHours === "number" ? value.unpaidDepositReminderHours : null,
    abandonedChatReminderHours:
      typeof value.abandonedChatReminderHours === "number" ? value.abandonedChatReminderHours : null,
  };
}

export function createDefaultToolPermissions(
  enabledChannels: ConversationChannel[] = ["website_chat"],
  permissions: VenueAgentActionPermissions = defaultVenueAgentActionPermissions,
  autonomyLevel: VenueAgentAutonomyLevel = 5,
): AgentToolPermission[] {
  const canUseToolAtAutonomy = (toolName: AgentToolName) => {
    if (toolName === "searchVenueKnowledge") return autonomyLevel >= 1;
    if (toolName === "getTableOptions" || toolName === "recommendPackage") return autonomyLevel >= 2;
    if (toolName === "createQuote" || toolName === "createDepositCheckout" || toolName === "sendDepositLink") {
      return autonomyLevel >= 3;
    }
    if (toolName === "createReservation") return autonomyLevel >= 4;
    return true;
  };

  return defaultToolNames.map((toolName) => ({
    toolName,
    enabled: canUseToolAtAutonomy(toolName) && (
      toolName === "searchVenueKnowledge" ? permissions.canAnswerFaqs
      : toolName === "getTableOptions" || toolName === "recommendPackage" ? permissions.canRecommendPackages
      : toolName === "createQuote" ? permissions.canCreateQuotes
      : toolName === "createReservation" ? permissions.canCreateReservations
      : toolName === "createDepositCheckout" || toolName === "sendDepositLink" ? permissions.canSendDepositLinks
      : true
    ),
    requiresHumanApproval: false,
    allowedChannels: enabledChannels,
  }));
}

export function getDefaultVenueAgentConfig(input: {
  venueId: string;
  venueName: string;
  brandVoice?: string | null;
  enabled?: boolean | null;
  enabledChannels?: ConversationChannel[];
}): VenueAgentConfig {
  const enabledChannels = input.enabledChannels ?? ["website_chat"];
  const escalationRules = defaultVenueAgentEscalationRules;

  return {
    venueId: input.venueId,
    enabled: input.enabled ?? true,
    agentName: `${input.venueName} Concierge`,
    brandVoice: input.brandVoice ?? "polished, concise, and helpful",
    autonomyLevel: 5,
    confidenceThreshold: escalationRules.lowConfidenceThreshold,
    enabledChannels,
    actionPermissions: defaultVenueAgentActionPermissions,
    toolPermissions: createDefaultToolPermissions(enabledChannels, defaultVenueAgentActionPermissions, 5),
    escalationRules,
    followUpRules: defaultVenueAgentFollowUpRules,
    advancedInstructions: null,
    source: "defaults",
  };
}

export function buildVenueAgentConfigFromVenueCompatibility(input: VenueCompatibilityInput): VenueAgentConfig {
  return {
    ...getDefaultVenueAgentConfig({
      venueId: input.venueId,
      venueName: input.venueName,
      brandVoice: input.brandTone,
      enabled: input.aiEnabled ?? true,
      enabledChannels: input.websiteChatEnabled === false ? [] : ["website_chat"],
    }),
    source: "venue_compatibility",
  };
}

function mapPersistedVenueAgentConfig(record: PersistedVenueAgentConfig): VenueAgentConfig {
  const enabledChannels = parseEnabledChannels(record.enabledChannels);
  const autonomyLevel = clampAutonomyLevel(record.autonomyLevel);
  const actionPermissions: VenueAgentActionPermissions = {
    canAnswerFaqs: record.canAnswerFaqs,
    canQualifyLeads: record.canQualifyLeads,
    canRecommendPackages: record.canRecommendPackages,
    canCreateQuotes: record.canCreateQuotes,
    canSendDepositLinks: record.canSendDepositLinks,
    canCreateReservations: record.canCreateReservations,
  };
  const escalationRules = parseEscalationRules(record.escalationRules);

  return {
    id: record.id,
    venueId: record.venueId,
    enabled: record.enabled,
    agentName: record.agentName,
    brandVoice: record.brandVoice,
    autonomyLevel,
    confidenceThreshold: record.confidenceThreshold,
    enabledChannels,
    actionPermissions,
    toolPermissions: createDefaultToolPermissions(enabledChannels, actionPermissions, autonomyLevel),
    escalationRules: {
      ...escalationRules,
      lowConfidenceThreshold: record.confidenceThreshold,
    },
    followUpRules: parseFollowUpRules(record.followUpRules),
    advancedInstructions: record.advancedInstructions,
    source: "persisted",
  };
}

export async function getVenueAgentConfigForVenue(input: VenueCompatibilityInput): Promise<VenueAgentConfig> {
  const record = await prisma.venueAgentConfig.findUnique({
    where: { venueId: input.venueId },
  });

  if (record) {
    return mapPersistedVenueAgentConfig(record);
  }

  return buildVenueAgentConfigFromVenueCompatibility(input);
}

export async function ensureVenueAgentConfigForVenue(input: VenueCompatibilityInput) {
  const defaults = buildVenueAgentConfigFromVenueCompatibility(input);

  const record = await prisma.venueAgentConfig.upsert({
    where: { venueId: input.venueId },
    update: {},
    create: {
      venueId: input.venueId,
      enabled: defaults.enabled,
      agentName: defaults.agentName,
      brandVoice: defaults.brandVoice,
      autonomyLevel: defaults.autonomyLevel,
      canAnswerFaqs: defaults.actionPermissions.canAnswerFaqs,
      canQualifyLeads: defaults.actionPermissions.canQualifyLeads,
      canRecommendPackages: defaults.actionPermissions.canRecommendPackages,
      canCreateQuotes: defaults.actionPermissions.canCreateQuotes,
      canSendDepositLinks: defaults.actionPermissions.canSendDepositLinks,
      canCreateReservations: defaults.actionPermissions.canCreateReservations,
      confidenceThreshold: defaults.confidenceThreshold,
      escalationRules: defaults.escalationRules,
      followUpRules: defaults.followUpRules,
      advancedInstructions: defaults.advancedInstructions,
      enabledChannels: serializeEnabledChannels(defaults.enabledChannels),
    },
  });

  return mapPersistedVenueAgentConfig(record);
}

export function canVenueAgentUseWebsiteChat(config: VenueAgentConfig) {
  return config.enabled && config.enabledChannels.includes("website_chat");
}

export function canVenueAgentCreateQuote(config: VenueAgentConfig) {
  return config.enabled && config.actionPermissions.canCreateQuotes && config.autonomyLevel >= 3;
}

export function canVenueAgentCreateReservation(config: VenueAgentConfig) {
  return config.enabled && config.actionPermissions.canCreateReservations && config.autonomyLevel >= 4;
}

export function canVenueAgentSendDepositLink(config: VenueAgentConfig) {
  return config.enabled && config.actionPermissions.canSendDepositLinks && config.autonomyLevel >= 3;
}

export function canVenueAgentCreateReservationDeposit(config: VenueAgentConfig) {
  return canVenueAgentCreateReservation(config) && canVenueAgentSendDepositLink(config);
}
