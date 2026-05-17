import type { Channel } from "@prisma/client";
import type { ConversationChannel } from "@/lib/conversation/conversation-types";

export const conversationChannelToPrismaChannel: Record<ConversationChannel, Channel> = {
  website_chat: "WEBSITE_CHAT",
  sms: "SMS",
  instagram_dm: "INSTAGRAM_DM",
  whatsapp: "WHATSAPP",
  email: "EMAIL",
  voice: "VOICE",
  operator_dashboard: "OPERATOR_DASHBOARD",
};

const prismaChannelToConversationChannel: Record<Channel, ConversationChannel> = {
  WEBSITE_CHAT: "website_chat",
  SMS: "sms",
  INSTAGRAM_DM: "instagram_dm",
  WHATSAPP: "whatsapp",
  EMAIL: "email",
  VOICE: "voice",
  OPERATOR_DASHBOARD: "operator_dashboard",
  PHONE: "voice",
  MANUAL: "operator_dashboard",
};

export function toPrismaChannel(channel: ConversationChannel): Channel {
  return conversationChannelToPrismaChannel[channel];
}

export function fromPrismaChannel(channel: Channel): ConversationChannel {
  return prismaChannelToConversationChannel[channel];
}

export function isConversationChannel(value: string): value is ConversationChannel {
  return Object.prototype.hasOwnProperty.call(conversationChannelToPrismaChannel, value);
}

export function parseConversationChannel(value: string): ConversationChannel | null {
  const normalized = value.trim().toLowerCase();
  return isConversationChannel(normalized) ? normalized : null;
}
