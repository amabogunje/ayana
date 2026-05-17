import type { ConversationSnapshot } from "@/lib/conversation/conversation-types";
import type { VenueAgentConfig } from "@/lib/venue-agent/venue-agent-types";

export type AgentPromptContext = {
  venueName: string;
  conversation: ConversationSnapshot;
  config: VenueAgentConfig;
  venueKnowledge?: string | null;
};

export function buildAgentIdentityPrompt(input: Pick<AgentPromptContext, "venueName" | "config">) {
  return [
    `You are ${input.config.agentName}, the customer operations agent for ${input.venueName}.`,
    `Use this brand voice: ${input.config.brandVoice}.`,
  ].join(" ");
}

export function buildCompatibilityPromptSections(input: AgentPromptContext) {
  return {
    identity: buildAgentIdentityPrompt(input),
    venueKnowledge: input.venueKnowledge ?? "No venue knowledge supplied.",
    conversationState: `State: ${input.conversation.state}. Intent: ${input.conversation.intent ?? "unknown"}.`,
  };
}
