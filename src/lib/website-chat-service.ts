import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { runWebsiteChatAgent } from "@/lib/website-chat-agent";

function normalizeOrigin(value: string) {
  return value.trim().replace(/\/+$/, "").toLowerCase();
}

export function isWebsiteChatListedInChannels(channelsSummary: string | null | undefined) {
  return (channelsSummary ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .includes("website chat");
}

function parseAllowedOrigins(summary: string | null | undefined) {
  return (summary ?? "")
    .split(/[\n,]/)
    .map((item) => normalizeOrigin(item))
    .filter(Boolean);
}

function assertWebsiteChatOrigin(input: {
  allowedOrigins: string | null | undefined;
  origin?: string | null;
}) {
  const allowed = parseAllowedOrigins(input.allowedOrigins);
  if (allowed.length === 0) {
    return;
  }

  const normalizedOrigin = normalizeOrigin(input.origin ?? "");
  if (!normalizedOrigin || !allowed.includes(normalizedOrigin)) {
    throw new Error("Website chat is not allowed from this origin.");
  }
}

export function makeWebsiteChatWidgetKey() {
  return `wc_${randomUUID().replace(/-/g, "")}`;
}

export function makeWebsiteChatSessionToken() {
  return `wcs_${randomUUID().replace(/-/g, "")}`;
}

export function buildWebsiteChatSnippet(input: {
  appUrl: string;
  widgetKey: string;
}) {
  const baseUrl = input.appUrl.replace(/\/+$/, "");
  return `<script async src="${baseUrl}/api/widget.js" data-widget-key="${input.widgetKey}"></script>`;
}

export async function ensureWebsiteChatVenueConfiguration(input: {
  venueId: string;
  channelsSummary: string | null | undefined;
  websiteChatEnabled: boolean;
  websiteChatWidgetKey: string | null;
}) {
  const shouldEnable = isWebsiteChatListedInChannels(input.channelsSummary);

  if (!shouldEnable) {
    return {
      websiteChatEnabled: false,
      websiteChatWidgetKey: input.websiteChatWidgetKey,
    };
  }

  if (input.websiteChatEnabled && input.websiteChatWidgetKey) {
    return {
      websiteChatEnabled: true,
      websiteChatWidgetKey: input.websiteChatWidgetKey,
    };
  }

  const websiteChatWidgetKey = input.websiteChatWidgetKey ?? makeWebsiteChatWidgetKey();

  await prisma.venue.update({
    where: { id: input.venueId },
    data: {
      websiteChatEnabled: true,
      websiteChatWidgetKey,
    },
  });

  return {
    websiteChatEnabled: true,
    websiteChatWidgetKey,
  };
}

export async function getWebsiteChatWidgetConfig(widgetKey: string, origin?: string | null) {
  const venue = await prisma.venue.findFirst({
    where: {
      websiteChatWidgetKey: widgetKey,
      websiteChatEnabled: true,
      status: {
        in: ["PILOT", "ACTIVE"],
      },
    },
    select: {
      id: true,
      slug: true,
      name: true,
      timezone: true,
      websiteChatAllowedOrigins: true,
      websiteChatWelcomeMessage: true,
      websiteChatPromptPlaceholder: true,
    },
  });

  if (!venue) {
    throw new Error("Website chat is not available for this venue.");
  }

  assertWebsiteChatOrigin({
    allowedOrigins: venue.websiteChatAllowedOrigins,
    origin,
  });

  return {
    venueId: venue.id,
    venueSlug: venue.slug,
    venueName: venue.name,
    timezone: venue.timezone,
    welcomeMessage:
      venue.websiteChatWelcomeMessage ??
      `Chat with ${venue.name} about tables, availability, and booking details.`,
    promptPlaceholder: venue.websiteChatPromptPlaceholder ?? "Type your message",
    introPrompt: `Hi, welcome to ${venue.name}. Tell us what kind of table or night you're planning, and we’ll help with availability, pricing, and next steps.`,
  };
}

export async function startWebsiteChatSession(input: {
  widgetKey: string;
  origin?: string | null;
  guestName: string;
  phone?: string | null;
  email?: string | null;
  requestedDateLabel?: string | null;
  partySize?: number | null;
  spendIntentLabel?: string | null;
  spendIntentMinCents?: number | null;
  spendIntentMaxCents?: number | null;
  occasion?: string | null;
  message?: string | null;
}) {
  const venue = await prisma.venue.findFirst({
    where: {
      websiteChatWidgetKey: input.widgetKey,
      websiteChatEnabled: true,
      status: {
        in: ["PILOT", "ACTIVE"],
      },
    },
    select: {
      id: true,
      name: true,
      websiteChatAllowedOrigins: true,
    },
  });

  if (!venue) {
    throw new Error("Website chat is not available for this venue.");
  }

  assertWebsiteChatOrigin({
    allowedOrigins: venue.websiteChatAllowedOrigins,
    origin: input.origin,
  });

  const now = new Date();
  const guestOpeningMessage = input.message?.trim();
  const introPrompt = `Hi ${input.guestName.split(" ")[0] || "there"}, welcome to ${venue.name}. Tell us what date you’re looking for, your group size, and the kind of table or budget you have in mind.`;
  const inquiry = await prisma.inquiry.create({
    data: {
      venueId: venue.id,
      guestName: input.guestName,
      phone: input.phone || null,
      channel: "WEBSITE_CHAT",
      status: "NEW",
      requestedAt: now,
      lastInboundAt: guestOpeningMessage ? now : null,
      requestedDateLabel: input.requestedDateLabel || "Not provided yet",
      partySize: input.partySize ?? 1,
      spendIntentLabel: input.spendIntentLabel || "Not provided yet",
      spendIntentMinCents: input.spendIntentMinCents ?? null,
      spendIntentMaxCents: input.spendIntentMaxCents ?? null,
      occasion: input.occasion || null,
      aiConfidence: 0.78,
      nextAction: "Qualify website chat lead inside the live conversation.",
      messages: {
        create: [
          {
            authorRole: "operator",
            content: introPrompt,
          },
          ...(guestOpeningMessage
            ? [
                {
                  authorRole: "guest",
                  content: guestOpeningMessage,
                },
              ]
            : []),
        ],
      },
      websiteChatSession: {
        create: {
          venueId: venue.id,
          sessionToken: makeWebsiteChatSessionToken(),
          guestDisplayName: input.guestName,
          guestPhone: input.phone || null,
          guestEmail: input.email || null,
          origin: input.origin ? normalizeOrigin(input.origin) : null,
          lastSeenAt: now,
        },
      },
    },
    include: {
      websiteChatSession: true,
      messages: {
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  await prisma.activityLog.create({
    data: {
      venueId: venue.id,
      entityType: "website_chat_session",
      entityId: inquiry.websiteChatSession?.id ?? null,
      action: "website_chat.session_started",
      summary: `Started website chat inquiry for ${input.guestName} at ${venue.name}.`,
    },
  });

  return {
    inquiryId: inquiry.id,
    sessionToken: inquiry.websiteChatSession!.sessionToken,
    messages: inquiry.messages.map((message) => ({
      id: message.id,
      authorRole: message.authorRole,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    })),
  };
}

async function getWebsiteChatSessionForAccess(sessionToken: string) {
  const session = await prisma.websiteChatSession.findUnique({
    where: { sessionToken },
    include: {
      inquiry: {
        include: {
          messages: {
            orderBy: {
              createdAt: "asc",
            },
          },
        },
      },
      venue: {
        select: {
          id: true,
          websiteChatEnabled: true,
        },
      },
    },
  });

  if (!session || !session.venue.websiteChatEnabled) {
    throw new Error("Website chat session not found.");
  }

  return session;
}

export async function listWebsiteChatMessages(sessionToken: string, origin?: string | null) {
  const session = await getWebsiteChatSessionForAccess(sessionToken);
  const sessionOrigin = session.origin ? normalizeOrigin(session.origin) : null;
  const requestOrigin = origin ? normalizeOrigin(origin) : null;

  if (sessionOrigin && requestOrigin && sessionOrigin !== requestOrigin) {
    throw new Error("Website chat session origin mismatch.");
  }

  await prisma.websiteChatSession.update({
    where: { id: session.id },
    data: {
      lastSeenAt: new Date(),
    },
  });

  return {
    inquiryId: session.inquiry.id,
    messages: session.inquiry.messages.map((message) => ({
      id: message.id,
      authorRole: message.authorRole,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    })),
  };
}

export async function addWebsiteChatGuestMessage(input: {
  sessionToken: string;
  origin?: string | null;
  content: string;
}) {
  const session = await getWebsiteChatSessionForAccess(input.sessionToken);
  const sessionOrigin = session.origin ? normalizeOrigin(session.origin) : null;
  const requestOrigin = input.origin ? normalizeOrigin(input.origin) : null;

  if (sessionOrigin && requestOrigin && sessionOrigin !== requestOrigin) {
    throw new Error("Website chat session origin mismatch.");
  }

  const now = new Date();
  const recentMessageCount = await prisma.inquiryMessage.count({
    where: {
      inquiryId: session.inquiryId,
      authorRole: "guest",
      createdAt: {
        gte: new Date(now.getTime() - 60_000),
      },
    },
  });

  if (recentMessageCount >= 8) {
    throw new Error("Please wait a moment before sending another message.");
  }

  const message = await prisma.inquiryMessage.create({
    data: {
      inquiryId: session.inquiryId,
      authorRole: "guest",
      content: input.content,
    },
  });

  await prisma.inquiry.update({
    where: { id: session.inquiryId },
    data: {
      lastInboundAt: now,
      nextAction: "Continue qualification and move toward quote or deposit in website chat.",
      status: session.inquiry.status === "LOST" ? "NEW" : undefined,
    },
  });

  await prisma.websiteChatSession.update({
    where: { id: session.id },
    data: {
      lastSeenAt: now,
    },
  });

  await runWebsiteChatAgent({
    inquiryId: session.inquiryId,
    guestMessageId: message.id,
  });

  return {
    id: message.id,
    authorRole: message.authorRole,
    content: message.content,
    createdAt: message.createdAt.toISOString(),
  };
}
