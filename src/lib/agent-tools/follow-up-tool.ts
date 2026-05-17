import {
  scheduleAbandonedChatFollowUp,
  scheduleUnpaidDepositReminderForReservation,
} from "@/lib/workflow-tasks";

export async function scheduleUnpaidDepositReminderForAgent(input: {
  venueId: string;
  inquiryId: string;
  reservationId: string;
  guestName: string;
  tableName: string;
  depositAmountCents: number;
  scheduledFor: Date;
}) {
  return scheduleUnpaidDepositReminderForReservation(input);
}

export async function scheduleAbandonedChatFollowUpForAgent(input: {
  venueId: string;
  inquiryId: string;
  guestName: string;
  scheduledFor: Date;
  reason?: string;
}) {
  return scheduleAbandonedChatFollowUp(input);
}
