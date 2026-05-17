import type {
  ConversationChannel,
  ConversationEvent,
  ConversationMessage,
  ConversationParticipantRole,
  ConversationSnapshot,
} from "@/lib/conversation/conversation-types";
import { normalizeConversationState } from "@/lib/conversation/conversation-state";

export function normalizeMessageContent(content: string) {
  return content.replace(/\s+/g, " ").trim();
}

export function getMessageDirection(authorRole: ConversationParticipantRole) {
  if (authorRole === "guest") return "inbound";
  if (authorRole === "tool" || authorRole === "system") return "internal";
  return "outbound";
}

export function createConversationMessage(input: {
  id?: string;
  conversationId?: string;
  channel: ConversationChannel;
  authorRole: ConversationParticipantRole;
  content: string;
  createdAt?: Date | string;
  sourceMessageId?: string | null;
}): ConversationMessage {
  return {
    ...input,
    direction: getMessageDirection(input.authorRole),
    content: normalizeMessageContent(input.content),
  };
}

export function createMessageReceivedEvent(input: {
  venueId: string;
  conversationId?: string;
  channel: ConversationChannel;
  message: ConversationMessage;
  customerId?: string | null;
  occurredAt?: Date;
  metadata?: Record<string, unknown>;
}): ConversationEvent {
  return {
    kind: "message_received",
    venueId: input.venueId,
    conversationId: input.conversationId,
    channel: input.channel,
    message: input.message,
    customerId: input.customerId,
    occurredAt: input.occurredAt ?? new Date(),
    metadata: input.metadata,
  };
}

export function createWebsiteChatConversationMessage(input: {
  id?: string;
  inquiryId?: string;
  authorRole: string;
  content: string;
  createdAt?: Date | string;
}): ConversationMessage {
  return createConversationMessage({
    id: input.id,
    conversationId: input.inquiryId,
    channel: "website_chat",
    authorRole: normalizeWebsiteChatAuthorRole(input.authorRole),
    content: input.content,
    createdAt: input.createdAt,
    sourceMessageId: input.id,
  });
}

export function createWebsiteChatMessageReceivedEvent(input: {
  venueId: string;
  inquiryId: string;
  sessionId?: string | null;
  origin?: string | null;
  message: {
    id?: string;
    authorRole: string;
    content: string;
    createdAt?: Date | string;
  };
  occurredAt?: Date;
}): ConversationEvent {
  const message = createWebsiteChatConversationMessage({
    ...input.message,
    inquiryId: input.inquiryId,
  });

  return createMessageReceivedEvent({
    venueId: input.venueId,
    conversationId: input.inquiryId,
    channel: "website_chat",
    message,
    occurredAt: input.occurredAt,
    metadata: {
      websiteChatSessionId: input.sessionId ?? null,
      origin: input.origin ?? null,
      guestMessageId: input.message.id ?? null,
    },
  });
}

export function createWebsiteChatConversationSnapshot(input: {
  inquiry: {
    id: string;
    venueId: string;
    status: string;
    requestedDateLabel: string;
    partySize: number;
    spendIntentLabel: string;
    occasion: string | null;
    phone: string | null;
    aiConfidence: number;
    nextAction: string;
    isHumanTakeover: boolean;
    messages: Array<{
      id?: string;
      authorRole: string;
      content: string;
      createdAt?: Date | string;
    }>;
  };
}): ConversationSnapshot {
  return {
    id: input.inquiry.id,
    venueId: input.inquiry.venueId,
    channel: "website_chat",
    state: normalizeConversationState(input.inquiry.status),
    qualification: {
      requestedDateLabel:
        input.inquiry.requestedDateLabel === "Not provided yet" ? null : input.inquiry.requestedDateLabel,
      partySize: input.inquiry.partySize > 1 ? input.inquiry.partySize : null,
      spendIntentLabel:
        input.inquiry.spendIntentLabel === "Not provided yet" ? null : input.inquiry.spendIntentLabel,
      occasion: input.inquiry.occasion,
      phone: input.inquiry.phone,
    },
    messages: input.inquiry.messages.map((message) =>
      createWebsiteChatConversationMessage({
        ...message,
        inquiryId: input.inquiry.id,
      }),
    ),
    isHumanTakeover: input.inquiry.isHumanTakeover,
    aiConfidence: input.inquiry.aiConfidence,
    nextAction: input.inquiry.nextAction,
  };
}

function normalizeWebsiteChatAuthorRole(authorRole: string): ConversationParticipantRole {
  if (authorRole === "guest" || authorRole === "ai" || authorRole === "operator") {
    return authorRole;
  }

  return "system";
}
