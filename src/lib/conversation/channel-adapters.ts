import type {
  ConversationChannel,
  ConversationEvent,
  ConversationMessage,
  ConversationSnapshot,
} from "@/lib/conversation/conversation-types";

export type ChannelAdapterCapability =
  | "receive_message"
  | "send_message"
  | "sync_conversation"
  | "operator_takeover";

export type ChannelAdapterResult = {
  status: "sent" | "queued" | "skipped" | "failed";
  externalMessageId?: string | null;
  diagnostic?: string | null;
};

export type ConversationChannelAdapter = {
  channel: ConversationChannel;
  displayName: string;
  implemented: boolean;
  capabilities: ChannelAdapterCapability[];
  normalizeInboundEvent?: (input: unknown) => Promise<ConversationEvent>;
  loadConversationSnapshot?: (event: ConversationEvent) => Promise<ConversationSnapshot | null>;
  persistOutboundMessage?: (input: {
    conversation: ConversationSnapshot;
    message: ConversationMessage;
  }) => Promise<ChannelAdapterResult>;
};

export const futureChannelAdapters: Record<Exclude<ConversationChannel, "website_chat">, ConversationChannelAdapter> = {
  sms: {
    channel: "sms",
    displayName: "SMS",
    implemented: false,
    capabilities: [],
  },
  instagram_dm: {
    channel: "instagram_dm",
    displayName: "Instagram DM",
    implemented: false,
    capabilities: [],
  },
  whatsapp: {
    channel: "whatsapp",
    displayName: "WhatsApp",
    implemented: false,
    capabilities: [],
  },
  email: {
    channel: "email",
    displayName: "Email",
    implemented: false,
    capabilities: [],
  },
  voice: {
    channel: "voice",
    displayName: "Voice",
    implemented: false,
    capabilities: [],
  },
  operator_dashboard: {
    channel: "operator_dashboard",
    displayName: "Operator dashboard",
    implemented: false,
    capabilities: [],
  },
};

export function getFutureChannelAdapter(channel: ConversationChannel) {
  if (channel === "website_chat") return null;
  return futureChannelAdapters[channel];
}

export function isChannelAdapterImplemented(channel: ConversationChannel) {
  if (channel === "website_chat") return true;
  return Boolean(futureChannelAdapters[channel]?.implemented);
}
