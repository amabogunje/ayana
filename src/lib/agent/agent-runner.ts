import { runWebsiteChatAgentForRuntime } from "@/lib/website-chat-agent";
import {
  completeAgentRunSafely,
  startAgentRunSafely,
} from "@/lib/agent/agent-observability";
import { getFutureChannelAdapter } from "@/lib/conversation/channel-adapters";
import type { AgentRunInput, AgentRunResult, AgentRunner } from "@/lib/agent/agent-types";

export function createNoopAgentRunResult(input: AgentRunInput): AgentRunResult {
  const adapter = getFutureChannelAdapter(input.event.channel);
  return {
    status: "blocked",
    plannedToolCalls: [],
    toolCalls: [],
    diagnostics: [
      adapter
        ? `${adapter.displayName} channel adapter is registered but not implemented yet; no agent action was taken.`
        : `No shared agent runner is wired for ${input.event.channel}; existing channel-specific runtime should handle this event.`,
    ],
  };
}

function getStringMetadataValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

export async function runSharedAgentRuntime(input: AgentRunInput): Promise<AgentRunResult> {
  if (input.event.channel !== "website_chat") {
    return createNoopAgentRunResult(input);
  }

  if (input.event.kind !== "message_received") {
    return {
      status: "blocked",
      plannedToolCalls: [],
      toolCalls: [],
      diagnostics: [`Website chat runtime only handles message_received events; received ${input.event.kind}.`],
    };
  }

  const inquiryId = input.conversation.id || input.event.conversationId;
  if (!inquiryId) {
    return {
      status: "failed",
      plannedToolCalls: [],
      toolCalls: [],
      diagnostics: ["Website chat runtime requires a conversation/inquiry id."],
    };
  }

  const guestMessageId =
    getStringMetadataValue(input.event.metadata?.guestMessageId) ??
    input.event.message?.sourceMessageId ??
    input.event.message?.id;

  const agentRun = await startAgentRunSafely({
    venueId: input.venueId,
    inquiryId,
    channel: "WEBSITE_CHAT",
    source: "shared_agent_runtime",
    model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
  });

  try {
    const websiteChatResult = await runWebsiteChatAgentForRuntime({
      inquiryId,
      guestMessageId,
      agentRunId: agentRun?.id,
    });

    await completeAgentRunSafely({
      agentRunId: agentRun?.id,
      ...websiteChatResult.completion,
    });

    const replyMessage = websiteChatResult.replyMessage;

    return {
      status: replyMessage ? "completed" : "blocked",
      plannedToolCalls: [
        "searchVenueKnowledge",
        "recommendPackage",
        "createQuote",
        "createReservation",
        "createDepositCheckout",
        "scheduleFollowUp",
      ],
      toolCalls: [],
      diagnostics: [
        replyMessage
          ? `Website chat event ${guestMessageId ?? "unknown"} routed through shared runtime with shared AgentRun lifecycle.`
          : `Website chat event ${guestMessageId ?? "unknown"} produced no reply, likely due to duplicate protection.`,
      ],
    };
  } catch (error) {
    await completeAgentRunSafely({
      agentRunId: agentRun?.id,
      status: "FAILED",
      finalAction: "Shared website chat runtime failed.",
      errorMessage: error instanceof Error ? error.message : "Unknown shared agent runtime error.",
    });
    throw error;
  }
}

export const sharedAgentRunner: AgentRunner = {
  run: runSharedAgentRuntime,
};

export const noopAgentRunner: AgentRunner = {
  async run(input) {
    return createNoopAgentRunResult(input);
  },
};
