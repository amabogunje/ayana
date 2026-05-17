import { prisma } from "@/lib/prisma";

export async function logWebsiteChatAgentDiagnostic(input: {
  venueId: string;
  action: string;
  summary: string;
  entityId?: string;
}) {
  await prisma.activityLog.create({
    data: {
      venueId: input.venueId,
      entityType: "website_chat_agent",
      entityId: input.entityId ?? null,
      action: input.action,
      summary: input.summary,
    },
  });
}

export async function logWebsiteChatAgentOutcome(input: {
  venueId: string;
  replyMessageId: string;
  guestName: string;
  isHumanTakeover: boolean;
  handoffReason: string | null;
  reservationDeposit?: {
    tableOption: {
      name: string;
    };
    depositCheckoutUrl: string | null;
  } | null;
  draftQuote?: {
    label: string;
  } | null;
}) {
  await prisma.activityLog.create({
    data: {
      venueId: input.venueId,
      entityType: "website_chat_agent",
      entityId: input.replyMessageId,
      action: input.isHumanTakeover
        ? "website_chat.agent_escalated"
        : input.reservationDeposit?.depositCheckoutUrl
          ? "website_chat.agent_deposit_link_sent"
          : input.reservationDeposit
            ? "website_chat.agent_reservation_created_no_checkout"
        : input.draftQuote
          ? "website_chat.agent_draft_quote_created"
          : "website_chat.agent_replied",
      summary: input.isHumanTakeover
        ? `Escalated website chat for ${input.guestName}: ${input.handoffReason ?? "review needed"}.`
        : input.reservationDeposit?.depositCheckoutUrl
          ? `Sent deposit checkout for ${input.reservationDeposit.tableOption.name} to ${input.guestName}.`
          : input.reservationDeposit
            ? `Created reservation for ${input.reservationDeposit.tableOption.name}, but no deposit checkout was available.`
        : input.draftQuote
          ? `Created draft quote ${input.draftQuote.label} for ${input.guestName}.`
          : `Replied to website chat for ${input.guestName}.`,
    },
  });
}
