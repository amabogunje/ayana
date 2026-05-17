import type {
  ConversationEvent,
  ConversationIntent,
  ConversationQualification,
  ConversationSnapshot,
} from "@/lib/conversation/conversation-types";
import type { AgentToolCallRecord, AgentToolName } from "@/lib/agent-tools/tool-types";
import type { VenueAgentConfig } from "@/lib/venue-agent/venue-agent-types";

export type AgentRunStatus = "planned" | "running" | "completed" | "failed" | "blocked";

export type AgentRecommendation = {
  tableOptionName: string | null;
  quoteLabel: string | null;
  quotePitch: string | null;
  readyForQuote: boolean;
};

export type AgentStructuredReply = {
  intent: ConversationIntent | string;
  objective: string;
  conversationMode?: ConversationIntent | string;
  answeredLatestQuestion?: boolean;
  shouldCloseNow?: boolean;
  shouldHandoff?: boolean;
  reply: string;
  aiConfidence: number;
  nextAction: string;
  isHumanTakeover: boolean;
  handoffReason: string | null;
  recommendation: AgentRecommendation;
  extracted: ConversationQualification;
};

export type AgentRunInput = {
  runId?: string;
  venueId: string;
  conversation: ConversationSnapshot;
  event: ConversationEvent;
  config?: VenueAgentConfig;
};

export type AgentRunResult = {
  status: AgentRunStatus;
  reply?: AgentStructuredReply;
  plannedToolCalls: AgentToolName[];
  toolCalls: AgentToolCallRecord[];
  diagnostics?: string[];
};

export type AgentRunner = {
  run(input: AgentRunInput): Promise<AgentRunResult>;
};
