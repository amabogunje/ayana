export type TableOptionForAgent = {
  id: string;
  name: string;
  capacityMin: number;
  capacityMax: number;
  minSpendCents: number;
  depositAmountCents: number;
  description: string;
};

export type AgentRecommendationForTableOptions = {
  tableOptionName: string | null;
};

export type AgentExtractionForTableOptions = {
  requestedDateLabel?: string | null;
  partySize?: number | null;
  spendIntentLabel?: string | null;
};

export type AgentResultForTableOptions = {
  recommendation: AgentRecommendationForTableOptions;
  extracted: AgentExtractionForTableOptions;
};

export type TableOptionContext = {
  requestedDateLabel: string;
  partySize: number;
  spendIntentLabel: string;
  venue: {
    tableOptions: TableOptionForAgent[];
  };
};

export function getKnownTableOptionFields(result: AgentResultForTableOptions, context: TableOptionContext) {
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

export function hasEnoughTableQualification(result: AgentResultForTableOptions, context: TableOptionContext) {
  const known = getKnownTableOptionFields(result, context);
  return Boolean(known.requestedDateLabel && known.partySize);
}

export function getMinimumTableSpendCentsForAgent(context: TableOptionContext) {
  const spends = context.venue.tableOptions.map((option) => option.minSpendCents).filter((value) => value > 0);
  if (spends.length === 0) return null;
  return Math.min(...spends);
}

export function getStartingTableOptionForAgent(context: TableOptionContext) {
  return context.venue.tableOptions[0] ?? null;
}

export function getEligibleTableOptionsForAgent(
  result: AgentResultForTableOptions,
  context: TableOptionContext,
) {
  const known = getKnownTableOptionFields(result, context);
  if (!known.partySize) return [];

  return context.venue.tableOptions.filter(
    (option) =>
      known.partySize! >= option.capacityMin &&
      known.partySize! <= option.capacityMax,
  );
}

export function findRecommendedTableOptionForAgent(
  result: AgentResultForTableOptions,
  context: TableOptionContext,
) {
  if (result.recommendation.tableOptionName) {
    const normalizedName = result.recommendation.tableOptionName.toLowerCase();
    const exact = context.venue.tableOptions.find((option) => option.name.toLowerCase() === normalizedName);
    if (exact) return exact;
  }

  return getEligibleTableOptionsForAgent(result, context)[0] ?? null;
}
