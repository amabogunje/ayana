import { DashboardData, InboxInquiry, OfferCard } from "@/lib/dashboard-types";
import { formatCurrencyFromCents, formatCurrencyRange } from "@/lib/format";
import { mockDashboardData } from "@/lib/mock-data";
import { prisma } from "@/lib/prisma";

type InquiryStatusValue =
  | "NEW"
  | "QUALIFYING"
  | "QUOTED"
  | "DEPOSIT_SENT"
  | "CONFIRMED"
  | "NEEDS_HUMAN"
  | "LOST";

type ChannelValue = "SMS" | "INSTAGRAM_DM" | "PHONE";

type InquiryRecord = {
  id: string;
  guestName: string;
  channel: ChannelValue;
  status: InquiryStatusValue;
  partySize: number;
  spendIntentLabel: string;
  requestedDateLabel: string;
  nextAction: string;
  aiConfidence: number;
  venue: {
    name: string;
  };
  messages: Array<{
    content: string;
  }>;
};

type TableRecord = {
  name: string;
  quantity: number;
  minSpendCents: number;
  capacityMax: number;
  description: string;
};

type DashboardRepository = {
  tableOption: {
    findMany: (args: {
      where: { active: boolean };
      orderBy: Array<{ minSpendCents: "desc" | "asc" }>;
      take: number;
    }) => Promise<TableRecord[]>;
  };
  inquiry: {
    findMany: (args: {
      orderBy: Array<{ requestedAt: "desc" | "asc" }>;
      take: number;
      include: {
        venue: boolean;
        messages: {
          orderBy: { createdAt: "desc" | "asc" };
          take: number;
        };
      };
    }) => Promise<InquiryRecord[]>;
  };
};

function statusLabel(status: InquiryStatusValue): string {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function channelLabel(channel: ChannelValue): string {
  switch (channel) {
    case "INSTAGRAM_DM":
      return "Instagram";
    case "PHONE":
      return "Phone";
    case "SMS":
      return "SMS";
    default:
      return channel;
  }
}

function buildOffer(table: {
  name: string;
  quantity: number;
  minSpendCents: number;
  capacityMax: number;
  description: string;
}): OfferCard {
  return {
    name: table.name,
    minSpend: `${formatCurrencyFromCents(table.minSpendCents)} minimum`,
    capacity: `Up to ${table.capacityMax} guests`,
    positioning: `${table.quantity} available · ${table.description}`,
  };
}

function buildInquiry(inquiry: InquiryRecord): InboxInquiry {
  return {
    id: inquiry.id,
    guestName: inquiry.guestName,
    channel: channelLabel(inquiry.channel),
    status: statusLabel(inquiry.status),
    venue: inquiry.venue.name,
    spendIntent: inquiry.spendIntentLabel,
    partySize: inquiry.partySize,
    requestedFor: inquiry.requestedDateLabel,
    lastMessage: inquiry.messages[0]?.content ?? "New inquiry received.",
    nextAction: inquiry.nextAction,
    aiConfidence: inquiry.aiConfidence,
  };
}

function buildKpis(inquiries: InboxInquiry[], offers: OfferCard[]): DashboardData["kpis"] {
  const confirmedCount = inquiries.filter((item) => item.status === "Confirmed").length;
  const humanCount = inquiries.filter((item) => item.status === "Needs Human").length;
  const avgConfidence =
    inquiries.length === 0
      ? 0
      : Math.round(
          (inquiries.reduce((total, item) => total + item.aiConfidence, 0) / inquiries.length) * 100,
        );

  return [
    {
      label: "Inbound inquiries",
      value: String(inquiries.length),
      change: `${humanCount} flagged for live takeover`,
    },
    {
      label: "AI confidence",
      value: `${avgConfidence}%`,
      change: "Measured on active conversion threads",
    },
    {
      label: "Confirmed bookings",
      value: String(confirmedCount),
      change: "Reservations already closed in the pipeline",
    },
    {
      label: "Active offers",
      value: String(offers.length),
      change: "Inventory options available to quote instantly",
    },
  ];
}

export async function getDashboardData(): Promise<DashboardData> {
  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
  if (!hasDatabaseUrl) {
    return mockDashboardData;
  }

  try {
    const repository = prisma as unknown as DashboardRepository;
    const [tables, inquiries] = await Promise.all([
      repository.tableOption.findMany({
        where: { active: true },
        orderBy: [{ minSpendCents: "desc" }],
        take: 3,
      }),
      repository.inquiry.findMany({
        orderBy: [{ requestedAt: "desc" }],
        take: 8,
        include: {
          venue: true,
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      }),
    ]);

    const mappedOffers = tables.map(buildOffer);
    const mappedInquiries = inquiries.map(buildInquiry);

    return {
      kpis: buildKpis(mappedInquiries, mappedOffers),
      inquiries: mappedInquiries,
      tableOptions: mappedOffers,
      aiFlow: mockDashboardData.aiFlow,
      conversationMoments: mockDashboardData.conversationMoments,
      source: "database",
    };
  } catch {
    return mockDashboardData;
  }
}

export function recommendTablesForBudget(
  tables: Array<{ minSpendCents: number; capacityMax: number; description: string; quantity: number; name: string }>,
  partySize: number,
  minBudgetCents?: number | null,
  maxBudgetCents?: number | null,
): OfferCard[] {
  return tables
    .filter((table) => table.capacityMax >= partySize)
    .filter((table) => {
      if (!maxBudgetCents) {
        return true;
      }

      return table.minSpendCents <= maxBudgetCents * 1.15;
    })
    .sort((left, right) => left.minSpendCents - right.minSpendCents)
    .slice(0, 3)
    .map((table) => ({
      name: table.name,
      minSpend: `${formatCurrencyRange(table.minSpendCents, maxBudgetCents)} target`,
      capacity: `Up to ${table.capacityMax} guests`,
      positioning: `${table.quantity} available · ${table.description}`,
    }));
}
