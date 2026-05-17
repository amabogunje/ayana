import { getPlatformConfig, getResolvedOpenAIApiKey } from "@/lib/platform-config";
import { prisma } from "@/lib/prisma";
import { formatVenueKnowledgeForAi } from "@/lib/venue-knowledge-service";
import {
  findRecommendedTableOptionForAgent,
  getEligibleTableOptionsForAgent,
  getKnownTableOptionFields,
  getMinimumTableSpendCentsForAgent,
  getStartingTableOptionForAgent,
  hasEnoughTableQualification,
} from "@/lib/agent-tools/table-options-tool";
import { searchVenueKnowledgeForAgent } from "@/lib/agent-tools/venue-knowledge-tool";
import { createDraftQuoteIfReadyForAgent } from "@/lib/agent-tools/quote-tool";
import { createReservationDepositIfReadyForAgent } from "@/lib/agent-tools/reservation-tool";
import { scheduleUnpaidDepositReminderForAgent } from "@/lib/agent-tools/follow-up-tool";
import { formatHumanHandoffNextAction } from "@/lib/agent-tools/handoff-tool";
import {
  logWebsiteChatAgentDiagnostic,
  logWebsiteChatAgentOutcome,
} from "@/lib/agent-tools/activity-log-tool";
import {
  completeAgentRunSafely,
  recordAgentToolCallSafely,
  startAgentRunSafely,
} from "@/lib/agent/agent-observability";
import { getVenueAgentConfigForVenue } from "@/lib/venue-agent/venue-agent-config-service";
import type { VenueAgentConfig } from "@/lib/venue-agent/venue-agent-types";
import {
  evaluateAgentActionPolicy,
  evaluateConversationSafetyPolicy,
  evaluatePackagePolicy,
  evaluateToolPolicy,
  type AgentPolicyDecision,
} from "@/lib/agent/agent-policies";
import {
  deriveConversationStateAfterAgentTurn,
  normalizeConversationState,
  type PersistedInquiryStatus,
} from "@/lib/conversation/conversation-state";
import type { InquiryMessage } from "@prisma/client";

type AgentContext = {
  inquiryId: string;
  guestMessageId?: string;
  agentRunId?: string | null;
};

type WebsiteChatAgentCompletion = {
  status: "COMPLETED" | "FAILED" | "SKIPPED";
  intent?: string | null;
  objective?: string | null;
  conversationMode?: string | null;
  confidence?: number | null;
  finalAction?: string | null;
  resultSummary?: string | null;
  errorMessage?: string | null;
};

type WebsiteChatAgentRuntimeResult = {
  replyMessage: InquiryMessage | null;
  completion: WebsiteChatAgentCompletion;
};

type AgentStructuredReply = {
  intent: string;
  objective: string;
  conversationMode?: string;
  answeredLatestQuestion?: boolean;
  shouldCloseNow?: boolean;
  shouldHandoff?: boolean;
  reply: string;
  aiConfidence: number;
  nextAction: string;
  isHumanTakeover: boolean;
  handoffReason: string | null;
  recommendation: {
    tableOptionName: string | null;
    quoteLabel: string | null;
    quotePitch: string | null;
    readyForQuote: boolean;
  };
  extracted: {
    requestedDateLabel?: string | null;
    partySize?: number | null;
    spendIntentLabel?: string | null;
    occasion?: string | null;
    phone?: string | null;
  };
};

type InquiryContext = {
  id: string;
  guestName: string;
  phone: string | null;
  requestedDateLabel: string;
  partySize: number;
  spendIntentLabel: string;
  occasion: string | null;
  agentConfig: VenueAgentConfig;
  messages: Array<{
    authorRole: string;
    content: string;
  }>;
  venue: {
    id: string;
    name: string;
    timezone: string;
    addressLine1: string | null;
    city: string;
    state: string | null;
    phoneNumber: string | null;
    brandTone: string;
    depositPolicy: string;
    hoursSummary: string | null;
    servesFood: boolean;
    servesHookah: boolean;
    hasParking: boolean;
    hasValet: boolean;
    dressCodeSummary: string | null;
    agePolicySummary: string | null;
    bottleMenuUrl: string | null;
    foodMenuUrl: string | null;
    hookahMenuUrl: string | null;
    depositCheckoutMode: "MOCK" | "STRIPE_CONNECT";
    stripeConnectAccountId: string | null;
    stripeChargesEnabled: boolean;
    stripePayoutsEnabled: boolean;
    resolvedEvents: Array<{
      title: string;
      description: string | null;
      occurrenceDate: string;
      flyerUrl: string | null;
    }>;
    tableOptions: Array<{
      id: string;
      name: string;
      capacityMin: number;
      capacityMax: number;
      minSpendCents: number;
      depositAmountCents: number;
      description: string;
    }>;
  };
};

type ConversationMode =
  | "greeting"
  | "qualification"
  | "venue_info"
  | "table_recommendation"
  | "objection"
  | "close"
  | "handoff";

type GuestReadiness = "curious" | "qualified" | "hesitating" | "ready_to_book";

type ConversationMemory = {
  lastAiMessage: string;
  lastAiTableOptionName: string | null;
  hasAskedDate: boolean;
  hasAskedPartySize: boolean;
  hasAskedPhone: boolean;
  hasMentionedDeposit: boolean;
  guestDeclinedCelebration: boolean;
  guestDeclinedPreferredArea: boolean;
  guestAskedToCheckWithFriends: boolean;
};

const weekdayDateLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
const weekdayIndexLookup = weekdayDateLabels.reduce<Record<string, number>>((accumulator, label, index) => {
  accumulator[label.toLowerCase()] = index;
  accumulator[label.slice(0, 3).toLowerCase()] = index;
  return accumulator;
}, {});

type ClosedNightInfo = {
  requestedDateLabel: string;
  requestedWeekday: string;
  nextOpenWeekday: string | null;
};

function getWebsiteChatOpenAiModel() {
  return process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
}

function getLastGuestMessage(context: InquiryContext) {
  return [...context.messages].reverse().find((message) => message.authorRole === "guest")?.content ?? "";
}

function getLastAiMessage(context: InquiryContext) {
  return [...context.messages].reverse().find((message) => message.authorRole === "ai")?.content ?? "";
}

function getGuestFirstName(context: InquiryContext) {
  return context.guestName.split(" ")[0] || "there";
}

function countGuestMessages(context: InquiryContext) {
  return context.messages.filter((message) => message.authorRole === "guest").length;
}

function normalizeMessageForComparison(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function pickVariant<T>(context: InquiryContext, options: T[]) {
  if (options.length === 0) {
    throw new Error("pickVariant requires at least one option.");
  }

  return options[(countGuestMessages(context) - 1 + options.length) % options.length];
}

function detectConversationMode(context: InquiryContext): ConversationMode {
  const lastGuestMessage = getLastGuestMessage(context);

  if (isGreetingOnly(lastGuestMessage)) {
    return "greeting";
  }

  if (isVenueKnowledgeQuestion(lastGuestMessage)) {
    return "venue_info";
  }

  if (isObjectionMessage(lastGuestMessage)) {
    return "objection";
  }

  const provisional: AgentStructuredReply = {
    intent: "qualification",
    objective: "qualify_lead",
    conversationMode: "qualification",
    answeredLatestQuestion: false,
    shouldCloseNow: false,
    shouldHandoff: false,
    reply: "",
    aiConfidence: 0,
    nextAction: "",
    isHumanTakeover: false,
    handoffReason: null,
    recommendation: {
      tableOptionName: null,
      quoteLabel: null,
      quotePitch: null,
      readyForQuote: false,
    },
    extracted: {},
  };
  const bestOption = findRecommendedTableOption(provisional, context);

  if (bestOption && context.phone) {
    return "close";
  }

  if (bestOption) {
    return "table_recommendation";
  }

  return "qualification";
}

function formatQuestionList(items: string[]) {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function isEventQuestion(message: string) {
  return /\bevent\b|\bwhat'?s happening\b|\bwhat'?s going on\b|\bany events\b|\bwho'?s performing\b|\bwho'?s djing\b/.test(
    message.toLowerCase(),
  );
}

function isGreetingOnly(message: string) {
  const normalized = message.trim().toLowerCase();
  return /^(hi|hello|hey|yo|sup|what'?s up|good evening|good afternoon|good morning)(\s+[a-z]+)?[!.?]*$/.test(
    normalized,
  );
}

function isObjectionMessage(message: string) {
  return /\btoo expensive\b|\btoo much\b|\banything cheaper\b|\bcheaper\b|\bcan you do better\b|\bcan you do a deal\b|\bdeal\b|\bdiscount\b|\bneed to ask\b|\blet me ask\b|\bthink about it\b|\bask my friends\b|\bcheck with my friends\b|\bask my group\b|\bcheck with my group\b/.test(
    message.toLowerCase(),
  );
}

function isHesitationMessage(message: string) {
  return /\bask my friends\b|\bcheck with my friends\b|\bask my group\b|\bcheck with my group\b|\bthink about it\b|\bcome back\b|\bget back to you\b/.test(
    message.toLowerCase(),
  );
}

function isReadyToBookMessage(message: string) {
  return /\byes\b|\bthat works\b|\blet'?s do it\b|\bsend (?:me )?the link\b|\bi'?ll take it\b|\bbook it\b|\block it in\b|\bhold it\b/.test(
    message.toLowerCase(),
  );
}

function isPackageValueQuestion(message: string) {
  return /\bwhat do i get\b|\bwhat comes with\b|\bwhat is included\b|\bwhat does that include\b/.test(
    message.toLowerCase(),
  );
}

function isComparisonQuestion(message: string) {
  return /\bwhat'?s the difference\b|\bdifference between\b|\bcompare\b|\bnext step up\b|\bmore space\b/.test(
    message.toLowerCase(),
  );
}

function isPostPaymentQuestion(message: string) {
  return /\bwhat happens after i pay\b|\bafter i pay\b|\bafter payment\b|\bafter i send the deposit\b|\bwhat happens next\b/.test(
    message.toLowerCase(),
  );
}

function isAmbiguousPartySizeMessage(message: string) {
  return /\bmaybe\s+\d{1,2}\s+(?:or|-)\s*\d{1,2}\b|\b\d{1,2}\s+or\s+\d{1,2}\b/.test(message.toLowerCase());
}

function extractRequestedDateLabel(message: string) {
  const lower = message.toLowerCase();

  if (lower.includes("tomorrow")) return "Tomorrow";
  if (lower.includes("tonight") || lower.includes("today")) return "Tonight";

  const weekdayMatch = lower.match(
    /\b(this|next)?\s*(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat)\b/,
  );
  if (weekdayMatch) {
    const rawDay = weekdayMatch[2] ?? "";
    const normalizedDay = weekdayDateLabels.find((label) => label.toLowerCase().startsWith(rawDay.slice(0, 3)));
    if (normalizedDay) {
      return weekdayMatch[1] === "next" ? `Next ${normalizedDay}` : normalizedDay;
    }
  }

  const isoLikeDateMatch = message.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (isoLikeDateMatch) {
    return isoLikeDateMatch[1] ?? null;
  }

  const slashDateMatch = message.match(/\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/);
  if (slashDateMatch) {
    return slashDateMatch[1] ?? null;
  }

  return null;
}

function getRequestedDateLabelForReply(context: InquiryContext) {
  return context.requestedDateLabel !== "Not provided yet" ? context.requestedDateLabel : "that date";
}

function getDatePartsInTimezone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const parts = formatter.formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    weekday: values.weekday ?? weekdayDateLabels[date.getUTCDay()] ?? "Sunday",
    year: Number.parseInt(values.year ?? `${date.getUTCFullYear()}`, 10),
    month: Number.parseInt(values.month ?? `${date.getUTCMonth() + 1}`, 10),
    day: Number.parseInt(values.day ?? `${date.getUTCDate()}`, 10),
  };
}

function addDaysInTimezone(date: Date, timeZone: string, days: number) {
  const parts = getDatePartsInTimezone(date, timeZone);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12, 0, 0));
}

function parseOpenWeekdays(hoursSummary: string | null) {
  if (!hoursSummary) return [];

  const seen = new Set<number>();
  const weekdays: string[] = [];

  for (const segment of hoursSummary.split("|")) {
    const match = segment.trim().match(/\b(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat)\b/i);
    if (!match) {
      continue;
    }

    const index = weekdayIndexLookup[(match[1] ?? "").toLowerCase()];
    if (index === undefined || seen.has(index)) {
      continue;
    }

    seen.add(index);
    weekdays.push(weekdayDateLabels[index]);
  }

  return weekdays;
}

