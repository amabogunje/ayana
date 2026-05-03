import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { mockDashboardData } from "@/lib/mock-data";

const createInquirySchema = z.object({
  venueSlug: z.string().min(1),
  guestName: z.string().min(2),
  channel: z.enum(["WEBSITE_CHAT", "SMS", "INSTAGRAM_DM", "PHONE"]),
  requestedDateLabel: z.string().min(2),
  partySize: z.number().int().min(1).max(30),
  spendIntentLabel: z.string().min(2),
  spendIntentMinCents: z.number().int().nonnegative().optional(),
  spendIntentMaxCents: z.number().int().nonnegative().optional(),
  occasion: z.string().optional(),
  message: z.string().min(2),
});

export type CreateInquiryInput = z.infer<typeof createInquirySchema>;

type CreatedInquiry = {
  id: string;
  status: string;
  nextAction: string;
};

type InquiryListItem = {
  id: string;
  guestName: string;
  channel: string;
  status: string;
  venue: {
    name: string;
  };
  spendIntentLabel: string;
  partySize: number;
  requestedDateLabel: string;
  nextAction: string;
  aiConfidence: number;
  messages: Array<{ content: string }>;
};

type InquiryRepository = {
  venue: {
    findUnique: (args: { where: { slug: string } }) => Promise<{ id: string } | null>;
  };
  inquiry: {
    create: (args: {
      data: {
        venueId: string;
        guestName: string;
        channel: "WEBSITE_CHAT" | "SMS" | "INSTAGRAM_DM" | "PHONE";
        status: string;
        requestedAt: Date;
        requestedDateLabel: string;
        partySize: number;
        spendIntentLabel: string;
        spendIntentMinCents?: number;
        spendIntentMaxCents?: number;
        occasion?: string;
        nextAction: string;
        aiConfidence: number;
        messages: {
          create: {
            authorRole: string;
            content: string;
          };
        };
      };
    }) => Promise<CreatedInquiry>;
    findMany: (args: {
      include: {
        venue: boolean;
        messages: {
          orderBy: { createdAt: "desc" | "asc" };
          take: number;
        };
      };
      orderBy: { requestedAt: "desc" | "asc" };
    }) => Promise<InquiryListItem[]>;
  };
};

function buildFallbackStatus(channel: "WEBSITE_CHAT" | "SMS" | "INSTAGRAM_DM" | "PHONE") {
  if (channel === "PHONE") {
    return "NEEDS_HUMAN";
  }

  return "NEW";
}

export async function createInquiry(input: CreateInquiryInput) {
  const payload = createInquirySchema.parse(input);
  const repository = prisma as unknown as InquiryRepository;

  if (!process.env.DATABASE_URL) {
    return {
      id: `mock-${Date.now()}`,
      status: buildFallbackStatus(payload.channel),
      source: "mock" as const,
      nextAction: "Database not configured yet. Inquiry accepted into mock pipeline.",
    };
  }

  const venue = await repository.venue.findUnique({
    where: { slug: payload.venueSlug },
  });

  if (!venue) {
    throw new Error(`Unknown venue slug: ${payload.venueSlug}`);
  }

  const inquiry = await repository.inquiry.create({
    data: {
      venueId: venue.id,
      guestName: payload.guestName,
      channel: payload.channel,
      status: buildFallbackStatus(payload.channel),
      requestedAt: new Date(),
      requestedDateLabel: payload.requestedDateLabel,
      partySize: payload.partySize,
      spendIntentLabel: payload.spendIntentLabel,
      spendIntentMinCents: payload.spendIntentMinCents,
      spendIntentMaxCents: payload.spendIntentMaxCents,
      occasion: payload.occasion,
      nextAction: "Run qualification workflow and return table options.",
      aiConfidence: 0.74,
      messages: {
        create: {
          authorRole: "guest",
          content: payload.message,
        },
      },
    },
  });

  return {
    id: inquiry.id,
    status: inquiry.status,
    source: "database" as const,
    nextAction: inquiry.nextAction,
  };
}

export async function listActiveInquiries() {
  if (!process.env.DATABASE_URL) {
    return mockDashboardData.inquiries;
  }

  const repository = prisma as unknown as InquiryRepository;
  const inquiries = await repository.inquiry.findMany({
    include: {
      venue: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { requestedAt: "desc" },
  });

  return inquiries.map((inquiry: InquiryListItem) => ({
    id: inquiry.id,
    guestName: inquiry.guestName,
    channel: inquiry.channel,
    status: inquiry.status,
    venue: inquiry.venue.name,
    spendIntent: inquiry.spendIntentLabel,
    partySize: inquiry.partySize,
    requestedFor: inquiry.requestedDateLabel,
    lastMessage: inquiry.messages[0]?.content ?? "",
    nextAction: inquiry.nextAction,
    aiConfidence: inquiry.aiConfidence,
  }));
}
