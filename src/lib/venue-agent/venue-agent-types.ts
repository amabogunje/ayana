import type { ConversationChannel } from "@/lib/conversation/conversation-types";
import type { AgentToolPermission } from "@/lib/agent-tools/tool-types";

export type VenueAgentAutonomyLevel = 0 | 1 | 2 | 3 | 4 | 5;

export type VenueAgentEscalationRules = {
  escalateOnLowConfidence: boolean;
  lowConfidenceThreshold: number;
  escalateForVipRequests: boolean;
  escalateForUnavailableInventory: boolean;
  escalateForOversizedParty: boolean;
  partySizeThreshold?: number | null;
};

export type VenueAgentFollowUpRules = {
  enabled: boolean;
  unpaidDepositReminderHours?: number | null;
  abandonedChatReminderHours?: number | null;
};

export type VenueAgentActionPermissions = {
  canAnswerFaqs: boolean;
  canQualifyLeads: boolean;
  canRecommendPackages: boolean;
  canCreateQuotes: boolean;
  canSendDepositLinks: boolean;
  canCreateReservations: boolean;
};

export type VenueAgentConfig = {
  id?: string;
  venueId: string;
  enabled: boolean;
  agentName: string;
  brandVoice: string;
  autonomyLevel: VenueAgentAutonomyLevel;
  confidenceThreshold: number;
  enabledChannels: ConversationChannel[];
  actionPermissions: VenueAgentActionPermissions;
  toolPermissions: AgentToolPermission[];
  escalationRules: VenueAgentEscalationRules;
  followUpRules: VenueAgentFollowUpRules;
  advancedInstructions?: string | null;
  source?: VenueAgentConfigSource;
};

export type VenueAgentConfigSource = "defaults" | "venue_compatibility" | "persisted";