function resolveWeekdayFromRequestedDateLabel(requestedDateLabel: string, timeZone: string) {
  const trimmed = requestedDateLabel.trim();
  const lower = trimmed.toLowerCase();

  if (lower === "tonight" || lower === "today") {
    return getDatePartsInTimezone(new Date(), timeZone).weekday;
  }

  if (lower === "tomorrow") {
    return getDatePartsInTimezone(addDaysInTimezone(new Date(), timeZone, 1), timeZone).weekday;
  }

  if (lower.startsWith("next ")) {
    const candidate = trimmed.slice(5).trim().toLowerCase();
    const index = weekdayIndexLookup[candidate];
    return index === undefined ? null : weekdayDateLabels[index];
  }

  const weekdayIndex = weekdayIndexLookup[lower];
  if (weekdayIndex !== undefined) {
    return weekdayDateLabels[weekdayIndex];
  }

  const isoLike = trimmed.match(/^20\d{2}-\d{2}-\d{2}$/);
  if (isoLike) {
    const date = new Date(`${trimmed}T12:00:00.000Z`);
    return Number.isNaN(date.getTime()) ? null : getDatePartsInTimezone(date, timeZone).weekday;
  }

  const slashDate = trimmed.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (slashDate) {
    const month = Number.parseInt(slashDate[1] ?? "1", 10);
    const day = Number.parseInt(slashDate[2] ?? "1", 10);
    const rawYear = slashDate[3];
    const currentYear = getDatePartsInTimezone(new Date(), timeZone).year;
    const year = rawYear ? Number.parseInt(rawYear.length === 2 ? `20${rawYear}` : rawYear, 10) : currentYear;
    const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    return Number.isNaN(date.getTime()) ? null : getDatePartsInTimezone(date, timeZone).weekday;
  }

  return null;
}

function getNextOpenWeekday(requestedWeekday: string, openWeekdays: string[]) {
  if (openWeekdays.length === 0) return null;

  const requestedIndex = weekdayIndexLookup[requestedWeekday.toLowerCase()];
  if (requestedIndex === undefined) {
    return openWeekdays[0] ?? null;
  }

  const openIndexes = openWeekdays
    .map((weekday) => weekdayIndexLookup[weekday.toLowerCase()])
    .filter((value): value is number => value !== undefined)
    .sort((left, right) => left - right);

  const nextIndex = openIndexes.find((index) => index > requestedIndex) ?? openIndexes[0];
  return weekdayDateLabels[nextIndex] ?? null;
}

function getClosedNightInfo(result: AgentStructuredReply, context: InquiryContext): ClosedNightInfo | null {
  const known = knownFields(result, context);
  const requestedDateLabel = extractRequestedDateLabel(getLastGuestMessage(context)) ?? known.requestedDateLabel;
  if (!requestedDateLabel) return null;

  const openWeekdays = parseOpenWeekdays(context.venue.hoursSummary);
  if (openWeekdays.length === 0) return null;

  const requestedWeekday = resolveWeekdayFromRequestedDateLabel(requestedDateLabel, context.venue.timezone);
  if (!requestedWeekday) return null;
  if (openWeekdays.includes(requestedWeekday)) return null;

  return {
    requestedDateLabel,
    requestedWeekday,
    nextOpenWeekday: getNextOpenWeekday(requestedWeekday, openWeekdays),
  };
}

function makeClosedNightReply(context: InquiryContext, closedNight: ClosedNightInfo) {
  const nextOpenLine = closedNight.nextOpenWeekday
    ? ` The next open night is ${closedNight.nextOpenWeekday}.`
    : "";

  return pickVariant(context, [
    `We’re closed on ${closedNight.requestedWeekday} nights at ${context.venue.name}, so I can’t hold a table for ${closedNight.requestedDateLabel}.${nextOpenLine}`,
    `${context.venue.name} is closed on ${closedNight.requestedWeekday}, so I can’t book ${closedNight.requestedDateLabel}.${nextOpenLine}`,
    `We’re not open on ${closedNight.requestedWeekday} nights, so ${closedNight.requestedDateLabel} isn’t bookable.${nextOpenLine}`,
  ]);
}

function isVenueKnowledgeQuestion(message: string) {
  const lower = message.toLowerCase();
  return (
    /\bbottle\b|\bbottles\b|\bdrink menu\b|\bmenu prices\b/.test(lower) ||
    /\bfood\b|\bmenu\b|\beat\b/.test(lower) ||
    /\bhookah\b/.test(lower) ||
    /\bparking\b|\bvalet\b|\bpark\b/.test(lower) ||
    /\bdress code\b|\bdresscode\b|\bwhat can i wear\b|\bwear\b|\bdress\b/.test(lower) ||
    /\bhow old\b|\bage\b|\b21\+|\b18\+|\bid\b/.test(lower) ||
    /\bhours\b|\bopen\b|\bclose\b|\bwhat time\b/.test(lower) ||
    /\baddress\b|\blocated\b|\bwhere are you\b|\blocation\b/.test(lower) ||
    /\bphone\b|\bcall\b|\bnumber\b/.test(lower) ||
    isEventQuestion(lower)
  );
}

function hasBookingIntentSignals(message: string) {
  const extracted = extractStructuredSignals(message);
  return Boolean(
    extracted.requestedDateLabel ||
      extracted.partySize ||
      extracted.phone ||
      isReadyToBookMessage(message) ||
      /\bdeposit\b|\bbook\b|\breserv(?:e|ation)\b|\btable\b|\bbooth\b|\bguests?\b|\bpeople\b/.test(
        message.toLowerCase(),
      ),
  );
}

function isVenueKnowledgeOnlyQuestion(message: string) {
  return isVenueKnowledgeQuestion(message) && !hasBookingIntentSignals(message);
}

function shouldPreserveVenueKnowledgeReplyForClosedNight(
  message: string,
  result: AgentStructuredReply,
  context: InquiryContext,
) {
  if (!isVenueKnowledgeOnlyQuestion(message)) return false;

  const known = knownFields(result, context);
  return !known.partySize && !getCurrentPhone(result, context);
}

