import type {
  ConversationLifecycleState,
  ConversationQualification,
  ConversationSnapshot,
} from "@/lib/conversation/conversation-types";

export type PersistedInquiryStatus =
  | "NEW"
  | "QUALIFYING"
  | "QUOTED"
  | "DEPOSIT_SENT"
  | "CONFIRMED"
  | "NEEDS_HUMAN"
  | "LOST";

export type ConversationTransitionReason =
  | "guest_message_received"
  | "qualification_progressed"
  | "quote_prepared"
  | "deposit_requested"
  | "booking_confirmed"
  | "human_handoff_requested"
  | "human_takeover_started"
  | "human_takeover_released"
  | "follow_up_scheduled"
  | "lead_disqualified"
  | "conversation_closed"
  | "state_reconciled";

export const defaultConversationState: ConversationLifecycleState = "NEW";

export const inquiryStatusToConversationState: Record<string, ConversationLifecycleState> = {
  NEW: "NEW",
  QUALIFYING: "QUALIFYING",
  QUOTED: "QUOTED",
  DEPOSIT_SENT: "DEPOSIT_PENDING",
  CONFIRMED: "BOOKED",
  BOOKED: "BOOKED",
  NEEDS_HUMAN: "NEEDS_HUMAN",
  HUMAN_ACTIVE: "HUMAN_ACTIVE",
  FOLLOW_UP_SCHEDULED: "FOLLOW_UP_SCHEDULED",
  LOST: "LOST",
  CLOSED: "CLOSED",
};

export const conversationTransitionRules = [
  { from: "NEW", to: "QUALIFYING", reasons: ["guest_message_received", "qualification_progressed", "state_reconciled"] },
  { from: "NEW", to: "QUOTED", reasons: ["quote_prepared", "state_reconciled"] },
  { from: "NEW", to: "DEPOSIT_PENDING", reasons: ["deposit_requested", "state_reconciled"] },
  { from: "NEW", to: "NEEDS_HUMAN", reasons: ["human_handoff_requested", "state_reconciled"] },
  { from: "NEW", to: "LOST", reasons: ["lead_disqualified", "state_reconciled"] },
  { from: "QUALIFYING", to: "QUOTED", reasons: ["quote_prepared", "state_reconciled"] },
  { from: "QUALIFYING", to: "DEPOSIT_PENDING", reasons: ["deposit_requested", "state_reconciled"] },
  { from: "QUALIFYING", to: "NEEDS_HUMAN", reasons: ["human_handoff_requested", "state_reconciled"] },
  { from: "QUALIFYING", to: "FOLLOW_UP_SCHEDULED", reasons: ["follow_up_scheduled", "state_reconciled"] },
  { from: "QUALIFYING", to: "LOST", reasons: ["lead_disqualified", "state_reconciled"] },
  { from: "QUOTED", to: "DEPOSIT_PENDING", reasons: ["deposit_requested", "state_reconciled"] },
  { from: "QUOTED", to: "NEEDS_HUMAN", reasons: ["human_handoff_requested", "state_reconciled"] },
  { from: "QUOTED", to: "FOLLOW_UP_SCHEDULED", reasons: ["follow_up_scheduled", "state_reconciled"] },
  { from: "QUOTED", to: "LOST", reasons: ["lead_disqualified", "state_reconciled"] },
  { from: "DEPOSIT_PENDING", to: "BOOKED", reasons: ["booking_confirmed", "state_reconciled"] },
  { from: "DEPOSIT_PENDING", to: "NEEDS_HUMAN", reasons: ["human_handoff_requested", "state_reconciled"] },
  { from: "DEPOSIT_PENDING", to: "FOLLOW_UP_SCHEDULED", reasons: ["follow_up_scheduled", "state_reconciled"] },
  { from: "DEPOSIT_PENDING", to: "LOST", reasons: ["lead_disqualified", "state_reconciled"] },
  { from: "BOOKED", to: "CLOSED", reasons: ["conversation_closed", "state_reconciled"] },
  { from: "NEEDS_HUMAN", to: "HUMAN_ACTIVE", reasons: ["human_takeover_started", "state_reconciled"] },
  { from: "NEEDS_HUMAN", to: "QUALIFYING", reasons: ["human_takeover_released", "state_reconciled"] },
  { from: "NEEDS_HUMAN", to: "LOST", reasons: ["lead_disqualified", "state_reconciled"] },
  { from: "HUMAN_ACTIVE", to: "QUALIFYING", reasons: ["human_takeover_released", "state_reconciled"] },
  { from: "HUMAN_ACTIVE", to: "QUOTED", reasons: ["quote_prepared", "state_reconciled"] },
  { from: "HUMAN_ACTIVE", to: "DEPOSIT_PENDING", reasons: ["deposit_requested", "state_reconciled"] },
  { from: "HUMAN_ACTIVE", to: "BOOKED", reasons: ["booking_confirmed", "state_reconciled"] },
  { from: "HUMAN_ACTIVE", to: "FOLLOW_UP_SCHEDULED", reasons: ["follow_up_scheduled", "state_reconciled"] },
  { from: "HUMAN_ACTIVE", to: "LOST", reasons: ["lead_disqualified", "state_reconciled"] },
  { from: "FOLLOW_UP_SCHEDULED", to: "QUALIFYING", reasons: ["guest_message_received", "qualification_progressed", "state_reconciled"] },
  { from: "FOLLOW_UP_SCHEDULED", to: "QUOTED", reasons: ["quote_prepared", "state_reconciled"] },
  { from: "FOLLOW_UP_SCHEDULED", to: "DEPOSIT_PENDING", reasons: ["deposit_requested", "state_reconciled"] },
  { from: "FOLLOW_UP_SCHEDULED", to: "NEEDS_HUMAN", reasons: ["human_handoff_requested", "state_reconciled"] },
  { from: "FOLLOW_UP_SCHEDULED", to: "LOST", reasons: ["lead_disqualified", "state_reconciled"] },
  { from: "LOST", to: "QUALIFYING", reasons: ["guest_message_received", "qualification_progressed", "state_reconciled"] },
  { from: "LOST", to: "NEEDS_HUMAN", reasons: ["human_handoff_requested", "state_reconciled"] },
  { from: "LOST", to: "CLOSED", reasons: ["conversation_closed", "state_reconciled"] },
  { from: "CLOSED", to: "QUALIFYING", reasons: ["guest_message_received", "qualification_progressed", "state_reconciled"] },
] as const satisfies ReadonlyArray<{
  from: ConversationLifecycleState;
  to: ConversationLifecycleState;
  reasons: readonly ConversationTransitionReason[];
}>;

