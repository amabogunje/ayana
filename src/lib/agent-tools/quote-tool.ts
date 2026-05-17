import { prisma } from "@/lib/prisma";
import {
  findRecommendedTableOptionForAgent,
  hasEnoughTableQualification,
  type AgentResultForTableOptions,
  type TableOptionContext,
} from "@/lib/agent-tools/table-options-tool";

export type CreateDraftQuoteResult = AgentResultForTableOptions & {
  isHumanTakeover: boolean;
  recommendation: AgentResultForTableOptions["recommendation"] & {
    quoteLabel: string | null;
    quotePitch: string | null;
    readyForQuote: boolean;
  };
};

export type CreateDraftQuoteContext = TableOptionContext & {
  guestName: string;
};

export async function createDraftQuoteIfReadyForAgent(input: {
  inquiryId: string;
  result: CreateDraftQuoteResult;
  context: CreateDraftQuoteContext;
  isClosedNight?: boolean;
}) {
  if (input.result.isHumanTakeover || !input.result.recommendation.readyForQuote) return null;
  if (!hasEnoughTableQualification(input.result, input.context)) return null;
  if (input.isClosedNight) return null;

  const tableOption = findRecommendedTableOptionForAgent(input.result, input.context);
  if (!tableOption) return null;

  const existingQuote = await prisma.quoteOption.findFirst({
    where: {
      inquiryId: input.inquiryId,
      tableOptionId: tableOption.id,
    },
  });

  if (existingQuote) return existingQuote;

  return prisma.quoteOption.create({
    data: {
      inquiryId: input.inquiryId,
      tableOptionId: tableOption.id,
      label: input.result.recommendation.quoteLabel || `${tableOption.name} recommendation`,
      pitch:
        input.result.recommendation.quotePitch ||
        `Recommended by website chat for ${input.context.guestName}.`,
      sentAt: null,
    },
  });
}
