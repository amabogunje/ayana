import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createInquiry, createTableOption, createVenue, resetDatabase } from "../helpers/db";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("workflow task service", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("creates, completes, and cancels workflow tasks", async () => {
    const {
      cancelWorkflowTask,
      completeWorkflowTask,
      createWorkflowTask,
    } = await import("@/lib/workflow-tasks");
    const venue = await createVenue();
    const inquiry = await createInquiry(venue.id);

    const task = await createWorkflowTask({
      venueId: venue.id,
      inquiryId: inquiry.id,
      type: "ABANDONED_CHAT_FOLLOW_UP",
      scheduledFor: new Date("2026-05-16T20:00:00.000Z"),
      payload: { guestName: inquiry.guestName },
    });
    const duplicate = await createWorkflowTask({
      venueId: venue.id,
      inquiryId: inquiry.id,
      type: "ABANDONED_CHAT_FOLLOW_UP",
      scheduledFor: new Date("2026-05-16T21:00:00.000Z"),
      payload: { guestName: inquiry.guestName },
    });

    expect(duplicate.id).toBe(task.id);

    const completed = await completeWorkflowTask(task.id, "Follow-up handled.");
    expect(completed.status).toBe("COMPLETED");

    const secondTask = await createWorkflowTask({
      venueId: venue.id,
      inquiryId: inquiry.id,
      type: "STALE_QUOTE_EXPIRATION",
      scheduledFor: new Date("2026-05-17T20:00:00.000Z"),
      payload: { guestName: inquiry.guestName },
    });
    const cancelled = await cancelWorkflowTask(secondTask.id, "No longer needed.");
    const activityCount = await prisma.activityLog.count({
      where: { venueId: venue.id, entityType: "workflow_task" },
    });

    expect(cancelled.status).toBe("CANCELLED");
    expect(activityCount).toBeGreaterThanOrEqual(4);
  });

  it("processes due unpaid deposit reminders into operator-visible alerts", async () => {
    const { processDueWorkflowTasks, scheduleUnpaidDepositReminderForReservation } = await import("@/lib/workflow-tasks");
    const venue = await createVenue();
    const tableOption = await createTableOption(venue.id);
    const inquiry = await createInquiry(venue.id, { status: "DEPOSIT_SENT" });
    const reservation = await prisma.reservation.create({
      data: {
        inquiryId: inquiry.id,
        tableOptionId: tableOption.id,
        status: "DEPOSIT_PENDING",
        depositAmountCents: tableOption.depositAmountCents,
        depositPaidCents: 0,
        confirmationCode: "WF-TEST-1",
        arrivalTimeLabel: "Saturday 11 PM",
      },
      include: { tableOption: true },
    });

    await scheduleUnpaidDepositReminderForReservation({
      venueId: venue.id,
      inquiryId: inquiry.id,
      reservationId: reservation.id,
      guestName: inquiry.guestName,
      tableName: reservation.tableOption.name,
      depositAmountCents: reservation.depositAmountCents,
      scheduledFor: new Date("2026-05-16T18:00:00.000Z"),
    });

    const result = await processDueWorkflowTasks({
      now: new Date("2026-05-16T19:00:00.000Z"),
    });
    const alert = await prisma.alert.findFirst({
      where: { venueId: venue.id, inquiryId: inquiry.id, type: "UNPAID_DEPOSIT_REMINDER" },
    });
    const task = await prisma.workflowTask.findFirst({
      where: { venueId: venue.id, inquiryId: inquiry.id, type: "UNPAID_DEPOSIT_REMINDER" },
    });

    expect(result.completed).toBe(1);
    expect(task?.status).toBe("COMPLETED");
    expect(alert?.title).toBe("Deposit reminder due");
  });

  it("does not alert for an unpaid deposit reminder after the reservation is paid", async () => {
    const { processDueWorkflowTasks, scheduleUnpaidDepositReminderForReservation } = await import("@/lib/workflow-tasks");
    const venue = await createVenue();
    const tableOption = await createTableOption(venue.id);
    const inquiry = await createInquiry(venue.id, { status: "CONFIRMED" });
    const reservation = await prisma.reservation.create({
      data: {
        inquiryId: inquiry.id,
        tableOptionId: tableOption.id,
        status: "CONFIRMED",
        depositAmountCents: tableOption.depositAmountCents,
        depositPaidCents: tableOption.depositAmountCents,
        confirmationCode: "WF-TEST-2",
        arrivalTimeLabel: "Saturday 11 PM",
      },
      include: { tableOption: true },
    });

    await scheduleUnpaidDepositReminderForReservation({
      venueId: venue.id,
      inquiryId: inquiry.id,
      reservationId: reservation.id,
      guestName: inquiry.guestName,
      tableName: reservation.tableOption.name,
      depositAmountCents: reservation.depositAmountCents,
      scheduledFor: new Date("2026-05-16T18:00:00.000Z"),
    });

    const result = await processDueWorkflowTasks({
      now: new Date("2026-05-16T19:00:00.000Z"),
    });
    const alertCount = await prisma.alert.count({
      where: { venueId: venue.id, inquiryId: inquiry.id, type: "UNPAID_DEPOSIT_REMINDER" },
    });

    expect(result.completed).toBe(1);
    expect(alertCount).toBe(0);
  });

  it("claims due tasks before processing so concurrent runners do not duplicate alerts", async () => {
    const { processDueWorkflowTasks, scheduleAbandonedChatFollowUp } = await import("@/lib/workflow-tasks");
    const venue = await createVenue();
    const inquiry = await createInquiry(venue.id);

    await scheduleAbandonedChatFollowUp({
      venueId: venue.id,
      inquiryId: inquiry.id,
      guestName: inquiry.guestName,
      scheduledFor: new Date("2026-05-16T18:00:00.000Z"),
    });

    const [first, second] = await Promise.all([
      processDueWorkflowTasks({ now: new Date("2026-05-16T19:00:00.000Z") }),
      processDueWorkflowTasks({ now: new Date("2026-05-16T19:00:00.000Z") }),
    ]);
    const alertCount = await prisma.alert.count({
      where: { venueId: venue.id, inquiryId: inquiry.id, type: "ABANDONED_CHAT_FOLLOW_UP" },
    });
    const task = await prisma.workflowTask.findFirstOrThrow({
      where: { venueId: venue.id, inquiryId: inquiry.id, type: "ABANDONED_CHAT_FOLLOW_UP" },
    });

    expect(first.completed + second.completed).toBe(1);
    expect(first.claimed + second.claimed).toBe(1);
    expect(alertCount).toBe(1);
    expect(task.status).toBe("COMPLETED");
    expect(task.attempts).toBe(1);
  });

  it("exposes a cron-compatible processor endpoint guarded by CRON_SECRET", async () => {
    const previousSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "test-cron-secret";
    const { scheduleAbandonedChatFollowUp } = await import("@/lib/workflow-tasks");
    const { GET } = await import("@/app/api/workflows/process/route");
    const { NextRequest } = await import("next/server");
    const venue = await createVenue();
    const inquiry = await createInquiry(venue.id);

    await scheduleAbandonedChatFollowUp({
      venueId: venue.id,
      inquiryId: inquiry.id,
      guestName: inquiry.guestName,
      scheduledFor: new Date(Date.now() - 60_000),
    });

    const denied = await GET(new NextRequest("http://localhost/api/workflows/process"));
    const accepted = await GET(
      new NextRequest("http://localhost/api/workflows/process?limit=5", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    const body = await accepted.json();

    process.env.CRON_SECRET = previousSecret;

    expect(denied.status).toBe(401);
    expect(accepted.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.customerMessagingEnabled).toBe(false);
    expect(body.outboundMessagesSent).toBe(0);
    expect(body.completed).toBe(1);
  });

  it("cancels unpaid deposit reminders when the deposit success route confirms payment", async () => {
    const { scheduleUnpaidDepositReminderForReservation } = await import("@/lib/workflow-tasks");
    const { GET } = await import("@/app/api/public/deposits/[reservationId]/success/route");
    const { NextRequest } = await import("next/server");
    const venue = await createVenue();
    const tableOption = await createTableOption(venue.id);
    const inquiry = await createInquiry(venue.id, { status: "DEPOSIT_SENT" });
    const reservation = await prisma.reservation.create({
      data: {
        inquiryId: inquiry.id,
        tableOptionId: tableOption.id,
        status: "DEPOSIT_PENDING",
        depositAmountCents: tableOption.depositAmountCents,
        depositPaidCents: 0,
        confirmationCode: "WF-TEST-3",
        arrivalTimeLabel: "Saturday 11 PM",
      },
      include: { tableOption: true },
    });

    await scheduleUnpaidDepositReminderForReservation({
      venueId: venue.id,
      inquiryId: inquiry.id,
      reservationId: reservation.id,
      guestName: inquiry.guestName,
      tableName: reservation.tableOption.name,
      depositAmountCents: reservation.depositAmountCents,
      scheduledFor: new Date("2026-05-16T18:00:00.000Z"),
    });

    await GET(
      new NextRequest(`http://localhost/api/public/deposits/${reservation.id}/success?session_id=test_session`),
      { params: Promise.resolve({ reservationId: reservation.id }) },
    );
    const task = await prisma.workflowTask.findFirstOrThrow({
      where: { venueId: venue.id, inquiryId: inquiry.id, type: "UNPAID_DEPOSIT_REMINDER" },
    });

    expect(task.status).toBe("CANCELLED");
    expect(task.lastError).toBe("Deposit paid before the reminder was due.");
  });
});