function extractStructuredSignals(message: string): AgentStructuredReply["extracted"] {
  const lower = message.toLowerCase();
  const extracted: AgentStructuredReply["extracted"] = {};

  const digitsOnly = message.replace(/\D/g, "");
  if (digitsOnly.length >= 10 && digitsOnly.length <= 11) {
    extracted.phone = digitsOnly;
  }

  const explicitPartyMatch = lower.match(/\b(\d{1,2})\s*(people|person|guests|guest|girls|guys)\b/);
  if (explicitPartyMatch) {
    extracted.partySize = Number.parseInt(explicitPartyMatch[1] ?? "", 10);
  } else if (/^\s*\d{1,2}\s*$/.test(message.trim())) {
    extracted.partySize = Number.parseInt(message.trim(), 10);
  } else {
    const correctedPartyMatch = lower.match(/\b(?:we'?re|we are|make that|actually|it'?s|its|let'?s say)\s+(\d{1,2})\b/);
    if (correctedPartyMatch) {
      extracted.partySize = Number.parseInt(correctedPartyMatch[1] ?? "", 10);
    }
  }

  if (lower.includes("birthday")) {
    extracted.occasion = "Birthday";
  } else if (lower.includes("bachelor")) {
    extracted.occasion = "Bachelor party";
  } else if (lower.includes("bachelorette")) {
    extracted.occasion = "Bachelorette party";
  }

  const requestedDateLabel = extractRequestedDateLabel(message);
  if (requestedDateLabel) {
    extracted.requestedDateLabel = requestedDateLabel;
  }

  return extracted;
}

function mergeExtractedFields(
  primary: AgentStructuredReply["extracted"] | undefined,
  secondary: AgentStructuredReply["extracted"],
): AgentStructuredReply["extracted"] {
  return {
    requestedDateLabel: primary?.requestedDateLabel ?? secondary.requestedDateLabel ?? null,
    partySize: primary?.partySize ?? secondary.partySize ?? null,
    spendIntentLabel: primary?.spendIntentLabel ?? secondary.spendIntentLabel ?? null,
    occasion: primary?.occasion ?? secondary.occasion ?? null,
    phone: primary?.phone ?? secondary.phone ?? null,
  };
}

function getConversationMemory(context: InquiryContext): ConversationMemory {
  const lastAiMessage = getLastAiMessage(context);
  const transcript = context.messages.map((message) => message.content.toLowerCase()).join("\n");
  const loweredLastAi = lastAiMessage.toLowerCase();
  const lastAiTableOptionName =
    context.venue.tableOptions.find((option) => loweredLastAi.includes(option.name.toLowerCase()))?.name ?? null;

  return {
    lastAiMessage,
    lastAiTableOptionName,
    hasAskedDate: /\bwhat night\b|\bwhich night\b|\bwhat date\b/.test(transcript),
    hasAskedPartySize: /\bhow many guests\b|\bhow many people\b|\bgroup size\b|\bparty size\b/.test(transcript),
    hasAskedPhone: /\bphone number\b|\bbest phone number\b|\bsend the deposit link\b/.test(transcript),
    hasMentionedDeposit: /\bdeposit\b/.test(transcript),
    guestDeclinedCelebration: /\bno celebrations?\b|\bnot celebrating\b/.test(transcript),
    guestDeclinedPreferredArea: /\bno preferred\b|\bno preference\b|\bany area is fine\b/.test(transcript),
    guestAskedToCheckWithFriends: /\bask my friends\b|\bcheck with my friends\b|\bask my group\b|\bcheck with my group\b/.test(
      transcript,
    ),
  };
}

function detectGuestReadiness(context: InquiryContext, result: AgentStructuredReply): GuestReadiness {
  const lastGuestMessage = getLastGuestMessage(context);
  const known = knownFields(result, context);
  const phone = getCurrentPhone(result, context);

  if (isHesitationMessage(lastGuestMessage)) {
    return "hesitating";
  }

  if (phone || isReadyToBookMessage(lastGuestMessage)) {
    return "ready_to_book";
  }

  if (known.requestedDateLabel && known.partySize) {
    return "qualified";
  }

  return "curious";
}

function makeInfoReply(input: {
  intent?: string;
  objective?: string;
  conversationMode?: ConversationMode;
  answeredLatestQuestion?: boolean;
  shouldCloseNow?: boolean;
  shouldHandoff?: boolean;
  reply: string;
  nextAction: string;
  confidence?: number;
}): AgentStructuredReply {
  return {
    intent: input.intent ?? "venue_info",
    objective: input.objective ?? "answer_guest_question",
    conversationMode: input.conversationMode ?? "venue_info",
    answeredLatestQuestion: input.answeredLatestQuestion ?? true,
    shouldCloseNow: input.shouldCloseNow ?? false,
    shouldHandoff: input.shouldHandoff ?? false,
    reply: input.reply,
    aiConfidence: input.confidence ?? 0.86,
    nextAction: input.nextAction,
    isHumanTakeover: false,
    handoffReason: null,
    recommendation: {
      tableOptionName: null,
      quoteLabel: null,
      quotePitch: null,
      readyForQuote: false,
    },
    extracted: {},
  };
}

function makeAcknowledgement(context: InquiryContext, mode: ConversationMode) {
  const firstName = getGuestFirstName(context);

  switch (mode) {
    case "venue_info":
      return pickVariant(context, [
        `Absolutely, ${firstName}.`,
        `Of course.`,
        `Yep, happy to help with that.`,
      ]);
    case "table_recommendation":
      return pickVariant(context, [
        "Perfect.",
        "That helps.",
        `Great, ${firstName}.`,
      ]);
    case "close":
      return pickVariant(context, [
        "Perfect.",
        "Great, that gives me enough to move this forward.",
        "Nice, we have what we need to lock this in.",
      ]);
    case "qualification":
    default:
      return pickVariant(context, [
        "Got it.",
        "Sounds good.",
        `Absolutely, ${firstName}.`,
      ]);
  }
}

function getDeterministicVenueKnowledgeReply(context: InquiryContext): AgentStructuredReply | null {
  const lastGuestMessage = getLastGuestMessage(context);
  const lower = lastGuestMessage.toLowerCase();
  const leadIn = makeAcknowledgement(context, "venue_info");

  if (/\bbottle\b|\bbottles\b|\bdrink menu\b|\bmenu prices\b/.test(lower)) {
    return makeInfoReply({
      reply: context.venue.bottleMenuUrl
        ? `${leadIn} Here is the current bottle menu for ${context.venue.name}: ${context.venue.bottleMenuUrl}`
        : `${leadIn} I do not have a bottle menu uploaded for ${context.venue.name} yet, so I can help with tables and reservations here but not quote bottle-by-bottle pricing from a menu asset.`,
      nextAction: "Answered from shared venue knowledge using the bottle menu asset.",
    });
  }

  if (/\bfood\b|\bmenu\b|\beat\b/.test(lower) && context.venue.servesFood) {
    return makeInfoReply({
      reply: context.venue.foodMenuUrl
        ? `${leadIn} ${context.venue.name} serves food. You can view the current food menu here: ${context.venue.foodMenuUrl}`
        : `${leadIn} ${context.venue.name} serves food. I do not have a food menu asset uploaded yet, but food service is enabled.`,
      nextAction: "Answered a venue knowledge question about food service.",
      confidence: 0.84,
    });
  }

  if (/\bhookah\b/.test(lower)) {
    return makeInfoReply({
      reply: context.venue.servesHookah
        ? context.venue.hookahMenuUrl
          ? `${leadIn} ${context.venue.name} offers hookah. You can view the current hookah menu here: ${context.venue.hookahMenuUrl}`
          : `${leadIn} ${context.venue.name} offers hookah. I do not have a hookah menu asset uploaded yet, but hookah is configured as available.`
        : `${leadIn} ${context.venue.name} does not currently have hookah configured as an available service.`,
      nextAction: "Answered a venue knowledge question about hookah service.",
      confidence: 0.84,
    });
  }

  if (/\bparking\b|\bvalet\b|\bpark\b/.test(lower)) {
    const reply =
      context.venue.hasParking || context.venue.hasValet
        ? `${context.venue.hasParking ? "Parking is available" : "Parking is not currently listed as available"}${context.venue.hasParking && context.venue.hasValet ? ", and valet is also available" : context.venue.hasValet ? ". Valet is available" : ""} at ${context.venue.name}.`
        : `${context.venue.name} does not currently have parking or valet configured in venue knowledge.`;
    return makeInfoReply({
      reply: `${leadIn} ${reply}`,
      nextAction: "Answered a venue knowledge question about parking or valet.",
      confidence: 0.84,
    });
  }

  if (/\bdress code\b|\bdresscode\b|\bwhat can i wear\b|\bwear\b|\bdress\b/.test(lower) && context.venue.dressCodeSummary) {
    return makeInfoReply({
      reply: `${leadIn} The dress code at ${context.venue.name} is: ${context.venue.dressCodeSummary}`,
      nextAction: "Answered a venue knowledge question about dress code.",
      confidence: 0.83,
    });
  }

  if (/\bhow old\b|\bage\b|\b21\+|\b18\+|\bid\b/.test(lower) && context.venue.agePolicySummary) {
    return makeInfoReply({
      reply: `${leadIn} The age policy at ${context.venue.name} is: ${context.venue.agePolicySummary}`,
      nextAction: "Answered a venue knowledge question about age policy.",
      confidence: 0.83,
    });
  }

  if (/\bhours\b|\bopen\b|\bclose\b|\bwhat time\b/.test(lower) && context.venue.hoursSummary) {
    return makeInfoReply({
      reply: `${leadIn} The current configured operating hours for ${context.venue.name} are: ${context.venue.hoursSummary}`,
      nextAction: "Answered a venue knowledge question about hours.",
      confidence: 0.83,
    });
  }

  if (/\baddress\b|\blocated\b|\bwhere are you\b|\blocation\b/.test(lower) && context.venue.addressLine1) {
    const location = [context.venue.addressLine1, context.venue.city, context.venue.state].filter(Boolean).join(", ");
    return makeInfoReply({
      reply: `${leadIn} ${context.venue.name} is located at ${location}.`,
      nextAction: "Answered a venue knowledge question about location.",
      confidence: 0.84,
    });
  }

  if (/\bphone\b|\bcall\b|\bnumber\b/.test(lower) && context.venue.phoneNumber) {
    return makeInfoReply({
      reply: `${leadIn} You can reach ${context.venue.name} at ${context.venue.phoneNumber}.`,
      nextAction: "Answered a venue knowledge question about contact information.",
      confidence: 0.84,
    });
  }

  if (isEventQuestion(lower)) {
    const requestedDateLabel = extractRequestedDateLabel(lastGuestMessage) ?? getRequestedDateLabelForReply(context);
    if (context.venue.resolvedEvents.length > 0) {
      const event = context.venue.resolvedEvents[0];
      return makeInfoReply({
        reply: `${leadIn} ${event.title} is the configured event for ${requestedDateLabel}${event.description ? `: ${event.description}` : "."}${event.flyerUrl ? ` You can view the flyer here: ${event.flyerUrl}` : ""}`,
        nextAction: "Answered from recurring event knowledge or date override.",
        confidence: 0.82,
      });
    }

    return makeInfoReply({
      reply: `${leadIn} I do not have a special event configured for ${requestedDateLabel} in the venue setup right now. If you want, I can still help with table options and pricing for your group.`,
      nextAction: "Answered an event question with no configured event found for the requested date.",
      confidence: 0.8,
    });
  }

  return null;
}

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function knownFields(result: AgentStructuredReply, context: InquiryContext) {
  return getKnownTableOptionFields(result, context);
}

function getCurrentPhone(result: AgentStructuredReply, context: InquiryContext) {
  return result.extracted.phone || context.phone;
}

function hasInvalidPhoneAttempt(message: string) {
  const digitsOnly = message.replace(/\D/g, "");
  const looksPhoneLike =
    /\d/.test(message) &&
    (/\bphone\b|\bnumber\b|\bcall\b/.test(message.toLowerCase()) ||
      /^[\d\s()+.-]+$/.test(message.trim()) ||
      digitsOnly.length >= 7);

  return looksPhoneLike && digitsOnly.length > 0 && (digitsOnly.length < 10 || digitsOnly.length > 11);
}

function makeInvalidPhoneReply(context: InquiryContext) {
  return pickVariant(context, [
    "I need a valid 10-digit phone number to send the deposit link.",
    "That number doesn't look complete. Send the best 10-digit phone number and I'll send the deposit link.",
    "I can send the deposit link as soon as I have a valid 10-digit phone number.",
  ]);
}

function hasEnoughQualification(result: AgentStructuredReply, context: InquiryContext) {
  return hasEnoughTableQualification(result, context);
}

function getMinimumTableSpendCents(context: InquiryContext) {
  return getMinimumTableSpendCentsForAgent(context);
}

function getStartingTableOption(context: InquiryContext) {
  return getStartingTableOptionForAgent(context);
}

function isLowestPriceQuestion(message: string) {
  return /\bcheapest\b|\blowest\b|\bminimum\b|\bstarting\b|\bentry\b|\bstart at\b|\bhow much\b/.test(
    message.toLowerCase(),
  );
}

function isAvailabilityQuestion(message: string) {
  return /\bwhat(?:'s| is)? available\b|\bavailability\b|\bdo you have\b|\bwhat can i book\b|\bwhat tables\b|\bwhat do you have\b/.test(
    message.toLowerCase(),
  );
}

function getEligibleTableOptions(result: AgentStructuredReply, context: InquiryContext) {
  return getEligibleTableOptionsForAgent(result, context);
}

function describeTableLadderLead(context: InquiryContext, result: AgentStructuredReply) {
  const known = knownFields(result, context);
  const dateLabel = known.requestedDateLabel || "that night";
  return `${known.partySize} guests on ${dateLabel}`;
}

function formatTableStartingReply(input: {
  context: InquiryContext;
  result: AgentStructuredReply;
  tableOption: InquiryContext["venue"]["tableOptions"][number];
  leadIn: string;
}) {
  const ladderLead = describeTableLadderLead(input.context, input.result);
  return `${input.leadIn} For ${ladderLead}, the starting table option is ${input.tableOption.name} at ${money(input.tableOption.minSpendCents)} minimum spend with a ${money(input.tableOption.depositAmountCents)} deposit. If that works, I can help you lock it in.`;
}

function makePackageValueReply(
  context: InquiryContext,
  result: AgentStructuredReply,
  tableOption: InquiryContext["venue"]["tableOptions"][number],
) {
  return pickVariant(context, [
    `${tableOption.name} is a fit for ${describeTableLadderLead(context, result)}. ${tableOption.description || "It's one of the main configured table options at the venue."} The minimum is ${money(tableOption.minSpendCents)} and the deposit is ${money(tableOption.depositAmountCents)}.`,
    `For ${describeTableLadderLead(context, result)}, ${tableOption.name} is the starting package. ${tableOption.description || "It’s a configured table option at the venue."} It starts at ${money(tableOption.minSpendCents)} with a ${money(tableOption.depositAmountCents)} deposit.`,
    `${tableOption.name} is the table I'd point you to for ${describeTableLadderLead(context, result)}. ${tableOption.description || "It’s part of the venue’s configured table lineup."} That package starts at ${money(tableOption.minSpendCents)} with a ${money(tableOption.depositAmountCents)} deposit.`,
  ]);
}

function makePackageComparisonReply(
  context: InquiryContext,
  result: AgentStructuredReply,
  tableOption: InquiryContext["venue"]["tableOptions"][number],
  nextOption: InquiryContext["venue"]["tableOptions"][number] | null,
) {
  if (!nextOption) {
    return `${tableOption.name} is the starting option and main configured fit for ${describeTableLadderLead(context, result)}. ${tableOption.description || "It's the table package configured for this size."} It starts at ${money(tableOption.minSpendCents)} with a ${money(tableOption.depositAmountCents)} deposit.`;
  }

  return pickVariant(context, [
    `${tableOption.name} is the starting option for ${describeTableLadderLead(context, result)} at ${money(tableOption.minSpendCents)} minimum spend. ${nextOption.name} is the next step up at ${money(nextOption.minSpendCents)}, so that’s the move if you want more space or a bigger setup.`,
    `${tableOption.name} is the floor package for ${describeTableLadderLead(context, result)}. If you want to go up from there, ${nextOption.name} is the next option and starts at ${money(nextOption.minSpendCents)}.`,
    `For ${describeTableLadderLead(context, result)}, ${tableOption.name} is the starting package. ${nextOption.name} is the step up above that, so I’d keep you on ${tableOption.name} unless you want something bigger.`,
  ]);
}

function makeHumanHandoffReply(context: InquiryContext) {
  return pickVariant(context, [
    `Of course. I'm flagging this for a venue operator now so you can continue with a real person.`,
    `Absolutely. I’ll hand this off to the venue team so a real person can take over from here.`,
    `No problem. I'm routing this to a venue operator now so you can continue with someone directly.`,
  ]);
}

function makePostPaymentReply(context: InquiryContext, result: AgentStructuredReply, tableOption: InquiryContext["venue"]["tableOptions"][number]) {
  return pickVariant(context, [
    `Once the ${money(tableOption.depositAmountCents)} deposit is paid, ${tableOption.name} is held for you and the venue team can finalize the reservation details from there.`,
    `After the deposit goes through, ${tableOption.name} is locked in for your group and the reservation moves into confirmation with the venue team.`,
    `Once you pay the deposit, the table is held under your reservation and the next step is final confirmation with the venue.`,
  ]);
}

function makeMixedVenueKnowledgeAndRecommendationReply(
  context: InquiryContext,
  result: AgentStructuredReply,
  tableOption: InquiryContext["venue"]["tableOptions"][number],
) {
  const knowledge = getDeterministicVenueKnowledgeReply(context);
  const knowledgeReply = knowledge?.reply ?? "";
  const recommendation = `For ${describeTableLadderLead(context, result)}, I'd recommend ${tableOption.name} at ${money(tableOption.minSpendCents)} minimum spend with a ${money(tableOption.depositAmountCents)} deposit.`;
  const closeLine = getDepositCloseLine(context, result);

  return [knowledgeReply, recommendation, closeLine].filter(Boolean).join(" ");
}

function makeAmbiguousPartySizeReply(context: InquiryContext) {
  return pickVariant(context, [
    "Got it. Which number should I work with so I can point you to the right table?",
    "No problem. What headcount should I lock in for now?",
    "Understood. Give me the number you want me to work from and I’ll match the table to that.",
  ]);
}

function makeDirectCloseReply(context: InquiryContext, result: AgentStructuredReply, tableOption: InquiryContext["venue"]["tableOptions"][number]) {
  const phone = getCurrentPhone(result, context);
  if (phone) {
    return `Perfect. I have your number for ${tableOption.name}, so I can send the deposit link now.`;
  }

  return `Absolutely. ${tableOption.name} is the best fit for ${describeTableLadderLead(context, result)}. Send the best phone number and I’ll send the deposit link right away.`;
}

function getDepositCloseLine(context: InquiryContext, result: AgentStructuredReply) {
  const hasQualification = hasEnoughQualification(result, context);
  const phone = getCurrentPhone(result, context);
  if (!hasQualification) {
    return "Once I have the group size, I can send over the hold steps.";
  }
  return phone
    ? "If you'd like to hold it, I can send the deposit link now."
    : "If you'd like to hold it, send the best phone number and I'll send the deposit link.";
}

function lastAiMessageMentionsTableOption(context: InquiryContext, tableOptionName: string) {
  const lastAiMessage = getLastAiMessage(context);
  return lastAiMessage.toLowerCase().includes(tableOptionName.toLowerCase());
}

function getBudgetMismatch(result: AgentStructuredReply, context: InquiryContext) {
  return null;
}

function findRecommendedTableOption(result: AgentStructuredReply, context: InquiryContext) {
  return findRecommendedTableOptionForAgent(result, context);
}

function makeObjectionReply(context: InquiryContext, result: AgentStructuredReply, tableOption: InquiryContext["venue"]["tableOptions"][number] | null) {
  const dateLabel = knownFields(result, context).requestedDateLabel || "that night";
  if (!tableOption) {
    return pickVariant(context, [
      `I can only quote from the configured table options at ${context.venue.name}. If you want, send me your group size and night again and I'll point you to the closest fit.`,
      `I only have the configured table packages to work from here. Send me your date and group size again and I'll show you the closest option.`,
      `I can only offer the current configured table packages. If you resend the night and group size, I'll point you to the nearest fit.`,
    ]);
  }

  if (isHesitationMessage(getLastGuestMessage(context))) {
    return pickVariant(context, [
      `Of course. ${tableOption.name} is still the starting option for ${dateLabel} at ${money(tableOption.minSpendCents)} minimum spend with a ${money(tableOption.depositAmountCents)} deposit. Check with your friends and message me back when you're ready.`,
      `No problem. The starting option for ${dateLabel} is still ${tableOption.name} at ${money(tableOption.minSpendCents)} minimum spend and a ${money(tableOption.depositAmountCents)} deposit. Take a look with your group and come back to me when you're ready.`,
      `Absolutely. ${tableOption.name} is still the starting package for ${dateLabel} at ${money(tableOption.minSpendCents)} minimum spend with a ${money(tableOption.depositAmountCents)} deposit. No rush, just message me back once you've checked with them.`,
    ]);
  }

  return pickVariant(context, [
    `The starting option for ${dateLabel} is still ${tableOption.name} at ${money(tableOption.minSpendCents)} minimum spend with a ${money(tableOption.depositAmountCents)} deposit. I can hold that if it works for you.`,
    `The lowest available package I can offer for ${dateLabel} is still ${tableOption.name} at ${money(tableOption.minSpendCents)} minimum spend. If that works, I can send the deposit link.`,
    `I can only offer the configured packages, and the starting one for ${dateLabel} is ${tableOption.name} at ${money(tableOption.minSpendCents)} minimum spend with a ${money(tableOption.depositAmountCents)} deposit.`,
  ]);
}

function fallbackReply(context: InquiryContext): AgentStructuredReply {
  const venueKnowledgeReply = getDeterministicVenueKnowledgeReply(context);
  if (venueKnowledgeReply) {
    return venueKnowledgeReply;
  }

  const lastGuestMessage = getLastGuestMessage(context);
  const lower = lastGuestMessage.toLowerCase();
  const extracted = extractStructuredSignals(lastGuestMessage);
  const memory = getConversationMemory(context);

  const provisional: AgentStructuredReply = {
    intent: "qualification",
    objective: "qualify_lead",
    conversationMode: "qualification",
    answeredLatestQuestion: false,
    shouldCloseNow: false,
    shouldHandoff: false,
    reply: "",
    aiConfidence: 0.6,
    nextAction: "",
    isHumanTakeover: false,
    handoffReason: null,
    recommendation: {
      tableOptionName: null,
      quoteLabel: null,
      quotePitch: null,
      readyForQuote: false,
    },
    extracted,
  };
  const known = knownFields(provisional, context);
  const missing: string[] = [];
  if (!known.requestedDateLabel) missing.push("what night you're looking for");
  if (!known.partySize) missing.push("your group size");
  const largestCapacity = Math.max(0, ...context.venue.tableOptions.map((option) => option.capacityMax));
  const mode = detectConversationMode(context);
  const needsHuman =
    lower.includes("manager") ||
    lower.includes("call me") ||
    lower.includes("vip") ||
    lower.includes("custom") ||
    lower.includes("angry") ||
    lower.includes("upset") ||
    Boolean(known.partySize && largestCapacity > 0 && known.partySize > largestCapacity);
  const bestOption = findRecommendedTableOption(provisional, context);

  if (needsHuman) {
    provisional.reply = pickVariant(context, [
      `${makeAcknowledgement(context, "qualification")} This is one I want a venue operator to handle directly so you get the right answer. I'm flagging it for the team now.`,
      `${makeAcknowledgement(context, "qualification")} I want to get a venue operator on this so we can handle it properly. I'm escalating it for you now.`,
      `${makeAcknowledgement(context, "qualification")} This calls for a quick human handoff so the team can take care of it correctly. I'm flagging it now.`,
    ]);
    provisional.aiConfidence = 0.38;
    provisional.conversationMode = "handoff";
    provisional.nextAction = "Human takeover recommended by website chat agent.";
    provisional.isHumanTakeover = true;
    provisional.shouldHandoff = true;
    provisional.handoffReason = "VIP, custom, capacity, or direct-human language detected.";
    return provisional;
  }

  if (missing.length > 0) {
    if (isGreetingOnly(lastGuestMessage)) {
      provisional.reply = pickVariant(context, [
        `Hi ${getGuestFirstName(context)}, what night are you looking for and how many guests will be in your group?`,
        `Happy to help. What night are you looking at, and for how many guests?`,
        `Hi ${getGuestFirstName(context)}. Tell me the night you want and how many guests you're booking for.`,
      ]);
      provisional.aiConfidence = 0.66;
      provisional.conversationMode = "greeting";
      provisional.nextAction = "Guest sent a greeting only; prompted for date and party size.";
      return provisional;
    }

    if (missing.length === 1 && missing[0] === "your group size") {
      const startingOption = getStartingTableOption(context);
      const minimumSpend = getMinimumTableSpendCents(context);
      provisional.reply = known.requestedDateLabel && startingOption
        ? pickVariant(context, [
            `${makeAcknowledgement(context, mode)} For ${known.requestedDateLabel}, the starting table option begins at ${money(startingOption.minSpendCents)} minimum spend with a ${money(startingOption.depositAmountCents)} deposit. How many guests should I check that for?`,
            `${makeAcknowledgement(context, mode)} I can start you at ${startingOption.name} for ${known.requestedDateLabel}, which begins at ${money(startingOption.minSpendCents)} minimum spend and a ${money(startingOption.depositAmountCents)} deposit. What's the group size?`,
            `${makeAcknowledgement(context, mode)} For ${known.requestedDateLabel}, the entry point is ${startingOption.name} at ${money(startingOption.minSpendCents)} minimum spend. How many people are you booking for?`,
          ])
        : isLowestPriceQuestion(lastGuestMessage) && minimumSpend
        ? pickVariant(context, [
            `${makeAcknowledgement(context, mode)} The lowest configured table package currently starts at ${money(minimumSpend)} minimum spend. How many guests should I check that for?`,
            `${makeAcknowledgement(context, mode)} The entry point right now is ${money(minimumSpend)} minimum spend on a table. What's the group size?`,
            `${makeAcknowledgement(context, mode)} Our starting table minimum is ${money(minimumSpend)}. How many people are you looking to book for?`,
          ])
        : pickVariant(context, [
            `${makeAcknowledgement(context, mode)} How many guests are you planning for?`,
            `${makeAcknowledgement(context, mode)} How many people will be in the group?`,
            `${makeAcknowledgement(context, mode)} What party size should I work with?`,
          ]);
    } else if (missing.length === 1 && missing[0] === "what night you're looking for") {
      const minimumSpend = getMinimumTableSpendCents(context);
      provisional.reply = isLowestPriceQuestion(lastGuestMessage) && minimumSpend
        ? pickVariant(context, [
            `${makeAcknowledgement(context, mode)} The lowest configured table package starts at ${money(minimumSpend)} minimum spend. What night should I check for you?`,
            `${makeAcknowledgement(context, mode)} We start at ${money(minimumSpend)} minimum spend on tables. What date or night do you have in mind?`,
            `${makeAcknowledgement(context, mode)} The entry point is ${money(minimumSpend)} minimum spend. Which night are you looking at?`,
          ])
        : pickVariant(context, [
            `${makeAcknowledgement(context, mode)} What night are you looking at?`,
            `${makeAcknowledgement(context, mode)} Which night should I check for you?`,
            `${makeAcknowledgement(context, mode)} What date or night do you have in mind?`,
          ]);
    } else {
      provisional.reply = pickVariant(context, [
        `${makeAcknowledgement(context, mode)} To point you to the right option, tell me ${formatQuestionList(missing.slice(0, 2))}.`,
        `${makeAcknowledgement(context, mode)} I just need ${formatQuestionList(missing.slice(0, 2))} to point you to the right table.`,
        `${makeAcknowledgement(context, mode)} Send me ${formatQuestionList(missing.slice(0, 2))} and I’ll point you in the right direction.`,
      ]);
    }
    provisional.aiConfidence = 0.62;
    provisional.nextAction = `Collect missing qualification details: ${missing.join(", ")}.`;
    return provisional;
  }

  if (isObjectionMessage(lastGuestMessage)) {
    provisional.reply = makeObjectionReply(context, provisional, bestOption);
    provisional.aiConfidence = 0.72;
    provisional.conversationMode = "objection";
    provisional.answeredLatestQuestion = true;
    provisional.nextAction = "Handled a pricing or hesitation objection within configured package constraints.";
    provisional.recommendation = bestOption
      ? {
          tableOptionName: bestOption.name,
          quoteLabel: `${known.partySize}-guest ${bestOption.name}`,
          quotePitch: `Starting option for ${known.requestedDateLabel || "requested night"} is ${bestOption.name}.`,
          readyForQuote: hasEnoughQualification(provisional, context),
        }
      : provisional.recommendation;
    return provisional;
  }

  if (bestOption) {
    const eligibleOptions = getEligibleTableOptions(provisional, context);
    const nextOption = eligibleOptions[1] ?? null;
    const cheapestQuestion = isLowestPriceQuestion(lastGuestMessage);
    const availabilityQuestion = isAvailabilityQuestion(lastGuestMessage);
    const alreadyMentionedBestOption = lastAiMessageMentionsTableOption(context, bestOption.name);
    provisional.reply = extracted.phone && alreadyMentionedBestOption
      ? pickVariant(context, [
          `${makeAcknowledgement(context, "close")} I have your number and can send the deposit link for ${bestOption.name} now.`,
          `${makeAcknowledgement(context, "close")} Perfect, I have your phone number. I'll send the deposit link for ${bestOption.name} now.`,
          `${makeAcknowledgement(context, "close")} Great, I have the number for ${bestOption.name}. I'll send the deposit link now.`,
        ])
      : alreadyMentionedBestOption
      ? pickVariant(context, [
          `${makeAcknowledgement(context, "table_recommendation")} ${bestOption.name} works for ${describeTableLadderLead(context, provisional)}. ${getDepositCloseLine(context, provisional)}`,
          `${makeAcknowledgement(context, "table_recommendation")} For ${describeTableLadderLead(context, provisional)}, ${bestOption.name} is the table I'd hold for you. ${getDepositCloseLine(context, provisional)}`,
          `${makeAcknowledgement(context, "table_recommendation")} ${bestOption.name} is the right fit for ${describeTableLadderLead(context, provisional)}. ${getDepositCloseLine(context, provisional)}`,
        ])
      : cheapestQuestion
      ? pickVariant(context, [
          formatTableStartingReply({
            context,
            result: provisional,
            tableOption: bestOption,
            leadIn: makeAcknowledgement(context, "table_recommendation"),
          }),
          `${makeAcknowledgement(context, "table_recommendation")} The floor package for ${describeTableLadderLead(context, provisional)} is ${bestOption.name} at ${money(bestOption.minSpendCents)} minimum spend with a ${money(bestOption.depositAmountCents)} deposit. ${getDepositCloseLine(context, provisional)}`,
          `${makeAcknowledgement(context, "table_recommendation")} The cheapest configured table for ${describeTableLadderLead(context, provisional)} is ${bestOption.name}. It starts at ${money(bestOption.minSpendCents)} and the deposit is ${money(bestOption.depositAmountCents)}. ${getDepositCloseLine(context, provisional)}`,
        ])
      : availabilityQuestion
        ? pickVariant(context, [
            `${makeAcknowledgement(context, "table_recommendation")} For ${describeTableLadderLead(context, provisional)}, I can offer ${bestOption.name} at ${money(bestOption.minSpendCents)} minimum spend with a ${money(bestOption.depositAmountCents)} deposit.${nextOption ? ` The next package up is ${nextOption.name} at ${money(nextOption.minSpendCents)}.` : ""} ${getDepositCloseLine(context, provisional)}`,
            `${makeAcknowledgement(context, "table_recommendation")} Right now the main option I can offer for ${describeTableLadderLead(context, provisional)} is ${bestOption.name}. It starts at ${money(bestOption.minSpendCents)} with a ${money(bestOption.depositAmountCents)} deposit.${nextOption ? ` If you want something bigger, ${nextOption.name} is the next step up.` : ""} ${getDepositCloseLine(context, provisional)}`,
            `${makeAcknowledgement(context, "table_recommendation")} For ${describeTableLadderLead(context, provisional)}, the starting availability is ${bestOption.name} at ${money(bestOption.minSpendCents)} minimum spend and a ${money(bestOption.depositAmountCents)} deposit.${nextOption ? ` I also have ${nextOption.name} above that.` : ""} ${getDepositCloseLine(context, provisional)}`,
          ])
      : pickVariant(context, [
          formatTableStartingReply({
            context,
            result: provisional,
            tableOption: bestOption,
            leadIn: makeAcknowledgement(context, "table_recommendation"),
          }),
          `${makeAcknowledgement(context, "table_recommendation")} For ${describeTableLadderLead(context, provisional)}, I'd start you with ${bestOption.name} at ${money(bestOption.minSpendCents)} minimum spend and a ${money(bestOption.depositAmountCents)} deposit. ${nextOption ? `The next step up would be ${nextOption.name} at ${money(nextOption.minSpendCents)}.` : ""} ${getDepositCloseLine(context, provisional)}`,
          `${makeAcknowledgement(context, "table_recommendation")} The starting package I'd point you to for ${describeTableLadderLead(context, provisional)} is ${bestOption.name}. It starts at ${money(bestOption.minSpendCents)} with a ${money(bestOption.depositAmountCents)} deposit. ${nextOption ? `If you want to go bigger, ${nextOption.name} is the next package up.` : ""} ${getDepositCloseLine(context, provisional)}`,
        ]);
    provisional.aiConfidence = 0.78;
    provisional.conversationMode = getCurrentPhone(provisional, context) ? "close" : "table_recommendation";
    provisional.answeredLatestQuestion = true;
    provisional.shouldCloseNow = hasEnoughQualification(provisional, context) && !getCurrentPhone(provisional, context)
      ? true
      : Boolean(getCurrentPhone(provisional, context));
    provisional.nextAction = "AI gathered enough context to create a draft quote.";
    provisional.recommendation = {
      tableOptionName: bestOption.name,
      quoteLabel: `${known.partySize}-guest ${bestOption.name}`,
      quotePitch: `Best fit for ${known.partySize} guests. ${bestOption.name} starts at ${money(bestOption.minSpendCents)} with a ${money(bestOption.depositAmountCents)} deposit.`,
      readyForQuote: true,
    };
    return provisional;
  }

  if (isAvailabilityQuestion(lastGuestMessage) && known.requestedDateLabel && known.partySize) {
    const minimumSpend = getMinimumTableSpendCents(context);
    provisional.reply = pickVariant(context, [
      `${makeAcknowledgement(context, "qualification")} I do not have a configured table package that fits ${describeTableLadderLead(context, provisional)} right now.${minimumSpend ? ` The table minimums start at ${money(minimumSpend)}.` : ""} If your group size is flexible, I can check the closest fit.`,
      `${makeAcknowledgement(context, "qualification")} I don't have a configured package available for ${describeTableLadderLead(context, provisional)} at the moment.${minimumSpend ? ` The current table packages start at ${money(minimumSpend)}.` : ""} If you're open to adjusting the group size, I can point you to the nearest option.`,
      `${makeAcknowledgement(context, "qualification")} Nothing in the current configured table lineup fits ${describeTableLadderLead(context, provisional)} exactly.${minimumSpend ? ` The lowest package starts at ${money(minimumSpend)}.` : ""} If you want, I can help you find the closest available setup.`,
    ]);
    provisional.aiConfidence = 0.72;
    provisional.conversationMode = "objection";
    provisional.answeredLatestQuestion = true;
    provisional.nextAction = "Guest asked about availability, but no configured table package fits the current date and party size.";
    provisional.recommendation.readyForQuote = false;
    return provisional;
  }

  if (known.requestedDateLabel) {
    const startingOption = getStartingTableOption(context);
    if (startingOption) {
      provisional.reply = pickVariant(context, [
        `${makeAcknowledgement(context, "table_recommendation")} For ${known.requestedDateLabel}, the starting package at ${context.venue.name} is ${startingOption.name} at ${money(startingOption.minSpendCents)} minimum spend with a ${money(startingOption.depositAmountCents)} deposit.${known.partySize ? ` ${getDepositCloseLine(context, provisional)}` : " Give me your group size and I'll point you to the best fit."}`,
        `${makeAcknowledgement(context, "table_recommendation")} The starting option I can offer for ${known.requestedDateLabel} is ${startingOption.name}. It begins at ${money(startingOption.minSpendCents)} with a ${money(startingOption.depositAmountCents)} deposit.${known.partySize ? ` ${getDepositCloseLine(context, provisional)}` : " Send me your group size and I'll match you to the right table."}`,
        `${makeAcknowledgement(context, "table_recommendation")} For ${known.requestedDateLabel}, I can start with ${startingOption.name} at ${money(startingOption.minSpendCents)} minimum spend.${known.partySize ? ` ${getDepositCloseLine(context, provisional)}` : " Once I have the group size, I'll show you the best fit."}`,
      ]);
      provisional.aiConfidence = 0.7;
      provisional.conversationMode = known.partySize ? "table_recommendation" : "qualification";
      provisional.answeredLatestQuestion = Boolean(known.requestedDateLabel);
      provisional.nextAction = known.partySize
        ? "Guest has a date; anchored on the starting package and pushed toward deposit."
        : "Guest has a date; anchored on the starting package and asked for group size.";
      return provisional;
    }
  }

  provisional.reply = memory.guestDeclinedCelebration && memory.guestDeclinedPreferredArea
    ? pickVariant(context, [
        "I have what I need so far. If you want me to keep this moving, send the best phone number and I can line up the hold steps.",
        "That covers the basics on my side. If you want to move on this, send the best phone number and I can send the hold steps.",
        "I'm set on the details so far. If you want to hold a table, send the best phone number and I can move to the next step.",
      ])
    : pickVariant(context, [
        `${makeAcknowledgement(context, "qualification")} If you have a preferred table area or any celebration details, send that over too.`,
        `${makeAcknowledgement(context, "qualification")} If you want a certain section or you're celebrating something, let me know.`,
        `${makeAcknowledgement(context, "qualification")} If there's a preferred area or occasion, send that over too.`,
      ]);
  provisional.conversationMode = "qualification";
  provisional.nextAction = "Review table fit; no matching active table option was found.";
  return provisional;
}

function normalizeAgentResult(result: AgentStructuredReply, context: InquiryContext): AgentStructuredReply {
  const extractedFromMessage = extractStructuredSignals(getLastGuestMessage(context));
  const normalizedMode = (result.conversationMode ?? detectConversationMode(context)) as ConversationMode;
  return {
    ...result,
    conversationMode: normalizedMode,
    answeredLatestQuestion: result.answeredLatestQuestion ?? !isGreetingOnly(getLastGuestMessage(context)),
    shouldCloseNow: result.shouldCloseNow ?? false,
    shouldHandoff: result.shouldHandoff ?? result.isHumanTakeover,
    extracted: mergeExtractedFields(result.extracted, extractedFromMessage),
  };
}

function makeShortCloseReply(context: InquiryContext, result: AgentStructuredReply, tableOption: InquiryContext["venue"]["tableOptions"][number]) {
  const phone = getCurrentPhone(result, context);
  if (phone) {
    return pickVariant(context, [
      `Perfect. I have your number for ${tableOption.name}. I'll send the deposit link now.`,
      `Great, I have your number. I'll send the deposit link for ${tableOption.name} now.`,
      `Perfect, I have what I need for ${tableOption.name}. I'll send the deposit link now.`,
    ]);
  }

  return pickVariant(context, [
    `${tableOption.name} is the best fit here. Send the best phone number and I'll send the deposit link.`,
    `That puts you on ${tableOption.name}. Send the best phone number and I'll send the deposit link.`,
    `${tableOption.name} is the one I'd hold for you. Send the best phone number and I'll send the deposit link.`,
  ]);
}

function replyMentionsHumanHandoff(reply: string) {
  return /\bhuman\b|\bteam\b|\boperator\b|\breal person\b|\bhand off\b|\bhandoff\b/i.test(reply);
}

function replyClarifiesPartySize(reply: string) {
  return /\bwhich number\b|\bwhat headcount\b|\bwhat party size\b|\bconfirm the group size\b|\bwhich should i use\b/i.test(
    reply,
  );
}

function replyAddressesPackageValue(reply: string, tableOption: InquiryContext["venue"]["tableOptions"][number]) {
  return (
    new RegExp(`\\b${tableOption.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(reply) ||
    /\btable\b|\bbooth\b|\bsection\b|\bspace\b|\bpackage\b/i.test(reply)
  );
}

function replyAddressesComparison(
  reply: string,
  bestOption: InquiryContext["venue"]["tableOptions"][number],
  nextOption: InquiryContext["venue"]["tableOptions"][number] | null,
) {
  const mentionsBase = new RegExp(`\\b${bestOption.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(reply);
  const mentionsNext = nextOption
    ? new RegExp(`\\b${nextOption.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(reply)
    : /\bstarting\b|\bmain option\b|\bonly option\b/i.test(reply);
  return mentionsBase && mentionsNext;
}

function replyAddressesPostPayment(reply: string) {
  return /\bafter\b.*\bpay\b|\bdeposit\b.*\bhold\b|\bconfirmed\b|\bnext step\b/i.test(reply);
}

function replyMovesTowardClose(reply: string) {
  return /\bdeposit link\b|\bphone number\b|\bhold it\b|\block it in\b/i.test(reply);
}

function replyHandlesReadyToBookIntent(reply: string) {
  return (
    replyMovesTowardClose(reply) &&
    !/\bif you'd like to hold it\b|\bif that works\b|\bif you'd like\b/i.test(reply)
  );
}

function postProcessAgentReply(result: AgentStructuredReply, context: InquiryContext): AgentStructuredReply {
  const lastGuestMessage = getLastGuestMessage(context);
  const memory = getConversationMemory(context);
  const bestOption = findRecommendedTableOption(result, context);
  const eligibleOptions = getEligibleTableOptions(result, context);
  const nextOption = eligibleOptions[1] ?? null;
  const readiness = detectGuestReadiness(context, result);
  const closedNight = getClosedNightInfo(result, context);
  const normalizedReply = normalizeMessageForComparison(result.reply);
  const normalizedLastAi = normalizeMessageForComparison(memory.lastAiMessage);
  const questionAnsweredDeterministically = isVenueKnowledgeQuestion(lastGuestMessage)
    ? getDeterministicVenueKnowledgeReply(context)
    : null;

  if (questionAnsweredDeterministically && result.answeredLatestQuestion === false) {
    return questionAnsweredDeterministically;
  }

  const conversationDecision = evaluateConversationSafetyPolicy(makeWebsiteChatPolicyContext({
    context,
    result,
    closedNight,
  }));
  if (conversationDecision.shouldEscalate) {
    return applyEscalationPolicy(result, context, conversationDecision);
  }

  if (!shouldPreserveVenueKnowledgeReplyForClosedNight(lastGuestMessage, result, context) && closedNight) {
    return {
      ...result,
      conversationMode: "venue_info",
      answeredLatestQuestion: true,
      shouldCloseNow: false,
      shouldHandoff: false,
      recommendation: {
        tableOptionName: null,
        quoteLabel: null,
        quotePitch: null,
        readyForQuote: false,
      },
      reply: makeClosedNightReply(context, closedNight),
      nextAction: `Guest requested ${closedNight.requestedDateLabel}, but ${context.venue.name} is closed on ${closedNight.requestedWeekday}.`,
    };
  }

  if (isAmbiguousPartySizeMessage(lastGuestMessage)) {
    return {
      ...result,
      conversationMode: "qualification",
      answeredLatestQuestion: true,
      shouldCloseNow: false,
      reply: replyClarifiesPartySize(result.reply) ? result.reply : makeAmbiguousPartySizeReply(context),
      nextAction: "Guest gave an uncertain headcount; clarify which party size to use.",
      recommendation: {
        tableOptionName: null,
        quoteLabel: null,
        quotePitch: null,
        readyForQuote: false,
      },
    };
  }

  if (
    hasInvalidPhoneAttempt(lastGuestMessage) &&
    !(/^\s*\d{1,2}\s*$/.test(lastGuestMessage.trim()) && !memory.hasAskedPhone) &&
    (memory.hasAskedPhone || result.shouldCloseNow || readiness === "ready_to_book" || Boolean(bestOption))
  ) {
    return {
      ...result,
      conversationMode: "close",
      answeredLatestQuestion: true,
      shouldCloseNow: true,
      reply: makeInvalidPhoneReply(context),
      nextAction: "Guest attempted to provide a phone number, but it was not valid enough for deposit-link delivery.",
      recommendation: bestOption
        ? {
            tableOptionName: bestOption.name,
            quoteLabel: `${knownFields(result, context).partySize ?? "guest"}-${bestOption.name}`,
            quotePitch: `Waiting on a valid phone number before sending the deposit link for ${bestOption.name}.`,
            readyForQuote: hasEnoughQualification(result, context),
          }
        : result.recommendation,
    };
  }

  if (bestOption && isPackageValueQuestion(lastGuestMessage)) {
    return {
      ...result,
      conversationMode: "table_recommendation",
      answeredLatestQuestion: true,
      shouldCloseNow: readiness === "ready_to_book",
      recommendation: {
        tableOptionName: bestOption.name,
        quoteLabel: `${knownFields(result, context).partySize ?? "guest"}-${bestOption.name}`,
        quotePitch: `Explained what ${bestOption.name} includes for the guest.`,
        readyForQuote: hasEnoughQualification(result, context),
      },
      reply:
        result.answeredLatestQuestion !== false && replyAddressesPackageValue(result.reply, bestOption)
          ? result.reply
          : `${makePackageValueReply(context, result, bestOption)} ${readiness === "qualified" ? getDepositCloseLine(context, result) : ""}`.trim(),
      nextAction: "Answered a package value question and kept the booking flow moving.",
    };
  }

  if (bestOption && isVenueKnowledgeQuestion(lastGuestMessage) && hasBookingIntentSignals(lastGuestMessage)) {
    return {
      ...result,
      conversationMode: "table_recommendation",
      answeredLatestQuestion: true,
      shouldCloseNow: hasEnoughQualification(result, context),
      recommendation: {
        tableOptionName: bestOption.name,
        quoteLabel: `${knownFields(result, context).partySize ?? "guest"}-${bestOption.name}`,
        quotePitch: `Answered venue knowledge and recommended ${bestOption.name}.`,
        readyForQuote: hasEnoughQualification(result, context),
      },
      reply: makeMixedVenueKnowledgeAndRecommendationReply(context, result, bestOption),
      nextAction: "Answered venue knowledge and kept the booking recommendation moving.",
    };
  }

  if (bestOption && isComparisonQuestion(lastGuestMessage)) {
    return {
      ...result,
      conversationMode: "table_recommendation",
      answeredLatestQuestion: true,
      shouldCloseNow: false,
      recommendation: {
        tableOptionName: bestOption.name,
        quoteLabel: `${knownFields(result, context).partySize ?? "guest"}-${bestOption.name}`,
        quotePitch: `Compared ${bestOption.name} against the next configured option.`,
        readyForQuote: hasEnoughQualification(result, context),
      },
      reply:
        result.answeredLatestQuestion !== false && replyAddressesComparison(result.reply, bestOption, nextOption)
          ? result.reply
          : `${makePackageComparisonReply(context, result, bestOption, nextOption)} ${hasEnoughQualification(result, context) ? getDepositCloseLine(context, result) : ""}`.trim(),
      nextAction: "Compared the configured table options for the guest.",
    };
  }

  if (bestOption && isPostPaymentQuestion(lastGuestMessage)) {
    return {
      ...result,
      conversationMode: "close",
      answeredLatestQuestion: true,
      shouldCloseNow: true,
      reply:
        result.answeredLatestQuestion !== false && replyAddressesPostPayment(result.reply)
          ? result.reply
          : makePostPaymentReply(context, result, bestOption),
      nextAction: "Explained what happens after the deposit is paid.",
    };
  }

  if (bestOption && isReadyToBookMessage(lastGuestMessage)) {
    return {
      ...result,
      conversationMode: "close",
      answeredLatestQuestion: true,
      shouldCloseNow: true,
      recommendation: {
        tableOptionName: bestOption.name,
        quoteLabel: `${knownFields(result, context).partySize ?? "guest"}-${bestOption.name}`,
        quotePitch: `Guest is ready to book ${bestOption.name}.`,
        readyForQuote: hasEnoughQualification(result, context),
      },
      reply:
        result.answeredLatestQuestion !== false && replyHandlesReadyToBookIntent(result.reply)
          ? result.reply
          : makeDirectCloseReply(context, result, bestOption),
      nextAction: "Guest is ready to book; move directly to phone capture or deposit link.",
    };
  }

  if (/^\s*\d{1,2}\s*$/.test(lastGuestMessage.trim()) && result.extracted.partySize && bestOption) {
    return {
      ...result,
      conversationMode: getCurrentPhone(result, context) ? "close" : "table_recommendation",
      answeredLatestQuestion: true,
      shouldCloseNow: true,
      reply: memory.lastAiTableOptionName === bestOption.name
        ? makeShortCloseReply(context, result, bestOption)
        : pickVariant(context, [
            `For ${result.extracted.partySize} guests, I'd put you in ${bestOption.name} at ${money(bestOption.minSpendCents)} minimum spend with a ${money(bestOption.depositAmountCents)} deposit. ${getDepositCloseLine(context, result)}`,
            `${bestOption.name} works for ${result.extracted.partySize} guests. It starts at ${money(bestOption.minSpendCents)} minimum spend with a ${money(bestOption.depositAmountCents)} deposit. ${getDepositCloseLine(context, result)}`,
            `For ${result.extracted.partySize} guests, the starting fit is ${bestOption.name} at ${money(bestOption.minSpendCents)} minimum spend and a ${money(bestOption.depositAmountCents)} deposit. ${getDepositCloseLine(context, result)}`,
          ]),
    };
  }

  if (isObjectionMessage(lastGuestMessage)) {
    return {
      ...result,
      conversationMode: "objection",
      answeredLatestQuestion: true,
      shouldCloseNow: readiness === "ready_to_book",
      reply: makeObjectionReply(context, result, bestOption),
    };
  }

  if (readiness === "hesitating" && bestOption) {
    return {
      ...result,
      conversationMode: "objection",
      answeredLatestQuestion: true,
      shouldCloseNow: false,
      reply: makeObjectionReply(context, result, bestOption),
      nextAction: "Guest is hesitating; keep the lead warm and preserve the package anchor without pushing for payment.",
    };
  }

  if (bestOption && getCurrentPhone(result, context) && (result.shouldCloseNow || memory.hasAskedPhone)) {
    return {
      ...result,
      conversationMode: "close",
      answeredLatestQuestion: true,
      shouldCloseNow: true,
      reply: makeShortCloseReply(context, result, bestOption),
    };
  }

  if (bestOption && normalizedReply === normalizedLastAi) {
    return {
      ...result,
      conversationMode: getCurrentPhone(result, context) ? "close" : "table_recommendation",
      shouldCloseNow: true,
      reply: makeShortCloseReply(context, result, bestOption),
    };
  }

  if (
    bestOption &&
    memory.lastAiTableOptionName === bestOption.name &&
    /\bminimum spend\b/i.test(result.reply) &&
    /\bminimum spend\b/i.test(memory.lastAiMessage)
  ) {
    return {
      ...result,
      conversationMode: readiness === "hesitating" ? "objection" : getCurrentPhone(result, context) ? "close" : "table_recommendation",
      shouldCloseNow: readiness === "ready_to_book",
      reply: readiness === "hesitating" ? makeObjectionReply(context, result, bestOption) : makeShortCloseReply(context, result, bestOption),
    };
  }

  return result;
}

async function logAgentDiagnostic(input: {
  venueId: string;
  action: string;
  summary: string;
  entityId?: string;
}) {
  await logWebsiteChatAgentDiagnostic(input);
}

async function generateOpenAiReply(context: InquiryContext): Promise<AgentStructuredReply | null> {
  const platformConfig = await getPlatformConfig();
  const apiKey = getResolvedOpenAIApiKey(platformConfig.openAIApiKey);
  if (!apiKey) {
    await logAgentDiagnostic({
      venueId: context.venue.id,
      action: "website_chat.agent_fallback",
      summary: "OpenAI key missing; used local website chat fallback.",
      entityId: context.id,
    });
    return null;
  }

  const model = getWebsiteChatOpenAiModel();
  const transcript = context.messages
    .slice(-10)
    .map((message) => `${message.authorRole.toUpperCase()}: ${message.content}`)
    .join("\n");
  const venueOptions = context.venue.tableOptions
    .slice(0, 8)
    .map(
      (option) =>
        `- ${option.name}: ${option.capacityMin}-${option.capacityMax} guests, ${money(option.minSpendCents)} min spend, ${money(option.depositAmountCents)} deposit, ${option.description || "No description"}`,
    )
    .join("\n");
  const memory = getConversationMemory(context);
  const currentMode = detectConversationMode(context);
  const readiness = detectGuestReadiness(context, {
    intent: "qualification",
    objective: "qualify_lead",
    conversationMode: currentMode,
    answeredLatestQuestion: false,
    shouldCloseNow: false,
    shouldHandoff: false,
    reply: "",
    aiConfidence: 0,
    nextAction: "",
    isHumanTakeover: false,
    handoffReason: null,
    recommendation: {
      tableOptionName: null,
      quoteLabel: null,
      quotePitch: null,
      readyForQuote: false,
    },
    extracted: extractStructuredSignals(getLastGuestMessage(context)),
  });
  const venueKnowledge = formatVenueKnowledgeForAi({
    venueId: context.venue.id,
    servesFood: context.venue.servesFood,
    servesHookah: context.venue.servesHookah,
    hasParking: context.venue.hasParking,
    hasValet: context.venue.hasValet,
    dressCodeSummary: context.venue.dressCodeSummary,
    agePolicySummary: context.venue.agePolicySummary,
    bottleMenu: context.venue.bottleMenuUrl
      ? { publicUrl: context.venue.bottleMenuUrl }
      : null,
    foodMenu: context.venue.foodMenuUrl
      ? { publicUrl: context.venue.foodMenuUrl }
      : null,
    hookahMenu: context.venue.hookahMenuUrl
      ? { publicUrl: context.venue.hookahMenuUrl }
      : null,
    resolvedEvents: context.venue.resolvedEvents,
  });

  const startedAt = Date.now();
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "website_chat_reply",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              intent: { type: "string" },
              objective: { type: "string" },
              conversationMode: { type: "string" },
              answeredLatestQuestion: { type: "boolean" },
              shouldCloseNow: { type: "boolean" },
              shouldHandoff: { type: "boolean" },
              reply: { type: "string" },
              aiConfidence: { type: "number" },
              nextAction: { type: "string" },
              isHumanTakeover: { type: "boolean" },
              handoffReason: { type: ["string", "null"] },
              recommendation: {
                type: "object",
                additionalProperties: false,
                properties: {
                  tableOptionName: { type: ["string", "null"] },
                  quoteLabel: { type: ["string", "null"] },
                  quotePitch: { type: ["string", "null"] },
                  readyForQuote: { type: "boolean" },
                },
                required: ["tableOptionName", "quoteLabel", "quotePitch", "readyForQuote"],
              },
              extracted: {
                type: "object",
                additionalProperties: false,
                properties: {
                  requestedDateLabel: { type: ["string", "null"] },
                  partySize: { type: ["number", "null"] },
                  spendIntentLabel: { type: ["string", "null"] },
                  occasion: { type: ["string", "null"] },
                  phone: { type: ["string", "null"] },
                },
                required: ["requestedDateLabel", "partySize", "spendIntentLabel", "occasion", "phone"],
              },
            },
            required: [
              "intent",
              "objective",
              "conversationMode",
              "answeredLatestQuestion",
              "shouldCloseNow",
              "shouldHandoff",
              "reply",
              "aiConfidence",
              "nextAction",
              "isHumanTakeover",
              "handoffReason",
              "recommendation",
              "extracted",
            ],
          },
        },
      },
      messages: [
        {
          role: "system",
          content:
            `You are the live website sales concierge for ${context.venue.name}. ` +
            "Your goal is to qualify nightlife table inquiries and move qualified guests toward a quote and deposit. " +
            "You must only offer or imply packages that exist in the provided Table options. Do not invent experiences, packages, discounts, walk-in options, guest list options, bar tabs, or alternatives that are not explicitly configured. " +
            "Answer the guest's latest question first before steering back into qualification. Do not repeat the same intake line if the guest has asked a new question. " +
            "Keep each reply tight: answer the question, make one recommendation if useful, and ask at most one next-step question unless a second is absolutely necessary. " +
            "Acknowledge what the guest just told you in a short natural way when it helps, but do not restart the conversation or repeat the same intro framing. Avoid starting every reply with 'Thanks' plus the guest name. " +
            "You are the primary conversation planner. Infer what the guest just meant, choose the next best sales move, and produce a natural response. " +
            "Sound like a sharp venue host, not a scripted assistant. Do not mirror the same sentence frame over and over, and do not respond like a checklist when the guest is asking a natural follow-up. " +
            "Use conversationMode as one of: greeting, qualification, venue_info, table_recommendation, objection, close, handoff. " +
            "Use the provided guest readiness to decide how aggressive the close should be. If the guest is hesitating, keep the lead warm and do not push for payment in the same turn. " +
            "When the guest asks about venue knowledge like food, hookah, parking, valet, dress code, age policy, or events, answer only from the provided Venue knowledge. Do not invent missing facts. If a menu or flyer asset URL exists, prefer linking to it directly. " +
            "If the guest asks about events and none are configured for that date, say that directly. " +
            "Do not offer, quote, or hold tables for a night the venue is closed. If the requested night is outside operating hours, say the venue is closed that night and, if possible, point the guest to the next open night. " +
            "When the guest asks what they get, what the difference is, or asks a mixed logistics-plus-booking question, answer both parts in one natural reply before moving the conversation forward. " +
            "Treat the configured table minimums as the anchor. Date/night and party size are the key qualification questions. " +
            "Sell from the venue's configured package ladder. When you already know the date/night and party size, frame your answer around the starting package for that group and night, including the minimum spend and deposit. If the guest asks for the cheapest option, answer with the lowest configured package that fits. " +
            "Move toward the close as soon as you reasonably can. As soon as you know the date/night, anchor the guest on the starting package for that night instead of waiting for them to ask what is available. Use any later group size or preference details to refine from that anchor. " +
            "Once the guest is aligned on a package, pivot quickly to collecting the phone number and sending the deposit link to hold the table. " +
            "If the guest pushes back on price or says they need to think about it, handle the objection naturally but stay inside the configured package truth. Do not invent cheaper options or discounts. " +
            "Only recommend a table when the party size fits its capacity. " +
            "Ask at most two missing questions per reply. Do not repeat questions already answered. " +
            "Once you know date/night and party size, recommend the best fitting configured table option and set recommendation.readyForQuote=true when a specific inventory option fits. " +
            "Return intent and objective as short snake_case labels describing the guest's current intent and your next conversational goal. Set answeredLatestQuestion=true only if you directly answered the guest's latest ask. Set shouldCloseNow=true when the next best move is collecting phone or sending the deposit link. Set shouldHandoff=true only when a human should take over. " +
            "Escalate to human for VIP/custom requests, upset guests, unavailable inventory, parties larger than capacity, or confidence below 0.5. " +
            `Keep the tone ${context.venue.brandTone}. Keep replies concise, polished, and conversion-oriented. ` +
            `Venue deposit policy: ${context.venue.depositPolicy}. ` +
            `Operating hours: ${context.venue.hoursSummary ?? "Not provided"}.`,
        },
        {
          role: "user",
          content:
            `Guest: ${context.guestName}\n` +
            `Known fields:\n` +
            `- requestedDateLabel: ${context.requestedDateLabel}\n` +
            `- partySize: ${context.partySize}\n` +
            `- spendIntentLabel: ignore for website chat qualification\n` +
            `- occasion: ${context.occasion ?? "Not provided"}\n` +
            `- phone: ${context.phone ?? "Not provided"}\n\n` +
            `Conversation state:\n` +
            `- currentMode: ${currentMode}\n` +
            `- lastAiMessage: ${memory.lastAiMessage || "None"}\n` +
            `- lastAiTableOptionName: ${memory.lastAiTableOptionName ?? "None"}\n` +
            `- hasAskedDate: ${memory.hasAskedDate ? "Yes" : "No"}\n` +
            `- hasAskedPartySize: ${memory.hasAskedPartySize ? "Yes" : "No"}\n` +
            `- hasAskedPhone: ${memory.hasAskedPhone ? "Yes" : "No"}\n` +
            `- hasMentionedDeposit: ${memory.hasMentionedDeposit ? "Yes" : "No"}\n` +
            `- guestDeclinedCelebration: ${memory.guestDeclinedCelebration ? "Yes" : "No"}\n` +
            `- guestDeclinedPreferredArea: ${memory.guestDeclinedPreferredArea ? "Yes" : "No"}\n` +
            `- guestAskedToCheckWithFriends: ${memory.guestAskedToCheckWithFriends ? "Yes" : "No"}\n` +
            `- guestReadiness: ${readiness}\n\n` +
            `Venue knowledge:\n${venueKnowledge}\n\n` +
            `Table options:\n${venueOptions || "- No table options configured"}\n\n` +
            `Recent transcript:\n${transcript}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    await logAgentDiagnostic({
      venueId: context.venue.id,
      action: "website_chat.agent_openai_failed",
      summary: `OpenAI request failed with status ${response.status}; used local fallback.`,
      entityId: context.id,
    });
    return null;
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    await logAgentDiagnostic({
      venueId: context.venue.id,
      action: "website_chat.agent_openai_empty",
      summary: "OpenAI returned an empty website chat response; used local fallback.",
      entityId: context.id,
    });
    return null;
  }

  await logAgentDiagnostic({
    venueId: context.venue.id,
    action: "website_chat.agent_openai_replied",
    summary: `OpenAI website chat reply generated in ${Date.now() - startedAt}ms using ${model}.`,
    entityId: context.id,
  });

  return JSON.parse(content) as AgentStructuredReply;
}

function enforceConfiguredPackageGuardrails(result: AgentStructuredReply, context: InquiryContext): AgentStructuredReply {
  const decision = evaluatePackagePolicy(makeWebsiteChatPolicyContext({
    context,
    result,
    closedNight: null,
  }));
  if (decision.code === "unconfigured_package") {
    return {
      ...result,
      reply: pickVariant(context, [
        `${makeAcknowledgement(context, "qualification")} I do not have a configured table package that fits the current group size yet. The available table minimums start at ${getMinimumTableSpendCents(context) ? money(getMinimumTableSpendCents(context)!) : "the configured venue minimum"}, so I can only quote one of those packages.`,
        `${makeAcknowledgement(context, "qualification")} I don't have a configured package that matches the current group size so far. The available table minimums start at ${getMinimumTableSpendCents(context) ? money(getMinimumTableSpendCents(context)!) : "the configured venue minimum"}, so I can only quote from those packages.`,
        `${makeAcknowledgement(context, "qualification")} Nothing in the current table setup fits that group size just yet. The available minimums start at ${getMinimumTableSpendCents(context) ? money(getMinimumTableSpendCents(context)!) : "the configured venue minimum"}, so I can only offer one of those configured packages.`,
      ]),
      nextAction: "No configured table package matches the current party size.",
      recommendation: {
        tableOptionName: null,
        quoteLabel: null,
        quotePitch: null,
        readyForQuote: false,
      },
    };
  }

  if (decision.code === "invented_discount") {
    const recommendedOption = findRecommendedTableOption(result, context);
    return {
      ...result,
      reply: makeObjectionReply(context, result, recommendedOption),
      nextAction: "Policy blocked a possible invented discount; reply anchored to configured packages.",
      recommendation: recommendedOption
        ? {
            tableOptionName: recommendedOption.name,
            quoteLabel: `${knownFields(result, context).partySize ?? "guest"}-${recommendedOption.name}`,
            quotePitch: `Policy-safe configured package recommendation for ${recommendedOption.name}.`,
            readyForQuote: hasEnoughQualification(result, context),
          }
        : {
            tableOptionName: null,
            quoteLabel: null,
            quotePitch: null,
            readyForQuote: false,
          },
    };
  }

  if (
    !decision.allowed &&
    (result.recommendation.tableOptionName || result.recommendation.readyForQuote)
  ) {
    return {
      ...result,
      conversationMode: "handoff",
      answeredLatestQuestion: false,
      shouldCloseNow: false,
      shouldHandoff: true,
      isHumanTakeover: true,
      handoffReason: decision.reason,
      reply: makeHumanHandoffReply(context),
      nextAction: decision.safeNextAction,
      recommendation: {
        tableOptionName: null,
        quoteLabel: null,
        quotePitch: null,
        readyForQuote: false,
      },
    };
  }

  return result;
}

