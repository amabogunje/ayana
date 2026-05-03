export type KpiCard = {
  label: string;
  value: string;
  change: string;
};

export type InboxInquiry = {
  id: string;
  guestName: string;
  channel: string;
  status: string;
  venue: string;
  spendIntent: string;
  partySize: number;
  requestedFor: string;
  lastMessage: string;
  nextAction: string;
  aiConfidence: number;
};

export type OfferCard = {
  name: string;
  minSpend: string;
  capacity: string;
  positioning: string;
};

export type TimelineStep = {
  title: string;
  body: string;
};

export type ConversationMoment = {
  speaker: string;
  content: string;
};

export type DashboardData = {
  kpis: KpiCard[];
  inquiries: InboxInquiry[];
  tableOptions: OfferCard[];
  aiFlow: TimelineStep[];
  conversationMoments: ConversationMoment[];
  source: "mock" | "database";
};