export function normalizeConversationState(
  status: string | null | undefined,
): ConversationLifecycleState {
  if (!status) return defaultConversationState;
  return inquiryStatusToConversationState[status] ?? defaultConversationState;
}

export function hasMinimumBookingQualification(qualification: ConversationQualification) {
  return Boolean(qualification.requestedDateLabel && qualification.partySize);
}

export function shouldAwaitHuman(
  snapshot: Pick<ConversationSnapshot, "state" | "isHumanTakeover">,
) {
  return (
    snapshot.isHumanTakeover ||
    snapshot.state === "NEEDS_HUMAN" ||
    snapshot.state === "HUMAN_ACTIVE"
  );
}

export function createEmptyConversationSnapshot(input: {
  id: string;
  venueId: string;
  channel: ConversationSnapshot["channel"];
}): ConversationSnapshot {
  return {
    id: input.id,
    venueId: input.venueId,
    channel: input.channel,
    state: defaultConversationState,
    qualification: {},
    messages: [],
    isHumanTakeover: false,
  };
}

export function canTransitionConversationState(
  from: ConversationLifecycleState,
  to: ConversationLifecycleState,
  reason?: ConversationTransitionReason,
) {
  if (from === to) return true;

  const rule = conversationTransitionRules.find((item) => item.from === from && item.to === to);
  if (!rule) return false;
  if (!reason) return true;
  return (rule.reasons as readonly ConversationTransitionReason[]).includes(reason);
}

export function assertConversationTransition(input: {
  from: ConversationLifecycleState;
  to: ConversationLifecycleState;
  reason: ConversationTransitionReason;
}) {
  if (!canTransitionConversationState(input.from, input.to, input.reason)) {
    throw new Error(
      `Invalid conversation transition from ${input.from} to ${input.to} for ${input.reason}.`,
    );
  }
}