function getLargestConfiguredCapacity(context: InquiryContext) {
  return Math.max(0, ...context.venue.tableOptions.map((option) => option.capacityMax));
}

function makeWebsiteChatPolicyContext(input: {
  context: InquiryContext;
  result: AgentStructuredReply;
  closedNight?: ClosedNightInfo | null;
}) {
  const known = knownFields(input.result, input.context);
  return {
    config: input.context.agentConfig,
    channel: "website_chat" as const,
    latestGuestMessage: getLastGuestMessage(input.context),
    aiConfidence: input.result.aiConfidence,
    hasPhone: Boolean(getCurrentPhone(input.result, input.context)),
    isVenueKnowledgeQuestion: isVenueKnowledgeOnlyQuestion(getLastGuestMessage(input.context)),
    isHumanTakeover: input.result.isHumanTakeover,
    readyForQuote: input.result.recommendation.readyForQuote,
    closedNight: input.closedNight ?? null,
    recommendedTableOption: findRecommendedTableOption(input.result, input.context),
    knownPartySize: known.partySize,
    largestCapacity: getLargestConfiguredCapacity(input.context),
    proposedReply: input.result.reply,
  };
}

function applyEscalationPolicy(
  result: AgentStructuredReply,
  context: InquiryContext,
  decision: AgentPolicyDecision,
): AgentStructuredReply {
  if (!decision.shouldEscalate) return result;

  return {
    ...result,
    conversationMode: "handoff",
    answeredLatestQuestion: decision.code === "explicit_human_request",
    shouldCloseNow: false,
    shouldHandoff: true,
    isHumanTakeover: true,
    handoffReason: decision.reason,
    reply:
      decision.code === "explicit_human_request" && replyMentionsHumanHandoff(result.reply)
        ? result.reply
        : makeHumanHandoffReply(context),
    nextAction: decision.safeNextAction,
    recommendation: {
      tableOptionName: null,
      quoteLabel: null,
      quotePitch: null,
      readyForQuote: false,
    },
  };
}

