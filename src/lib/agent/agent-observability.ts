import { prisma } from "@/lib/prisma";
import type { Channel } from "@prisma/client";

type AgentRunStatus = "STARTED" | "COMPLETED" | "FAILED" | "SKIPPED";
type AgentToolCallStatus = "STARTED" | "COMPLETED" | "FAILED" | "SKIPPED";

type SafeAgentRun = {
  id: string;
  startedAt: Date;
};

type StartAgentRunInput = {
  venueId: string;
  inquiryId?: string | null;
  channel: Channel;
  source?: string;
  model?: string | null;
};

type CompleteAgentRunInput = {
  agentRunId?: string | null;
  status: Exclude<AgentRunStatus, "STARTED">;
  intent?: string | null;
  objective?: string | null;
  conversationMode?: string | null;
  confidence?: number | null;
  finalAction?: string | null;
  resultSummary?: string | null;
  errorMessage?: string | null;
};

type RecordAgentToolCallInput<TOutput> = {
  agentRunId?: string | null;
  venueId: string;
  inquiryId?: string | null;
  toolName: string;
  inputSummary?: string | null;
  getOutputSummary?: (output: TOutput) => string | null | undefined;
  getCompletedStatus?: (output: TOutput) => AgentToolCallStatus;
  execute: () => Promise<TOutput>;
};

const maxSummaryLength = 1_000;

function truncateSummary(value: string | null | undefined) {
  if (!value) return null;
  return value.length > maxSummaryLength ? `${value.slice(0, maxSummaryLength - 3)}...` : value;
}

function serializeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown agent observability error.";
  return truncateSummary(message);
}

async function tryObservabilityWrite<T>(operation: () => Promise<T>) {
  try {
    return await operation();
  } catch (error) {
    console.error("Agent observability write failed.", error);
    return null;
  }
}

export async function startAgentRunSafely(input: StartAgentRunInput): Promise<SafeAgentRun | null> {
  return tryObservabilityWrite(async () => {
    const run = await prisma.agentRun.create({
      data: {
        venueId: input.venueId,
        inquiryId: input.inquiryId ?? null,
        channel: input.channel,
        source: input.source ?? "website_chat_agent",
        model: input.model ?? null,
        status: "STARTED",
      },
      select: {
        id: true,
        startedAt: true,
      },
    });

    return run;
  });
}

export async function completeAgentRunSafely(input: CompleteAgentRunInput) {
  if (!input.agentRunId) return null;
  const agentRunId = input.agentRunId;

  return tryObservabilityWrite(async () => {
    const existing = await prisma.agentRun.findUnique({
      where: { id: agentRunId },
      select: { startedAt: true },
    });
    const completedAt = new Date();
    const durationMs = existing ? completedAt.getTime() - existing.startedAt.getTime() : null;

    return prisma.agentRun.update({
      where: { id: agentRunId },
      data: {
        status: input.status,
        intent: input.intent ?? null,
        objective: input.objective ?? null,
        conversationMode: input.conversationMode ?? null,
        confidence: input.confidence ?? null,
        finalAction: truncateSummary(input.finalAction),
        resultSummary: truncateSummary(input.resultSummary),
        errorMessage: truncateSummary(input.errorMessage),
        completedAt,
        durationMs,
      },
    });
  });
}

export async function recordAgentToolCallSafely<TOutput>(input: RecordAgentToolCallInput<TOutput>) {
  const startedAt = new Date();
  const toolCall = await tryObservabilityWrite(async () =>
    prisma.agentToolCall.create({
      data: {
        agentRunId: input.agentRunId ?? null,
        venueId: input.venueId,
        inquiryId: input.inquiryId ?? null,
        toolName: input.toolName,
        status: "STARTED",
        inputSummary: truncateSummary(input.inputSummary),
        startedAt,
      },
      select: {
        id: true,
        startedAt: true,
      },
    }),
  );

  try {
    const output = await input.execute();
    const completedAt = new Date();
    const status = input.getCompletedStatus?.(output) ?? "COMPLETED";
    const durationMs = completedAt.getTime() - (toolCall?.startedAt ?? startedAt).getTime();

    if (toolCall) {
      await tryObservabilityWrite(async () =>
        prisma.agentToolCall.update({
          where: { id: toolCall.id },
          data: {
            status,
            outputSummary: truncateSummary(input.getOutputSummary?.(output)),
            completedAt,
            durationMs,
          },
        }),
      );
    }

    return output;
  } catch (error) {
    const completedAt = new Date();
    const durationMs = completedAt.getTime() - (toolCall?.startedAt ?? startedAt).getTime();

    if (toolCall) {
      await tryObservabilityWrite(async () =>
        prisma.agentToolCall.update({
          where: { id: toolCall.id },
          data: {
            status: "FAILED",
            errorMessage: serializeError(error),
            completedAt,
            durationMs,
          },
        }),
      );
    }

    throw error;
  }
}
