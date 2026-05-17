export type ConversationChannel =
  | "website_chat"
  | "sms"
  | "instagram_dm"
  | "whatsapp"
  | "email"
  | "voice"
  | "operator_dashboard";

export type ConversationParticipantRole = "guest" | "ai" | "operator" | "system" | "tool";

export type ConversationMessageDirection = "inbound" | "outbound" | "internal";

export type ConversationLifecycleState =
  | "NEW"
  | "QUALIFYING"
  | "QUOTED"
  | "DEPOSIT_PENDING"
  | "BOOKED"
  | "NEEDS_HUMAN"
  | "HUMAN_ACTIVE"
  | "FOLLOW_UP_SCHEDULED"
  | "LOST"
  | "CLOSED";

export type ConversationIntent =
  | "greeting"
  | "qualification"
  | "venue_info"
  | "table_recommendation"
  | "objection"
  | "close"
  | "handoff"
  | "unknown";

export type ConversationMessage = {
  id?: string;
  conversationId?: string;
  channel: ConversationChannel;
  authorRole: ConversationParticipantRole;
  direction: ConversationMessageDirection;
  content: string;
  createdAt?: Date | string;
  sourceMessageId?: string | null;
};

export type ConversationEventKind =
  | "message_received"
  | "message_sent"
  | "operator_takeover_requested"
  | "operator_released"
  | "state_changed"
  | "tool_result_recorded";

export type ConversationEvent = {
  kind: ConversationEventKind;
  channel: ConversationChannel;
  conversationId?: string;
  venueId: string;
  customerId?: string | null;
  message?: ConversationMessage;
  occurredAt: Date;
  metadata?: Record<string, unknown>;
};

export type ConversationQualification = {
  requestedDateLabel?: string | null;
  partySize?: number | null;
  spendIntentLabel?: string | null;
  occasion?: string | null;
  phone?: string | null;
  email?: string | null;
};

export type ConversationSnapshot = {
  id: string;
  venueId: string;
  channel: ConversationChannel;
  state: ConversationLifecycleState;
  intent?: ConversationIntent;
  qualification: ConversationQualification;
  messages: ConversationMessage[];
  isHumanTakeover: boolean;
  aiConfidence?: number | null;
  nextAction?: string | null;
};