function summarizeVenueKnowledgeResult(
  venueKnowledge: Awaited<ReturnType<typeof searchVenueKnowledgeForAgent>>,
) {
  if (!venueKnowledge) return "No venue knowledge context found.";

  const menuCount = [
    venueKnowledge.bottleMenu,
    venueKnowledge.foodMenu,
    venueKnowledge.hookahMenu,
  ].filter(Boolean).length;
  return [
    `events=${venueKnowledge.resolvedEvents.length}`,
    `menus=${menuCount}`,
    `servesFood=${venueKnowledge.servesFood}`,
    `servesHookah=${venueKnowledge.servesHookah}`,
    `parking=${venueKnowledge.hasParking}`,
    `valet=${venueKnowledge.hasValet}`,
  ].join("; ");
}

function summarizeRecommendationTool(result: AgentStructuredReply, context: InquiryContext) {
  const tableOption = findRecommendedTableOption(result, context);
  const known = knownFields(result, context);

  if (!tableOption) {
    return `No configured table option matched partySize=${known.partySize ?? "unknown"}.`;
  }

  return `Recommended ${tableOption.name} for partySize=${known.partySize ?? "unknown"} date=${known.requestedDateLabel ?? "unknown"}.`;
}

function summarizeDraftQuoteResult(draftQuote: Awaited<ReturnType<typeof createDraftQuoteIfReadyForAgent>>) {
  return draftQuote ? `Draft quote ready: ${draftQuote.label}.` : "No draft quote created.";
}