export function transitionConversationState(input: {
  from: ConversationLifecycleState;
  to: ConversationLifecycleState;
  reason: ConversationTransitionReason;
}) {
  assertConversationTransition(input);
  return {
    from: input.from,
    to: input.to,
    reason: input.reason,
  };
}

export function mapConversationStateToPersistedInquiryStatus(input: {
  state: ConversationLifecycleState;
  currentStatus?: PersistedInquiryStatus;
}): PersistedInquiryStatus {
  switch (input.state) {
    case "NEW":
      return "NEW";
    case "QUALIFYING":
      return "QUALIFYING";
    case "QUOTED":
      return "QUOTED";
    case "DEPOSIT_PENDING":
      return "DEPOSIT_SENT";
    case "BOOKED":
      return "CONFIRMED";
    case "NEEDS_HUMAN":
    case "HUMAN_ACTIVE":
      return "NEEDS_HUMAN";
    case "FOLLOW_UP_SCHEDULED":
      return input.currentStatus ?? "QUALIFYING";
    case "LOST":
      return "LOST";
    case "CLOSED":
      return input.currentStatus === "CONFIRMED" || input.currentStatus === "LOST"
        ? input.currentStatus
        : "LOST";
    default:
      return input.currentStatus ?? "NEW";
  }
}

export function mapPersistedInquiryStatusToTransitionReason(
  status: PersistedInquiryStatus,
): ConversationTransitionReason {
  switch (status) {
    case "QUALIFYING":
      return "qualification_progressed";
    case "QUOTED":
      return "quote_prepared";
    case "DEPOSIT_SENT":
      return "deposit_requested";
    case "CONFIRMED":
      return "booking_confirmed";
    case "NEEDS_HUMAN":
      return "human_handoff_requested";
    case "LOST":
      return "lead_disqualified";
    case "NEW":
    default:
      return "guest_message_received";
  }
}

export function reconcileConversationStateFromPersistedStatus(input: {
  currentState: ConversationLifecycleState;
  persistedStatus: PersistedInquiryStatus;
}) {
  const nextState = normalizeConversationState(input.persistedStatus);
  if (nextState === input.currentState) {
    return {
      changed: false,
      state: input.currentState,
      reason: mapPersistedInquiryStatusToTransitionReason(input.persistedStatus),
    };
  }

  return {
    changed: true,
    ...transitionConversationState({
      from: input.currentState,
      to: nextState,
      reason: "state_reconciled",
    }),
    state: nextState,
  };
}

export function deriveConversationStateAfterAgentTurn(input: {
  currentState: ConversationLifecycleState;
  currentInquiryStatus: PersistedInquiryStatus;
  isHumanTakeover: boolean;
  hasDraftQuote: boolean;
  hasReservationDeposit: boolean;
  hasConfirmedBooking?: boolean;
  hasMinimumQualification: boolean;
}) {
  const targetState = input.isHumanTakeover
    ? "NEEDS_HUMAN"
    : input.hasConfirmedBooking
      ? "BOOKED"
      : input.hasReservationDeposit
        ? "DEPOSIT_PENDING"
        : input.hasDraftQuote
          ? "QUOTED"
          : input.hasMinimumQualification
            ? "QUALIFYING"
            : input.currentState;

  const reason =
    targetState === input.currentState
      ? "guest_message_received"
      : targetState === "NEEDS_HUMAN"
        ? "human_handoff_requested"
        : targetState === "BOOKED"
          ? "booking_confirmed"
          : targetState === "DEPOSIT_PENDING"
            ? "deposit_requested"
            : targetState === "QUOTED"
              ? "quote_prepared"
              : "qualification_progressed";

  if (targetState !== input.currentState) {
    assertConversationTransition({
      from: input.currentState,
      to: targetState,
      reason,
    });
  }

  return {
    state: targetState,
    reason,
    persistedInquiryStatus: mapConversationStateToPersistedInquiryStatus({
      state: targetState,
      currentStatus: input.currentInquiryStatus,
    }),
  };
}
