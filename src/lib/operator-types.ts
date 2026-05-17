export type VenueRole = "VENUE_OWNER" | "VENUE_MANAGER" | "VENUE_AGENT";

export type OperatorPermission =
  | "inbox:read"
  | "inbox:write"
  | "reservations:read"
  | "reservations:write"
  | "inventory:read"
  | "inventory:write"
  | "settings:read"
  | "settings:write"
  | "alerts:read"
  | "activity:read"
  | "team:manage"
  | "ai:control";

export type OperatorUser = {
  id: string;
  venueId: string;
  email: string;
  fullName: string;
  role: VenueRole;
  isActive: boolean;
  venue: {
    id: string;
    slug: string;
    name: string;
    timezone: string;
    status: string;
  };
};

export type OperatorInboxItem = {
  id: string;
  guestName: string;
  channel: string;
  status: string;
  requestedDateLabel: string;
  partySize: number;
  spendIntentLabel: string;
  nextAction: string;
  aiConfidence: number;
  isHumanTakeover: boolean;
  updatedAt: string;
  assignedTo?: string;
  lastMessage: string;
  reservationStatus?: string;
};

export type OperatorInquiryDetail = {
  id: string;
  guestName: string;
  phone?: string | null;
  instagramHandle?: string | null;
  channel: string;
  status: string;
  requestedDateLabel: string;
  partySize: number;
  spendIntentLabel: string;
  spendIntentMinCents?: number | null;
  spendIntentMaxCents?: number | null;
  occasion?: string | null;
  aiConfidence: number;
  nextAction: string;
  isHumanTakeover: boolean;
  assignedVenueUserId?: string | null;
  assignedTo?: string;
  messages: Array<{
    id: string;
    authorRole: string;
    content: string;
    createdAt: string;
  }>;
  aiSummary?: {
    capturedFields: Array<{ label: string; value: string }>;
    latestAiMessage?: string;
    draftQuoteCount: number;
    needsHumanReason?: string;
  };
  quoteOptions: Array<{
    id: string;
    label: string;
    pitch: string;
    sentAt?: string | null;
    tableOption: {
      id: string;
      name: string;
      code: string;
      minSpendCents: number;
      depositAmountCents: number;
      capacityMin: number;
      capacityMax: number;
    };
  }>;
  reservation?: {
    id: string;
    status: string;
    depositAmountCents: number;
    depositPaidCents: number;
    confirmationCode: string;
    arrivalTimeLabel: string;
    notes?: string | null;
    tableOption: {
      id: string;
      name: string;
      code: string;
    };
  } | null;
};

export type OperatorReservationItem = {
  id: string;
  inquiryId: string;
  guestName: string;
  sourceName: string;
  status: string;
  arrivalTimeLabel: string;
  depositAmountCents: number;
  depositPaidCents: number;
  confirmationCode: string;
  tableOptionName: string;
  requestedDateLabel: string;
};

export type OperatorTableOption = {
  id: string;
  name: string;
  code: string;
  minSpendCents: number;
  depositAmountCents: number;
  capacityMin: number;
  capacityMax: number;
  quantity: number;
  description: string;
};

export type OperatorVenueUserOption = {
  id: string;
  fullName: string;
  email: string;
  role: VenueRole;
  inviteAcceptedAt?: string | null;
};

export type OperatorVenueSettings = {
  id: string;
  slug: string;
  name: string;
  addressLine1?: string | null;
  city: string;
  state?: string | null;
  postalCode?: string | null;
  phoneNumber?: string | null;
  timezone: string;
  channelsSummary: string;
  hoursSummary?: string | null;
  primaryOperatorName?: string | null;
  primaryOperatorRole?: string | null;
  primaryOperatorEmail?: string | null;
  brandTone: string;
  depositPolicy: string;
  servesFood: boolean;
  servesHookah: boolean;
  hasParking: boolean;
  hasValet: boolean;
  dressCodeSummary?: string | null;
  agePolicySummary?: string | null;
  aiEnabled: boolean;
  status: string;
  responseSlaSeconds: number;
  websiteChatEnabled: boolean;
  websiteChatWidgetKey?: string | null;
  websiteChatAllowedOrigins?: string | null;
  websiteChatWelcomeMessage?: string | null;
  websiteChatPromptPlaceholder?: string | null;
  websiteChatInstallSnippet?: string | null;
  depositCheckoutMode: "MOCK" | "STRIPE_CONNECT";
  stripeConnectAccountId?: string | null;
  stripeOnboardingComplete: boolean;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  staffUsers: OperatorVenueUserOption[];
  assets: OperatorVenueAsset[];
};