function summarizeReservationDepositResult(
  reservationDeposit: Awaited<ReturnType<typeof createReservationDepositIfReadyForAgent>>,
) {
  if (!reservationDeposit) return "No reservation or deposit checkout created.";
  if (reservationDeposit.depositCheckoutUrl) {
    return `Reservation ${reservationDeposit.id} created or reused with deposit checkout URL present.`;
  }

  return `Reservation ${reservationDeposit.id} created or reused without online deposit checkout.`;
}

function getToolCallStatusForNullableResult<T>(value: T | null) {
  return value ? "COMPLETED" as const : "SKIPPED" as const;
}

function makeAgentDisabledReply(context: InquiryContext): AgentStructuredReply {
  return {
    intent: "handoff",
    objective: "route_to_human",
    conversationMode: "handoff",
    answeredLatestQuestion: false,
    shouldCloseNow: false,
    shouldHandoff: true,
    reply: makeHumanHandoffReply(context),
    aiConfidence: 1,
    nextAction: "Venue agent is disabled or unavailable for website chat; human follow-up required.",
    isHumanTakeover: true,
    handoffReason: "Venue agent configuration disabled website chat automation.",
    recommendation: {
      tableOptionName: null,
      quoteLabel: null,
      quotePitch: null,
      readyForQuote: false,
    },
    extracted: {},
  };
}

