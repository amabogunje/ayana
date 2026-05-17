import { prisma } from "@/lib/prisma";
import { Prisma, type WorkflowTask, type WorkflowTaskStatus, type WorkflowTaskType } from "@prisma/client";

export type CreateWorkflowTaskInput = {
  venueId: string;
  inquiryId?: string | null;
  customerId?: string | null;
  type: WorkflowTaskType;
  scheduledFor: Date;
  payload?: Prisma.InputJsonValue | null;
};

export type ProcessWorkflowTasksInput = {
  now?: Date;
  limit?: number;
  staleProcessingMinutes?: number;
};

export type WorkflowTaskProcessingResult = {
  processed: number;
  claimed: number;
  completed: number;
  failed: number;
  skipped: number;
  requeued: number;
  tasks: Array<{
    id: string;
    type: WorkflowTaskType;
    status: WorkflowTaskStatus;
  }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function payloadSummary(value: unknown) {
  if (!isRecord(value)) return "No payload.";

  const reservationId = typeof value.reservationId === "string" ? value.reservationId : null;
  const tableName = typeof value.tableName === "string" ? value.tableName : null;
  const guestName = typeof value.guestName === "string" ? value.guestName : null;

  return [
    guestName ? `guest=${guestName}` : null,
    tableName ? `table=${tableName}` : null,
    reservationId ? `reservation=${reservationId}` : null,
  ]
    .filter(Boolean)
    .join("; ") || "Payload present.";
}

async function logWorkflowActivity(input: {
  venueId: string;
  inquiryId?: string | null;
  taskId: string;
  action: string;
  summary: string;
}) {
  await prisma.activityLog.create({
    data: {
      venueId: input.venueId,
      entityType: "workflow_task",
      entityId: input.taskId,
      action: input.action,
      summary: input.summary,
    },
  });
}

export async function createWorkflowTask(input: CreateWorkflowTaskInput) {
  const existing = await prisma.workflowTask.findFirst({
    where: {
      venueId: input.venueId,
      inquiryId: input.inquiryId ?? null,
      type: input.type,
      status: "PENDING",
    },
    orderBy: { scheduledFor: "asc" },
  });

  if (existing) return existing;

  const task = await prisma.workflowTask.create({
    data: {
      venueId: input.venueId,
      inquiryId: input.inquiryId ?? null,
      customerId: input.customerId ?? null,
      type: input.type,
      scheduledFor: input.scheduledFor,
      payload: input.payload ?? Prisma.JsonNull,
    },
  });

  await logWorkflowActivity({
    venueId: input.venueId,
    inquiryId: input.inquiryId,
    taskId: task.id,
    action: "workflow.task_scheduled",
    summary: `Scheduled ${input.type} for ${input.scheduledFor.toISOString()}.`,
  });

  return task;
}

export async function cancelWorkflowTask(taskId: string, reason = "Cancelled by workflow service.") {
  const update = await prisma.workflowTask.updateMany({
    where: {
      id: taskId,
      status: { in: ["PENDING", "PROCESSING"] },
    },
    data: {
      status: "CANCELLED",
      processingStartedAt: null,
      cancelledAt: new Date(),
      lastError: reason,
    },
  });
  const task = await prisma.workflowTask.findUniqueOrThrow({ where: { id: taskId } });

  if (update.count === 0) return task;

  await logWorkflowActivity({
    venueId: task.venueId,
    inquiryId: task.inquiryId,
    taskId: task.id,
    action: "workflow.task_cancelled",
    summary: `${task.type} cancelled: ${reason}`,
  });

  return task;
}

export async function cancelPendingWorkflowTasksForInquiry(input: {
  venueId: string;
  inquiryId: string;
  types?: WorkflowTaskType[];
  reason?: string;
}) {
  const tasks = await prisma.workflowTask.findMany({
    where: {
      venueId: input.venueId,
      inquiryId: input.inquiryId,
      status: "PENDING",
      ...(input.types ? { type: { in: input.types } } : {}),
    },
  });

  const cancelled: WorkflowTask[] = [];
  for (const task of tasks) {
    cancelled.push(await cancelWorkflowTask(task.id, input.reason ?? "Superseded by conversation progress."));
  }

  return cancelled;
}

export async function completeWorkflowTask(taskId: string, summary = "Workflow task completed.") {
  const update = await prisma.workflowTask.updateMany({
    where: {
      id: taskId,
      status: { in: ["PENDING", "PROCESSING"] },
    },
    data: {
      status: "COMPLETED",
      processingStartedAt: null,
      completedAt: new Date(),
      lastError: null,
    },
  });
  const task = await prisma.workflowTask.findUniqueOrThrow({ where: { id: taskId } });

  if (update.count === 0) return task;

  await logWorkflowActivity({
    venueId: task.venueId,
    inquiryId: task.inquiryId,
    taskId: task.id,
    action: "workflow.task_completed",
    summary,
  });

  return task;
}

export async function failWorkflowTask(taskId: string, error: unknown) {
  const message = error instanceof Error ? error.message : "Workflow task failed.";
  const update = await prisma.workflowTask.updateMany({
    where: {
      id: taskId,
      status: "PROCESSING",
    },
    data: {
      status: "FAILED",
      processingStartedAt: null,
      lastError: message,
    },
  });
  const task = await prisma.workflowTask.findUniqueOrThrow({ where: { id: taskId } });

  if (update.count === 0) return task;

  await logWorkflowActivity({
    venueId: task.venueId,
    inquiryId: task.inquiryId,
    taskId: task.id,
    action: "workflow.task_failed",
    summary: `${task.type} failed: ${message}`,
  });

  return task;
}

export async function scheduleUnpaidDepositReminderForReservation(input: {
  venueId: string;
  inquiryId: string;
  reservationId: string;
  guestName: string;
  tableName: string;
  depositAmountCents: number;
  scheduledFor: Date;
}) {
  return createWorkflowTask({
    venueId: input.venueId,
    inquiryId: input.inquiryId,
    type: "UNPAID_DEPOSIT_REMINDER",
    scheduledFor: input.scheduledFor,
    payload: {
      reservationId: input.reservationId,
      guestName: input.guestName,
      tableName: input.tableName,
      depositAmountCents: input.depositAmountCents,
      action: "operator_visible_reminder",
    },
  });
}

export async function scheduleAbandonedChatFollowUp(input: {
  venueId: string;
  inquiryId: string;
  guestName: string;
  scheduledFor: Date;
  reason?: string;
}) {
  return createWorkflowTask({
    venueId: input.venueId,
    inquiryId: input.inquiryId,
    type: "ABANDONED_CHAT_FOLLOW_UP",
    scheduledFor: input.scheduledFor,
    payload: {
      guestName: input.guestName,
      reason: input.reason ?? "qualified_or_quoted_chat_went_quiet",
      action: "operator_visible_follow_up",
    },
  });
}

async function createOperatorAlertForTask(task: WorkflowTask) {
  const fingerprint = `workflow:${task.type}:${task.id}`;
  const title =
    task.type === "UNPAID_DEPOSIT_REMINDER"
      ? "Deposit reminder due"
      : task.type === "ABANDONED_CHAT_FOLLOW_UP"
        ? "Chat follow-up due"
        : task.type === "STALE_QUOTE_EXPIRATION"
          ? "Stale quote review due"
          : task.type === "POST_BOOKING_CONFIRMATION"
            ? "Post-booking confirmation due"
            : "Operator workflow alert";

  await prisma.alert.upsert({
    where: { fingerprint },
    update: {},
    create: {
      fingerprint,
      venueId: task.venueId,
      inquiryId: task.inquiryId,
      type: task.type,
      severity: "INFO",
      title,
      description: `${title}. ${payloadSummary(task.payload)}`,
    },
  });
}

async function processWorkflowTask(task: WorkflowTask) {
  if (task.type === "UNPAID_DEPOSIT_REMINDER" && isRecord(task.payload) && typeof task.payload.reservationId === "string") {
    const reservation = await prisma.reservation.findUnique({
      where: { id: task.payload.reservationId },
      select: {
        status: true,
        depositAmountCents: true,
        depositPaidCents: true,
      },
    });

    if (!reservation) {
      return completeWorkflowTask(task.id, "Skipped unpaid deposit reminder because the reservation no longer exists.");
    }

    if (reservation.status === "CONFIRMED" || reservation.depositPaidCents >= reservation.depositAmountCents) {
      return completeWorkflowTask(task.id, "Skipped unpaid deposit reminder because the deposit is already paid.");
    }
  }

  await createOperatorAlertForTask(task);

  const summary =
    task.type === "UNPAID_DEPOSIT_REMINDER"
      ? `Unpaid deposit reminder is due. ${payloadSummary(task.payload)}`
      : task.type === "ABANDONED_CHAT_FOLLOW_UP"
        ? `Abandoned chat follow-up is due. ${payloadSummary(task.payload)}`
        : `${task.type} workflow task is due. ${payloadSummary(task.payload)}`;

  return completeWorkflowTask(task.id, summary);
}

async function requeueStaleProcessingTasks(now: Date, staleProcessingMinutes: number) {
  const staleBefore = new Date(now.getTime() - staleProcessingMinutes * 60 * 1000);
  const result = await prisma.workflowTask.updateMany({
    where: {
      status: "PROCESSING",
      processingStartedAt: {
        lt: staleBefore,
      },
    },
    data: {
      status: "PENDING",
      processingStartedAt: null,
      lastError: "Processing lock expired; task was returned to pending.",
    },
  });

  return result.count;
}

async function claimWorkflowTask(task: WorkflowTask, now: Date) {
  const claim = await prisma.workflowTask.updateMany({
    where: {
      id: task.id,
      status: "PENDING",
      scheduledFor: {
        lte: now,
      },
    },
    data: {
      status: "PROCESSING",
      processingStartedAt: now,
      attempts: { increment: 1 },
      lastError: null,
    },
  });

  if (claim.count === 0) return null;
  return prisma.workflowTask.findUnique({ where: { id: task.id } });
}

export async function processDueWorkflowTasks(input: ProcessWorkflowTasksInput = {}): Promise<WorkflowTaskProcessingResult> {
  const now = input.now ?? new Date();
  const limit = Math.max(1, Math.min(input.limit ?? 25, 100));
  const staleProcessingMinutes = Math.max(5, Math.min(input.staleProcessingMinutes ?? 15, 120));
  const requeued = await requeueStaleProcessingTasks(now, staleProcessingMinutes);
  const dueTasks = await prisma.workflowTask.findMany({
    where: {
      status: "PENDING",
      scheduledFor: {
        lte: now,
      },
    },
    orderBy: { scheduledFor: "asc" },
    take: limit,
  });

  const result: WorkflowTaskProcessingResult = {
    processed: 0,
    claimed: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
    requeued,
    tasks: [],
  };

  for (const task of dueTasks) {
    const claimedTask = await claimWorkflowTask(task, now);
    if (!claimedTask) {
      result.skipped += 1;
      continue;
    }

    result.claimed += 1;
    result.processed += 1;
    try {
      const completed = await processWorkflowTask(claimedTask);
      result.completed += 1;
      result.tasks.push({ id: completed.id, type: completed.type, status: completed.status });
    } catch (error) {
      const failed = await failWorkflowTask(claimedTask.id, error);
      result.failed += 1;
      result.tasks.push({ id: failed.id, type: failed.type, status: failed.status });
    }
  }

  return result;
}
