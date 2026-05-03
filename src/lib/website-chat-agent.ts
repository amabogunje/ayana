import { getPlatformConfig, getResolvedOpenAIApiKey } from "@/lib/platform-config";
import { prisma } from "@/lib/prisma";
import { createDepositCheckout } from "@/lib/deposit-checkout";
import { buildVenueKnowledgeContext, formatVenueKnowledgeForAi } from "@/lib/venue-knowledge-service";

type AgentContext = {
  inquiryId: string;
  guestMessageId?: string;
};

type AgentStructuredReply = {
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
  messages: Array<{
    authorRole: string;
    content: string;
  }>;
  venue: {
    id: string;
    name: string;
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

function makeInfoReply(input: {
  reply: string;
  nextAction: string;
  confidence?: number;
}): AgentStructuredReply {
  return {
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

function getDeterministicVenueKnowledgeReply(context: InquiryContext): AgentStructuredReply | null {
  const lastGuestMessage =
    [...context.messages].reverse().find((message) => message.authorRole === "guest")?.content ?? "";
  const lower = lastGuestMessage.toLowerCase();

  if (/\bbottle\b|\bbottles\b|\bdrink menu\b|\bmenu prices\b/.test(lower)) {
    return makeInfoReply({
      reply: context.venue.bottleMenuUrl
        ? `Here is the current bottle menu for ${context.venue.name}: ${context.venue.bottleMenuUrl}`
        : `I do not have a bottle menu uploaded for ${context.venue.name} yet, so I can help with tables and reservations here but not quote bottle-by-bottle pricing from a menu asset.`,
      nextAction: "Answered from shared venue knowledge using the bottle menu asset.",
    });
  }

  if (/\bfood\b|\bmenu\b|\beat\b/.test(lower) && context.venue.servesFood) {
    return makeInfoReply({
      reply: context.venue.foodMenuUrl
        ? `Yes, ${context.venue.name} serves food. You can view the current food menu here: ${context.venue.foodMenuUrl}`
        : `Yes, ${context.venue.name} serves food. I do not have a food menu asset uploaded yet, but the venue has food service enabled.`,
      nextAction: "Answered a venue knowledge question about food service.",
      confidence: 0.84,
    });
  }

  if (/\bhookah\b/.test(lower)) {
    return makeInfoReply({
      reply: context.venue.servesHookah
        ? context.venue.hookahMenuUrl
          ? `Yes, ${context.venue.name} offers hookah. You can view the current hookah menu here: ${context.venue.hookahMenuUrl}`
          : `Yes, ${context.venue.name} offers hookah. I do not have a hookah menu asset uploaded yet, but hookah is configured as available.`
        : `${context.venue.name} does not currently have hookah configured as an available service.`,
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
      reply,
      nextAction: "Answered a venue knowledge question about parking or valet.",
      confidence: 0.84,
    });
  }

  if (/\bdress code\b|\bdresscode\b|\bwhat can i wear\b|\bwear\b|\bdress\b/.test(lower) && context.venue.dressCodeSummary) {
    return makeInfoReply({
      reply: `The dress code at ${context.venue.name} is: ${context.venue.dressCodeSummary}`,
      nextAction: "Answered a venue knowledge question about dress code.",
      confidence: 0.83,
    });
  }

  if (/\bhow old\b|\bage\b|\b21\+|\b18\+|\bid\b/.test(lower) && context.venue.agePolicySummary) {
    return makeInfoReply({
      reply: `The age policy at ${context.venue.name} is: ${context.venue.agePolicySummary}`,
      nextAction: "Answered a venue knowledge question about age policy.",
      confidence: 0.83,
    });
  }

  if (/\bhours\b|\bopen\b|\bclose\b|\bwhat time\b/.test(lower) && context.venue.hoursSummary) {
    return makeInfoReply({
      reply: `The current configured operating hours for ${context.venue.name} are: ${context.venue.hoursSummary}`,
      nextAction: "Answered a venue knowledge question about hours.",
      confidence: 0.83,
    });
  }

  if (/\baddress\b|\blocated\b|\bwhere are you\b|\blocation\b/.test(lower) && context.venue.addressLine1) {
    const location = [context.venue.addressLine1, context.venue.city, context.venue.state].filter(Boolean).join(", ");
    return makeInfoReply({
      reply: `${context.venue.name} is located at ${location}.`,
      nextAction: "Answered a venue knowledge question about location.",
      confidence: 0.84,
    });
  }

  if (/\bphone\b|\bcall\b|\bnumber\b/.test(lower) && context.venue.phoneNumber) {
    return makeInfoReply({
      reply: `You can reach ${context.venue.name} at ${context.venue.phoneNumber}.`,
      nextAction: "Answered a venue knowledge question about contact information.",
      confidence: 0.84,
    });
  }

  if (/\bevent\b|\btonight\b|\bthis thursday\b|\bthis friday\b|\bthis saturday\b|\bwhat'?s happening\b/.test(lower) && context.venue.resolvedEvents.length > 0) {
    const event = context.venue.resolvedEvents[0];
    return makeInfoReply({
      reply: `${event.title} is the configured event for ${event.occurrenceDate}${event.description ? `: ${event.description}` : "."}${event.flyerUrl ? ` You can view the flyer here: ${event.flyerUrl}` : ""}`,
      nextAction: "Answered from recurring event knowledge or date override.",
      confidence: 0.82,
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

function makeConfirmationCode(guestName: string) {
  const guestToken = guestName.split(" ")[0]?.toUpperCase().replace(/[^A-Z0-9]/g, "") || "GUEST";
  return `${guestToken}-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function knownFields(result: AgentStructuredReply, context: InquiryContext) {
  return {
    requestedDateLabel:
      result.extracted.requestedDateLabel ||
      (context.requestedDateLabel !== "Not provided yet" ? context.requestedDateLabel : null),
    partySize:
      result.extracted.partySize && Number.isFinite(result.extracted.partySize)
        ? Math.round(result.extracted.partySize)
        : context.partySize > 1
          ? context.partySize
          : null,
    spendIntentLabel:
      result.extracted.spendIntentLabel ||
      (context.spendIntentLabel !== "Not provided yet" ? context.spendIntentLabel : null),
  };
}

function hasEnoughQualification(result: AgentStructuredReply, context: InquiryContext) {
  const known = knownFields(result, context);
  return Boolean(known.requestedDateLabel && known.partySize && known.spendIntentLabel);
}

function parseSpendIntentCents(value: string | null | undefined) {
  if (!value) return null;

  const amounts = Array.from(value.matchAll(/\$?\s?(\d{2,6})(?:[,.](\d{3}))?/g))
    .map((match) => Number.parseInt(`${match[1] ?? ""}${match[2] ?? ""}`, 10))
    .filter((amount) => Number.isFinite(amount) && amount > 0);

  if (amounts.length === 0) return null;
  return Math.max(...amounts) * 100;
}

function getMinimumTableSpendCents(context: InquiryContext) {
  const spends = context.venue.tableOptions.map((option) => option.minSpendCents).filter((value) => value > 0);
  if (spends.length === 0) return null;
  return Math.min(...spends);
}

function getBudgetMismatch(result: AgentStructuredReply, context: InquiryContext) {
  const known = knownFields(result, context);
  const budgetCents = parseSpendIntentCents(known.spendIntentLabel);
  const minimumSpendCents = getMinimumTableSpendCents(context);

  if (!budgetCents || !minimumSpendCents || budgetCents >= minimumSpendCents) {
    return null;
  }

  return { budgetCents, minimumSpendCents };
}

function findRecommendedTableOption(result: AgentStructuredReply, context: InquiryContext) {
  if (result.recommendation.tableOptionName) {
    const normalizedName = result.recommendation.tableOptionName.toLowerCase();
    const exact = context.venue.tableOptions.find((option) => option.name.toLowerCase() === normalizedName);
    if (exact) return exact;
  }

  const known = knownFields(result, context);
  if (!known.partySize) return null;
  const spendCents = parseSpendIntentCents(known.spendIntentLabel);

  return context.venue.tableOptions.find(
    (option) =>
      known.partySize! >= option.capacityMin &&
      known.partySize! <= option.capacityMax &&
      (!spendCents || spendCents >= option.minSpendCents),
  ) ?? null;
}

function fallbackReply(context: InquiryContext): AgentStructuredReply {
  const venueKnowledgeReply = getDeterministicVenueKnowledgeReply(context);
  if (venueKnowledgeReply) {
    return venueKnowledgeReply;
  }

  const lastGuestMessage =
    [...context.messages].reverse().find((message) => message.authorRole === "guest")?.content ?? "";
  const lower = lastGuestMessage.toLowerCase();
  const extracted: AgentStructuredReply["extracted"] = {};

  const partyMatch = lower.match(/\b(\d{1,2})\s*(people|person|guests|guest|girls|guys)\b/);
  if (partyMatch) {
    extracted.partySize = Number.parseInt(partyMatch[1] ?? "", 10);
  }

  if (lower.includes("birthday")) {
    extracted.occasion = "Birthday";
  } else if (lower.includes("bachelor")) {
    extracted.occasion = "Bachelor party";
  } else if (lower.includes("bachelorette")) {
    extracted.occasion = "Bachelorette party";
  }

  if (lower.includes("tonight")) {
    extracted.requestedDateLabel = "Tonight";
  } else if (lower.includes("friday")) {
    extracted.requestedDateLabel = "Friday";
  } else if (lower.includes("saturday")) {
    extracted.requestedDateLabel = "Saturday";
  }

  const budgetMatch = lastGuestMessage.match(/\$?\s?(\d{3,5})(?:\s?-\s?\$?\s?(\d{3,5}))?/);
  if (budgetMatch) {
    extracted.spendIntentLabel = budgetMatch[2]
      ? `$${budgetMatch[1]}-$${budgetMatch[2]}`
      : `$${budgetMatch[1]}`;
  }

  const provisional: AgentStructuredReply = {
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
  if (!known.spendIntentLabel) missing.push("your budget or spend range");

  const largestCapacity = Math.max(0, ...context.venue.tableOptions.map((option) => option.capacityMax));
  const budgetMismatch = getBudgetMismatch(provisional, context);
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
    provisional.reply = `Thanks ${context.guestName.split(" ")[0] || ""}. This looks like something our team should review directly so we can give you the right answer. I’m flagging it for a venue operator now.`;
    provisional.aiConfidence = 0.38;
    provisional.nextAction = "Human takeover recommended by website chat agent.";
    provisional.isHumanTakeover = true;
    provisional.handoffReason = "VIP, custom, capacity, or direct-human language detected.";
    return provisional;
  }

  if (budgetMismatch) {
    provisional.reply = `Thanks ${context.guestName.split(" ")[0] || ""}. The lowest configured table package at ${context.venue.name} starts at ${money(budgetMismatch.minimumSpendCents)} minimum spend, so I do not have a ${money(budgetMismatch.budgetCents)} table option available. If you can work with the ${money(budgetMismatch.minimumSpendCents)} minimum, I can help find the best fit.`;
    provisional.aiConfidence = 0.86;
    provisional.nextAction = `Guest budget ${money(budgetMismatch.budgetCents)} is below configured minimum table spend ${money(budgetMismatch.minimumSpendCents)}.`;
    provisional.recommendation.readyForQuote = false;
    return provisional;
  }

  if (missing.length > 0) {
    provisional.reply = `Thanks ${context.guestName.split(" ")[0] || ""}. I can help with tables at ${context.venue.name}. To get you the best option, tell me ${missing.slice(0, 2).join(" and ")}.`;
    provisional.aiConfidence = 0.62;
    provisional.nextAction = `Collect missing qualification details: ${missing.join(", ")}.`;
    return provisional;
  }

  if (bestOption) {
    provisional.reply = `Perfect. Based on ${known.partySize} guests and a spend around ${known.spendIntentLabel}, ${bestOption.name} looks like a strong fit. It starts at ${money(bestOption.minSpendCents)} with a ${money(bestOption.depositAmountCents)} deposit. If that works, I can help move this toward a quote and deposit.`;
    provisional.aiConfidence = 0.78;
    provisional.nextAction = "AI gathered enough context to create a draft quote.";
    provisional.recommendation = {
      tableOptionName: bestOption.name,
      quoteLabel: `${known.partySize}-guest ${bestOption.name}`,
      quotePitch: `Best fit for ${known.partySize} guests looking for ${known.spendIntentLabel}. ${bestOption.name} starts at ${money(bestOption.minSpendCents)} with a ${money(bestOption.depositAmountCents)} deposit.`,
      readyForQuote: true,
    };
    return provisional;
  }

  provisional.reply = "Thanks, that helps. I have enough to keep qualifying this and line up the best option for your night. If you have a preferred table area or any celebration details, send that over too.";
  provisional.nextAction = "Review table fit; no matching active table option was found.";
  return provisional;
}

async function logAgentDiagnostic(input: {
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

  const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
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
            "When the guest asks about venue knowledge like food, hookah, parking, valet, dress code, age policy, or events, answer only from the provided Venue knowledge. Do not invent missing facts. If a menu or flyer asset URL exists, prefer linking to it directly. " +
            "If the guest budget is below the lowest configured minimum spend, say clearly that the lowest configured table package starts at that minimum and ask if they can work with that minimum. Do not ask whether they want options within their lower budget, because none exist. " +
            "Only recommend a table when the party size fits its capacity and the guest spend range meets or exceeds that table's minimum spend. " +
            "Ask at most two missing questions per reply. Do not repeat questions already answered. " +
            "Once you know date/night, party size, and spend range, recommend the best table option and set recommendation.readyForQuote=true when a specific inventory option fits. " +
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
            `- spendIntentLabel: ${context.spendIntentLabel}\n` +
            `- occasion: ${context.occasion ?? "Not provided"}\n` +
            `- phone: ${context.phone ?? "Not provided"}\n\n` +
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

async function createDraftQuoteIfReady(input: {
  inquiryId: string;
  result: AgentStructuredReply;
  context: InquiryContext;
}) {
  if (input.result.isHumanTakeover || !input.result.recommendation.readyForQuote) return null;
  if (!hasEnoughQualification(input.result, input.context)) return null;
  if (getBudgetMismatch(input.result, input.context)) return null;

  const tableOption = findRecommendedTableOption(input.result, input.context);
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

async function createReservationDepositIfReady(input: {
  inquiryId: string;
  result: AgentStructuredReply;
  context: InquiryContext;
}) {
  if (input.result.isHumanTakeover) return null;
  if (!hasEnoughQualification(input.result, input.context)) return null;
  if (getBudgetMismatch(input.result, input.context)) return null;

  const phone = input.result.extracted.phone || input.context.phone;
  if (!phone) return null;

  const tableOption = findRecommendedTableOption(input.result, input.context);
  if (!tableOption) return null;

  const existingReservation = await prisma.reservation.findUnique({
    where: { inquiryId: input.inquiryId },
    include: { tableOption: true },
  });

  if (existingReservation) {
    return existingReservation;
  }

  const reservation = await prisma.reservation.create({
    data: {
      inquiryId: input.inquiryId,
      tableOptionId: tableOption.id,
      status: "DEPOSIT_PENDING",
      depositAmountCents: tableOption.depositAmountCents,
      depositPaidCents: 0,
      confirmationCode: makeConfirmationCode(input.context.guestName),
      arrivalTimeLabel: input.result.extracted.requestedDateLabel || input.context.requestedDateLabel,
      notes: "Created automatically from website chat qualification.",
    },
    include: {
      tableOption: true,
    },
  });

  const checkout = await createDepositCheckout({
    reservationId: reservation.id,
    venueName: input.context.venue.name,
    tableName: tableOption.name,
    guestName: input.context.guestName,
    depositAmountCents: tableOption.depositAmountCents,
  });

  if (!checkout) {
    return reservation;
  }

  return prisma.reservation.update({
    where: { id: reservation.id },
    data: {
      depositCheckoutUrl: checkout.url,
      depositCheckoutSessionId: checkout.sessionId,
    },
    include: {
      tableOption: true,
    },
  });
}

function enforceConfiguredPackageGuardrails(result: AgentStructuredReply, context: InquiryContext): AgentStructuredReply {
  const budgetMismatch = getBudgetMismatch(result, context);
  if (budgetMismatch) {
    return {
      ...result,
      reply: `Thanks ${context.guestName.split(" ")[0] || ""}. The lowest configured table package at ${context.venue.name} starts at ${money(budgetMismatch.minimumSpendCents)} minimum spend, so I do not have a ${money(budgetMismatch.budgetCents)} table option available. If you can work with the ${money(budgetMismatch.minimumSpendCents)} minimum, I can help find the best fit.`,
      aiConfidence: Math.max(result.aiConfidence, 0.86),
      nextAction: `Guest budget ${money(budgetMismatch.budgetCents)} is below configured minimum table spend ${money(budgetMismatch.minimumSpendCents)}.`,
      isHumanTakeover: false,
      handoffReason: null,
      recommendation: {
        tableOptionName: null,
        quoteLabel: null,
        quotePitch: null,
        readyForQuote: false,
      },
    };
  }

  const recommendedOption = findRecommendedTableOption(result, context);
  if (result.recommendation.readyForQuote && !recommendedOption) {
    return {
      ...result,
      reply: `Thanks, that helps. I do not have a configured table package that fits both the group size and spend range yet. The available table minimums start at ${getMinimumTableSpendCents(context) ? money(getMinimumTableSpendCents(context)!) : "the configured venue minimum"}, so I can only quote one of those packages.`,
      nextAction: "No configured table package matches the current party size and spend range.",
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

export async function runWebsiteChatAgent(input: AgentContext) {
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

  const venueKnowledge = await buildVenueKnowledgeContext(
    inquiry.venueId,
    inquiry.requestedDateLabel !== "Not provided yet" ? inquiry.requestedDateLabel : null,
  );

  if (input.guestMessageId) {
    const guestMessageIndex = inquiry.messages.findIndex((message) => message.id === input.guestMessageId);
    if (guestMessageIndex === -1) {
      return null;
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
      return null;
    }
  }

  const context: InquiryContext = {
    id: inquiry.id,
    guestName: inquiry.guestName,
    phone: inquiry.phone,
    requestedDateLabel: inquiry.requestedDateLabel,
    partySize: inquiry.partySize,
    spendIntentLabel: inquiry.spendIntentLabel,
    occasion: inquiry.occasion,
    messages: inquiry.messages.map((message) => ({
      authorRole: message.authorRole,
      content: message.content,
    })),
    venue: {
      id: inquiry.venue.id,
      name: inquiry.venue.name,
      addressLine1: inquiry.venue.addressLine1,
      city: inquiry.venue.city,
      state: inquiry.venue.state,
      phoneNumber: inquiry.venue.phoneNumber,
      brandTone: inquiry.venue.brandTone,
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
      resolvedEvents: venueKnowledge?.resolvedEvents ?? [],
      tableOptions: inquiry.venue.tableOptions,
    },
  };

  const deterministicReply = getDeterministicVenueKnowledgeReply(context);
  const result = enforceConfiguredPackageGuardrails(
    deterministicReply ?? (await generateOpenAiReply(context)) ?? fallbackReply(context),
    context,
  );
  const normalizedConfidence = Math.max(0, Math.min(1, result.aiConfidence));
  const draftQuote = await createDraftQuoteIfReady({
    inquiryId: inquiry.id,
    result,
    context,
  });
  const reservationDeposit = await createReservationDepositIfReady({
    inquiryId: inquiry.id,
    result,
    context,
  });
  const hasQualification = hasEnoughQualification(result, context);
  const nextStatus = result.isHumanTakeover
    ? "NEEDS_HUMAN"
    : reservationDeposit
      ? "DEPOSIT_SENT"
    : draftQuote
      ? "QUOTED"
      : hasQualification
        ? "QUALIFYING"
        : inquiry.status;

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
        : result.handoffReason
          ? `${result.nextAction} Reason: ${result.handoffReason}`
          : result.nextAction,
      isHumanTakeover: result.isHumanTakeover,
      status: nextStatus,
      lastOutboundAt: new Date(),
    },
  });

  await prisma.activityLog.create({
    data: {
      venueId: inquiry.venueId,
      entityType: "website_chat_agent",
      entityId: replyMessage.id,
      action: result.isHumanTakeover
        ? "website_chat.agent_escalated"
        : reservationDeposit?.depositCheckoutUrl
          ? "website_chat.agent_deposit_link_sent"
          : reservationDeposit
            ? "website_chat.agent_reservation_created_no_checkout"
        : draftQuote
          ? "website_chat.agent_draft_quote_created"
          : "website_chat.agent_replied",
      summary: result.isHumanTakeover
        ? `Escalated website chat for ${inquiry.guestName}: ${result.handoffReason ?? "review needed"}.`
        : reservationDeposit?.depositCheckoutUrl
          ? `Sent deposit checkout for ${reservationDeposit.tableOption.name} to ${inquiry.guestName}.`
          : reservationDeposit
            ? `Created reservation for ${reservationDeposit.tableOption.name}, but no deposit checkout was available.`
        : draftQuote
          ? `Created draft quote ${draftQuote.label} for ${inquiry.guestName}.`
          : `Replied to website chat for ${inquiry.guestName}.`,
    },
  });

  return replyMessage;
}
