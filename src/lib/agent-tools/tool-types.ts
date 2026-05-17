import type { ConversationChannel } from "@/lib/conversation/conversation-types";

export type AgentToolName =
  | "searchVenueKnowledge"
  | "getTableOptions"
  | "recommendPackage"
  | "createQuote"
  | "createReservation"
  | "createDepositCheckout"
  | "sendDepositLink"
  | "scheduleFollowUp"
  | "assignHumanOperator"
  | "summarizeConversation"
  | "updateCustomerProfile"
  | "markLeadStatus";

export type AgentToolPermission = {
  toolName: AgentToolName;
  enabled: boolean;
  requiresHumanApproval?: boolean;
  allowedChannels?: ConversationChannel[];
};

export type AgentToolRequest<TInput extends Record<string, unknown> = Record<string, unknown>> = {
  toolName: AgentToolName;
  venueId: string;
  conversationId?: string;
  input: TInput;
  requestedByRunId?: string | null;
};

export type AgentToolResult<TOutput = unknown> = {
  toolName: AgentToolName;
  ok: boolean;
  output?: TOutput;
  errorMessage?: string;
  auditSummary?: string;
};

export type AgentToolCallRecord = {
  id?: string;
  runId?: string;
  toolName: AgentToolName;
  status: "planned" | "approved" | "blocked" | "succeeded" | "failed";
  input?: Record<string, unknown>;
  output?: unknown;
  errorMessage?: string | null;
  createdAt?: Date;
};
