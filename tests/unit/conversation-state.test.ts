import { describe, expect, it } from "vitest";
import {
  assertConversationTransition,
  canTransitionConversationState,
  deriveConversationStateAfterAgentTurn,
  mapConversationStateToPersistedInquiryStatus,
  normalizeConversationState,
  reconcileConversationStateFromPersistedStatus,
  shouldAwaitHuman,
} from "@/lib/conversation/conversation-state";

describe("conversation state machine", () => {
  it("maps existing inquiry statuses into the new shared conversation states", () => {
    expect(normalizeConversationState("NEW")).toBe("NEW");
    expect(normalizeConversationState("QUALIFYING")).toBe("QUALIFYING");
    expect(normalizeConversationState("QUOTED")).toBe("QUOTED");
    expect(normalizeConversationState("DEPOSIT_SENT")).toBe("DEPOSIT_PENDING");
    expect(normalizeConversationState("CONFIRMED")).toBe("BOOKED");
    expect(normalizeConversationState("NEEDS_HUMAN")).toBe("NEEDS_HUMAN");
    expect(normalizeConversationState("LOST")).toBe("LOST");
  });

  it("allows only configured transitions for a given reason", () => {
    expect(
      canTransitionConversationState("NEW", "QUALIFYING", "qualification_progressed"),
    ).toBe(true);
    expect(
      canTransitionConversationState("QUOTED", "DEPOSIT_PENDING", "deposit_requested"),
    ).toBe(true);
    expect(
      canTransitionConversationState("NEW", "BOOKED", "booking_confirmed"),
    ).toBe(false);
    expect(() =>
      assertConversationTransition({
        from: "NEW",
        to: "BOOKED",
        reason: "booking_confirmed",
      }),
    ).toThrow("Invalid conversation transition");
  });

  it("derives a quoted state and persisted quoted inquiry status after a draft quote", () => {
    const result = deriveConversationStateAfterAgentTurn({
      currentState: "QUALIFYING",
      currentInquiryStatus: "QUALIFYING",
      isHumanTakeover: false,
      hasDraftQuote: true,
      hasReservationDeposit: false,
      hasMinimumQualification: true,
    });

    expect(result.state).toBe("QUOTED");
    expect(result.reason).toBe("quote_prepared");
    expect(result.persistedInquiryStatus).toBe("QUOTED");
  });

  it("allows a same-turn quote from a new website chat conversation", () => {
    const result = deriveConversationStateAfterAgentTurn({
      currentState: "NEW",
      currentInquiryStatus: "NEW",
      isHumanTakeover: false,
      hasDraftQuote: true,
      hasReservationDeposit: false,
      hasMinimumQualification: true,
    });

    expect(result.state).toBe("QUOTED");
    expect(result.reason).toBe("quote_prepared");
    expect(result.persistedInquiryStatus).toBe("QUOTED");
  });

  it("derives a deposit-pending state while preserving DEPOSIT_SENT in the database", () => {
    const result = deriveConversationStateAfterAgentTurn({
      currentState: "QUOTED",
      currentInquiryStatus: "QUOTED",
      isHumanTakeover: false,
      hasDraftQuote: true,
      hasReservationDeposit: true,
      hasMinimumQualification: true,
    });

    expect(result.state).toBe("DEPOSIT_PENDING");
    expect(result.reason).toBe("deposit_requested");
    expect(result.persistedInquiryStatus).toBe("DEPOSIT_SENT");
  });

  it("derives a booked state while preserving CONFIRMED in the database", () => {
    const result = deriveConversationStateAfterAgentTurn({
      currentState: "DEPOSIT_PENDING",
      currentInquiryStatus: "DEPOSIT_SENT",
      isHumanTakeover: false,
      hasDraftQuote: true,
      hasReservationDeposit: true,
      hasConfirmedBooking: true,
      hasMinimumQualification: true,
    });

    expect(result.state).toBe("BOOKED");
    expect(result.reason).toBe("booking_confirmed");
    expect(result.persistedInquiryStatus).toBe("CONFIRMED");
  });

  it("reconciles an existing persisted human-handoff status into the shared state model", () => {
    const result = reconcileConversationStateFromPersistedStatus({
      currentState: "QUALIFYING",
      persistedStatus: "NEEDS_HUMAN",
    });

    expect(result.changed).toBe(true);
    expect(result.state).toBe("NEEDS_HUMAN");
    expect(result.reason).toBe("state_reconciled");
  });

  it("treats human-active conversations as awaiting a human", () => {
    expect(shouldAwaitHuman({ state: "HUMAN_ACTIVE", isHumanTakeover: false })).toBe(true);
    expect(shouldAwaitHuman({ state: "BOOKED", isHumanTakeover: false })).toBe(false);
  });

  it("keeps follow-up-scheduled compatibility pinned to the current inquiry status", () => {
    expect(
      mapConversationStateToPersistedInquiryStatus({
        state: "FOLLOW_UP_SCHEDULED",
        currentStatus: "QUOTED",
      }),
    ).toBe("QUOTED");
  });
});