export async function runWebsiteChatAgentForRuntime(input: AgentContext): Promise<WebsiteChatAgentRuntimeResult> {
  const inquiry = await prisma.inquiry.findUnique({
    where: { id: input.inquiryId },
    include: {
      messages: {
        orderBy: {
          createdAt: "asc",
        },
      },
      venue: {
        include: {
          tableOptions: {
            where: { active: true },
            orderBy: [{ minSpendCents: "asc" }],
          },
        },
      },
    },
  });

  if (!inquiry) {
    throw new Error("Inquiry not found for website chat agent.");
  }

  const ownsAgentRun = !input.agentRunId;
  const agentRun = input.agentRunId
    ? { id: input.agentRunId }
    : await startAgentRunSafely({
        venueId: inquiry.venueId,
        inquiryId: inquiry.id,
        channel: "WEBSITE_CHAT",
        source: "website_chat_agent",
        model: getWebsiteChatOpenAiModel(),
      });
  const completeRunIfOwned = async (completion: WebsiteChatAgentCompletion) => {
    if (!ownsAgentRun) return;
    await completeAgentRunSafely({
      agentRunId: agentRun?.id,
      ...completion,
    });
  };

  try {
  const agentConfig = await getVenueAgentConfigForVenue({
    venueId: inquiry.venueId,
    venueName: inquiry.venue.name,
    brandTone: inquiry.venue.brandTone,
    aiEnabled: inquiry.venue.aiEnabled,
    websiteChatEnabled: inquiry.venue.websiteChatEnabled,
  });
  const latestGuestMessage =
    [...inquiry.messages].reverse().find((message) => message.authorRole === "guest")?.content ?? "";
  const requestedDateHint =
    extractRequestedDateLabel(latestGuestMessage) ||
    (inquiry.requestedDateLabel !== "Not provided yet" ? inquiry.requestedDateLabel : null);
  const venueKnowledgePolicy = evaluateToolPolicy({
    config: agentConfig,
    channel: "website_chat",
    toolName: "searchVenueKnowledge",
  });

  const venueKnowledge = await recordAgentToolCallSafely({
    agentRunId: agentRun?.id,
    venueId: inquiry.venueId,
    inquiryId: inquiry.id,
    toolName: "searchVenueKnowledge",
    inputSummary: `policy=${venueKnowledgePolicy.status}; reason=${venueKnowledgePolicy.code}; requestedDateLabel=${requestedDateHint ?? "none"}`,
    getOutputSummary: summarizeVenueKnowledgeResult,
    getCompletedStatus: getToolCallStatusForNullableResult,
    execute: () =>
      venueKnowledgePolicy.allowed
        ? searchVenueKnowledgeForAgent({
            venueId: inquiry.venueId,
            requestedDateLabel: requestedDateHint,
          })
        : Promise.resolve(null),
  });

  if (input.guestMessageId) {
    const guestMessageIndex = inquiry.messages.findIndex((message) => message.id === input.guestMessageId);
    if (guestMessageIndex === -1) {
      const completion: WebsiteChatAgentCompletion = {
        status: "SKIPPED",
        finalAction: "Guest message no longer exists.",
        resultSummary: `Skipped website chat agent run for missing guest message ${input.guestMessageId}.`,
      };
      await completeRunIfOwned(completion);
      return { replyMessage: null, completion };
    }

    const replyAlreadyExists = inquiry.messages
      .slice(guestMessageIndex + 1)
      .some((message) => message.authorRole === "ai");

    if (replyAlreadyExists) {
      await logAgentDiagnostic({
        venueId: inquiry.venueId,
        action: "website_chat.agent_duplicate_skipped",
        summary: `Skipped duplicate AI reply for guest message ${input.guestMessageId}.`,
        entityId: inquiry.id,
      });
      const completion: WebsiteChatAgentCompletion = {
        status: "SKIPPED",
        finalAction: "Duplicate AI reply skipped.",
        resultSummary: `Skipped duplicate AI reply for guest message ${input.guestMessageId}.`,
      };
      await completeRunIfOwned(completion);
      return { replyMessage: null, completion };
    }
  }

  const context: InquiryContext = {
    id: inquiry.id,
    guestName: inquiry.guestName,
    phone: inquiry.phone,
    requestedDateLabel: requestedDateHint ?? inquiry.requestedDateLabel,
    partySize: inquiry.partySize,
    spendIntentLabel: inquiry.spendIntentLabel,
    occasion: inquiry.occasion,
    agentConfig,
    messages: inquiry.messages.map((message) => ({
      authorRole: message.authorRole,
      content: message.content,
    })),
    venue: {
      id: inquiry.venue.id,
      name: inquiry.venue.name,
      timezone: inquiry.venue.timezone,
      addressLine1: inquiry.venue.addressLine1,
      city: inquiry.venue.city,
      state: inquiry.venue.state,
      phoneNumber: inquiry.venue.phoneNumber,
      brandTone: agentConfig.brandVoice || inquiry.venue.brandTone,
      depositPolicy: inquiry.venue.depositPolicy,
      hoursSummary: inquiry.venue.hoursSummary,
      servesFood: venueKnowledge?.servesFood ?? inquiry.venue.servesFood,
      servesHookah: venueKnowledge?.servesHookah ?? inquiry.venue.servesHookah,
      hasParking: venueKnowledge?.hasParking ?? inquiry.venue.hasParking,
      hasValet: venueKnowledge?.hasValet ?? inquiry.venue.hasValet,
      dressCodeSummary: venueKnowledge?.dressCodeSummary ?? inquiry.venue.dressCodeSummary,
      agePolicySummary: venueKnowledge?.agePolicySummary ?? inquiry.venue.agePolicySummary,
      bottleMenuUrl: venueKnowledge?.bottleMenu?.publicUrl ?? null,
      foodMenuUrl: venueKnowledge?.foodMenu?.publicUrl ?? null,
      hookahMenuUrl: venueKnowledge?.hookahMenu?.publicUrl ?? null,
      depositCheckoutMode: inquiry.venue.depositCheckoutMode,
      stripeConnectAccountId: inquiry.venue.stripeConnectAccountId,
      stripeChargesEnabled: inquiry.venue.stripeChargesEnabled,
      stripePayoutsEnabled: inquiry.venue.stripePayoutsEnabled,
      resolvedEvents: venueKnowledge?.resolvedEvents ?? [],
      tableOptions: inquiry.venue.tableOptions,
    },
  };

  const responsePolicy = evaluateAgentActionPolicy({
    config: agentConfig,
    channel: "website_chat",
    latestGuestMessage,
    isVenueKnowledgeQuestion: isVenueKnowledgeOnlyQuestion(latestGuestMessage),
    action: "respond",
  });
  const canUseWebsiteChat = responsePolicy.allowed || responsePolicy.shouldEscalate;
  const llmResult = canUseWebsiteChat && responsePolicy.allowed ? await generateOpenAiReply(context) : null;
  let result = responsePolicy.allowed
    ? postProcessAgentReply(
        enforceConfiguredPackageGuardrails(
          normalizeAgentResult(llmResult ?? fallbackReply(context), context),
          context,
        ),
        context,
      )
    : makeAgentDisabledReply(context);
  const closedNightInfo = getClosedNightInfo(result, context);
  if (closedNightInfo && !shouldPreserveVenueKnowledgeReplyForClosedNight(latestGuestMessage, result, context)) {
    result = {
      ...result,
      conversationMode: "venue_info",
      answeredLatestQuestion: true,
      shouldCloseNow: false,
      shouldHandoff: false,
      recommendation: {
        tableOptionName: null,
        quoteLabel: null,
        quotePitch: null,
        readyForQuote: false,
      },
      reply: makeClosedNightReply(context, closedNightInfo),
      nextAction: `Guest requested ${closedNightInfo.requestedDateLabel}, but ${context.venue.name} is closed on ${closedNightInfo.requestedWeekday}.`,
    };
  }
  const normalizedConfidence = Math.max(0, Math.min(1, result.aiConfidence));
  const isClosedNight = Boolean(closedNightInfo);
  const quotePolicy = evaluateAgentActionPolicy({
    ...makeWebsiteChatPolicyContext({
      context,
      result,
      closedNight: closedNightInfo,
    }),
    action: "createQuote",
  });
  const reservationDepositPolicy = evaluateAgentActionPolicy({
    ...makeWebsiteChatPolicyContext({
      context,
      result,
      closedNight: closedNightInfo,
    }),
    action: "createReservationDeposit",
  });
  const recommendationPolicy = evaluateAgentActionPolicy({
    ...makeWebsiteChatPolicyContext({
      context,
      result,
      closedNight: closedNightInfo,
    }),
    action: "recommendPackage",
  });
  await recordAgentToolCallSafely({
    agentRunId: agentRun?.id,
    venueId: inquiry.venueId,
    inquiryId: inquiry.id,
    toolName: "recommendPackage",
    inputSummary: `policy=${recommendationPolicy.status}; reason=${recommendationPolicy.code}; tableOptionName=${result.recommendation.tableOptionName ?? "none"}; partySize=${knownFields(result, context).partySize ?? "unknown"}; readyForQuote=${result.recommendation.readyForQuote}`,
    getOutputSummary: () => summarizeRecommendationTool(result, context),
    execute: async () => recommendationPolicy.allowed ? findRecommendedTableOption(result, context) : null,
  });
  const draftQuote = await recordAgentToolCallSafely({
    agentRunId: agentRun?.id,
    venueId: inquiry.venueId,
    inquiryId: inquiry.id,
    toolName: "createQuote",
    inputSummary: `policy=${quotePolicy.status}; reason=${quotePolicy.code}; readyForQuote=${result.recommendation.readyForQuote}; isHumanTakeover=${result.isHumanTakeover}; isClosedNight=${isClosedNight}`,
    getOutputSummary: summarizeDraftQuoteResult,
    getCompletedStatus: getToolCallStatusForNullableResult,
    execute: () =>
      quotePolicy.allowed
        ? createDraftQuoteIfReadyForAgent({
            inquiryId: inquiry.id,
            result,
            context,
            isClosedNight,
          })
        : Promise.resolve(null),
  });
  const reservationDeposit = await recordAgentToolCallSafely({
    agentRunId: agentRun?.id,
    venueId: inquiry.venueId,
    inquiryId: inquiry.id,
    toolName: "createReservation",
    inputSummary: `policy=${reservationDepositPolicy.status}; reason=${reservationDepositPolicy.code}; hasPhone=${Boolean(result.extracted.phone || context.phone)}; isHumanTakeover=${result.isHumanTakeover}; isClosedNight=${isClosedNight}`,
    getOutputSummary: summarizeReservationDepositResult,
    getCompletedStatus: getToolCallStatusForNullableResult,
    execute: () =>
      reservationDepositPolicy.allowed
        ? createReservationDepositIfReadyForAgent({
            inquiryId: inquiry.id,
            result,
            context,
            isClosedNight,
          })
        : Promise.resolve(null),
  });
  await recordAgentToolCallSafely({
    agentRunId: agentRun?.id,
    venueId: inquiry.venueId,
    inquiryId: inquiry.id,
    toolName: "createDepositCheckout",
    inputSummary: `reservationCreated=${Boolean(reservationDeposit)}; checkoutMode=${context.venue.depositCheckoutMode}`,
    getOutputSummary: () =>
      reservationDeposit?.depositCheckoutUrl
        ? "Deposit checkout URL present on reservation."
        : "No deposit checkout URL created.",
    getCompletedStatus: () => reservationDeposit?.depositCheckoutUrl ? "COMPLETED" : "SKIPPED",
    execute: async () => reservationDeposit,
  });
  const unpaidDepositReminderHours = agentConfig.followUpRules.enabled
    ? agentConfig.followUpRules.unpaidDepositReminderHours
    : null;
  await recordAgentToolCallSafely({
    agentRunId: agentRun?.id,
    venueId: inquiry.venueId,
    inquiryId: inquiry.id,
    toolName: "scheduleFollowUp",
    inputSummary: `type=UNPAID_DEPOSIT_REMINDER; enabled=${agentConfig.followUpRules.enabled}; reminderHours=${unpaidDepositReminderHours ?? "none"}; hasCheckout=${Boolean(reservationDeposit?.depositCheckoutUrl)}`,
    getOutputSummary: (task) =>
      task
        ? `Scheduled ${task.type} for ${task.scheduledFor.toISOString()}.`
        : "No follow-up task scheduled.",
    getCompletedStatus: getToolCallStatusForNullableResult,
    execute: () => {
      if (!reservationDeposit?.depositCheckoutUrl || !unpaidDepositReminderHours || unpaidDepositReminderHours <= 0) {
        return Promise.resolve(null);
      }

      return scheduleUnpaidDepositReminderForAgent({
        venueId: inquiry.venueId,
        inquiryId: inquiry.id,
        reservationId: reservationDeposit.id,
        guestName: inquiry.guestName,
        tableName: reservationDeposit.tableOption.name,
        depositAmountCents: reservationDeposit.depositAmountCents,
        scheduledFor: new Date(Date.now() + unpaidDepositReminderHours * 60 * 60 * 1000),
      });
    },
  });
  const hasQualification = hasEnoughQualification(result, context);
  const nextConversation = deriveConversationStateAfterAgentTurn({
    currentState: normalizeConversationState(inquiry.status),
    currentInquiryStatus: inquiry.status as PersistedInquiryStatus,
    isHumanTakeover: result.isHumanTakeover,
    hasDraftQuote: Boolean(draftQuote),
    hasReservationDeposit: Boolean(reservationDeposit),
    hasConfirmedBooking: reservationDeposit?.status === "CONFIRMED",
    hasMinimumQualification: hasQualification,
  });

  const closingReply =
    reservationDeposit?.depositCheckoutUrl
      ? `${result.reply}\n\nYou can lock in ${reservationDeposit.tableOption.name} now with the ${money(reservationDeposit.depositAmountCents)} deposit here: ${reservationDeposit.depositCheckoutUrl}`
      : reservationDeposit
        ? `${result.reply}\n\nI have ${reservationDeposit.tableOption.name} ready for deposit, but online deposit checkout is not configured yet. A venue operator needs to finish payment setup before guests can pay automatically.`
        : result.reply;

  const replyMessage = await prisma.inquiryMessage.create({
    data: {
      inquiryId: inquiry.id,
      authorRole: "ai",
      content: closingReply,
    },
  });

  await prisma.inquiry.update({
    where: { id: inquiry.id },
    data: {
      phone: result.extracted.phone || inquiry.phone,
      requestedDateLabel:
        result.extracted.requestedDateLabel || inquiry.requestedDateLabel || "Not provided yet",
      partySize:
        result.extracted.partySize && Number.isFinite(result.extracted.partySize)
          ? Math.max(1, Math.round(result.extracted.partySize))
          : inquiry.partySize,
      spendIntentLabel: result.extracted.spendIntentLabel || inquiry.spendIntentLabel,
      occasion: result.extracted.occasion || inquiry.occasion,
      aiConfidence: normalizedConfidence,
      nextAction: reservationDeposit?.depositCheckoutUrl
        ? `Deposit checkout sent for ${reservationDeposit.tableOption.name}.`
        : reservationDeposit
          ? `Reservation created for ${reservationDeposit.tableOption.name}; Stripe deposit checkout is not configured.`
          : draftQuote
        ? `Review AI draft quote: ${draftQuote.label}.`
        : formatHumanHandoffNextAction(result),
      isHumanTakeover: result.isHumanTakeover,
      status: nextConversation.persistedInquiryStatus,
      lastOutboundAt: new Date(),
    },
  });

  await logWebsiteChatAgentOutcome({
    venueId: inquiry.venueId,
    replyMessageId: replyMessage.id,
    guestName: inquiry.guestName,
    isHumanTakeover: result.isHumanTakeover,
    handoffReason: result.handoffReason,
    reservationDeposit,
    draftQuote,
  });

  const completion: WebsiteChatAgentCompletion = {
    status: "COMPLETED",
    intent: result.intent,
    objective: result.objective,
    conversationMode: result.conversationMode ?? null,
    confidence: normalizedConfidence,
    finalAction: reservationDeposit?.depositCheckoutUrl
      ? `Deposit checkout sent for ${reservationDeposit.tableOption.name}.`
      : reservationDeposit
        ? `Reservation created for ${reservationDeposit.tableOption.name}; Stripe deposit checkout is not configured.`
        : draftQuote
      ? `Review AI draft quote: ${draftQuote.label}.`
      : formatHumanHandoffNextAction(result),
    resultSummary: result.isHumanTakeover
      ? `Escalated website chat: ${result.handoffReason ?? "review needed"}.`
      : reservationDeposit?.depositCheckoutUrl
        ? `Sent deposit checkout for ${reservationDeposit.tableOption.name}.`
        : reservationDeposit
          ? `Created reservation for ${reservationDeposit.tableOption.name} without online checkout.`
      : draftQuote
        ? `Created draft quote ${draftQuote.label}.`
        : "Replied to website chat.",
  };
  await completeRunIfOwned(completion);

  return { replyMessage, completion };
  } catch (error) {
    const completion: WebsiteChatAgentCompletion = {
      status: "FAILED",
      finalAction: "Website chat agent run failed.",
      errorMessage: error instanceof Error ? error.message : "Unknown website chat agent error.",
    };
    await completeRunIfOwned(completion);
    throw error;
  }
}

export async function runWebsiteChatAgent(input: AgentContext) {
  const result = await runWebsiteChatAgentForRuntime(input);
  return result.replyMessage;
}