export type OperatorVenueAgentSettings = {
  venue: {
    id: string;
    name: string;
    brandTone: string;
    aiEnabled: boolean;
    websiteChatEnabled: boolean;
    websiteChatWidgetKey?: string | null;
  };
  config: {
    id?: string;
    source?: string;
    enabled: boolean;
    agentName: string;
    brandVoice: string;
    autonomyLevel: 0 | 1 | 2 | 3 | 4 | 5;
    confidenceThreshold: number;
    enabledChannels: string[];
    actionPermissions: {
      canAnswerFaqs: boolean;
      canQualifyLeads: boolean;
      canRecommendPackages: boolean;
      canCreateQuotes: boolean;
      canSendDepositLinks: boolean;
      canCreateReservations: boolean;
    };
    escalationRules: {
      escalateOnLowConfidence: boolean;
      lowConfidenceThreshold: number;
      escalateForVipRequests: boolean;
      escalateForUnavailableInventory: boolean;
      escalateForOversizedParty: boolean;
      partySizeThreshold?: number | null;
    };
    followUpRules: {
      enabled: boolean;
      unpaidDepositReminderHours?: number | null;
      abandonedChatReminderHours?: number | null;
    };
    advancedInstructions?: string | null;
  };
};

export type OperatorVenueAsset = {
  id: string;
  type: "BOTTLE_MENU" | "FOOD_MENU" | "HOOKAH_MENU" | "EVENT_FLYER";
  label: string;
  publicUrl: string;
  fileName: string;
  mimeType: string;
  eventSeriesId?: string | null;
  eventOverrideId?: string | null;
  createdAt: string;
};

export type OperatorEventSeries = {
  id: string;
  title: string;
  description?: string | null;
  recurringDays: string[];
  startDate?: string | null;
  endDate?: string | null;
  active: boolean;
  flyer?: OperatorVenueAsset | null;
  upcomingOverrideCount: number;
};

export type OperatorEventOverride = {
  id: string;
  eventSeriesId?: string | null;
  eventSeriesTitle?: string | null;
  occurrenceDate: string;
  title?: string | null;
  description?: string | null;
  isCancelled: boolean;
  active: boolean;
  flyer?: OperatorVenueAsset | null;
};

export type OperatorAlertItem = {
  id: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  createdAt: string;
  inquiryId?: string;
};

export type OperatorActivityItem = {
  id: string;
  action: string;
  summary: string;
  createdAt: string;
  actorName: string;
  actorType: "platform" | "venue" | "system";
};

export type OperatorWorkflowTaskItem = {
  id: string;
  type: string;
  status: string;
  scheduledFor: string;
  createdAt: string;
  attempts: number;
  lastError?: string | null;
  inquiryId?: string;
  guestName?: string;
  description: string;
};

export type OperatorOverviewMetric = {
  label: string;
  value: string;
  detail: string;
  tone: "purple" | "blue" | "green" | "amber" | "cyan";
};

export type OperatorOverviewReservation = {
  id: string;
  inquiryId: string;
  timeLabel: string;
  guestName: string;
  tableLabel: string;
  partySizeLabel: string;
  depositLabel: string;
  depositStatusLabel: string;
  depositStatusTone: "success" | "warning" | "neutral";
};

export type OperatorOverviewEvent = {
  id: string;
  title: string;
  dateLabel: string;
  timeLabel: string;
  statusLabel: string;
  flyerUrl?: string | null;
};

export type OperatorOverviewDepositPoint = {
  label: string;
  valueCents: number;
};

export type OperatorOverviewData = {
  metrics: OperatorOverviewMetric[];
  reservationsTonight: OperatorOverviewReservation[];
  depositOverview: {
    totalCollectedCents: number;
    periodLabel: string;
    points: OperatorOverviewDepositPoint[];
  };
  inboxPreview: OperatorInboxItem[];
  upcomingEvents: OperatorOverviewEvent[];
  alerts: OperatorAlertItem[];
  quickActions: Array<{
    label: string;
    href: string;
    tone: "purple" | "blue" | "green" | "amber" | "cyan";
  }>;
};
