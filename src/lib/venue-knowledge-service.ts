import { prisma } from "@/lib/prisma";

const weekdayOrder = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
type WeekdayKey = (typeof weekdayOrder)[number];
const weekdayLookup: Record<string, WeekdayKey> = {
  sunday: "SUN",
  sun: "SUN",
  monday: "MON",
  mon: "MON",
  tuesday: "TUE",
  tue: "TUE",
  tues: "TUE",
  wednesday: "WED",
  wed: "WED",
  thursday: "THU",
  thu: "THU",
  thur: "THU",
  thurs: "THU",
  friday: "FRI",
  fri: "FRI",
  saturday: "SAT",
  sat: "SAT",
};

function parseRecurringDays(value: string) {
  return value
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter((item): item is WeekdayKey => weekdayOrder.includes(item as WeekdayKey));
}

function weekdayKeyFromDate(value: Date) {
  return weekdayOrder[value.getUTCDay()] ?? "SUN";
}

function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function nextDateForWeekday(baseDate: Date, weekday: WeekdayKey) {
  const targetIndex = weekdayOrder.indexOf(weekday);
  const currentIndex = baseDate.getUTCDay();
  const offset = (targetIndex - currentIndex + 7) % 7;
  const resolved = new Date(baseDate);
  resolved.setUTCDate(baseDate.getUTCDate() + offset);
  return resolved;
}

function normalizeDateInput(value?: string | Date | null) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const normalizedText = value.trim().toLowerCase();

  if (normalizedText === "tonight" || normalizedText === "today") {
    return new Date();
  }

  if (normalizedText === "tomorrow") {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    return tomorrow;
  }

  const weekdayPhrase = normalizedText.match(
    /\b(?:this|next)?\s*(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat)\b/,
  );
  if (weekdayPhrase) {
    const weekday = weekdayLookup[weekdayPhrase[1] ?? ""];
    if (weekday) {
      const baseDate = new Date();
      const resolved = nextDateForWeekday(baseDate, weekday);
      if (normalizedText.startsWith("next ")) {
        resolved.setUTCDate(resolved.getUTCDate() + 7);
      }
      return resolved;
    }
  }

  const normalized = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(normalized.getTime()) ? null : normalized;
}

function getOverrideSeries(
  override: {
    eventSeriesId: string | null;
  } & Record<string, unknown>,
) {
  return "eventSeries" in override ? (override.eventSeries as { title?: string; description?: string | null; assets?: Array<{ publicUrl: string }> } | null | undefined) : null;
}

export async function getVenueKnowledgeSnapshot(venueId: string) {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    include: {
      assets: {
        where: { active: true },
        orderBy: { createdAt: "desc" },
      },
      eventSeries: {
        where: { active: true },
        include: {
          assets: {
            where: {
              type: "EVENT_FLYER",
              active: true,
            },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          overrides: {
            where: { active: true },
            include: {
              eventSeries: {
                include: {
                  assets: {
                    where: {
                      type: "EVENT_FLYER",
                      active: true,
                    },
                    orderBy: { createdAt: "desc" },
                    take: 1,
                  },
                },
              },
              assets: {
                where: {
                  type: "EVENT_FLYER",
                  active: true,
                },
                orderBy: { createdAt: "desc" },
                take: 1,
              },
            },
            orderBy: { occurrenceDate: "asc" },
          },
        },
        orderBy: { title: "asc" },
      },
      eventOverrides: {
        where: {
          active: true,
          eventSeriesId: null,
        },
        include: {
          assets: {
            where: {
              type: "EVENT_FLYER",
              active: true,
            },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        orderBy: { occurrenceDate: "asc" },
      },
    },
  });

  return venue;
}

export async function resolveVenueEventsForDate(venueId: string, dateInput?: string | Date | null) {
  const snapshot = await getVenueKnowledgeSnapshot(venueId);
  if (!snapshot) return [];

  const targetDate = normalizeDateInput(dateInput) ?? new Date();
  const isoDate = toIsoDate(targetDate);
  const overrideMatches = [
    ...snapshot.eventOverrides,
    ...snapshot.eventSeries.flatMap((series) => series.overrides),
  ].filter((override) => toIsoDate(override.occurrenceDate) === isoDate);

  if (overrideMatches.length > 0) {
    return overrideMatches
      .filter((override) => !override.isCancelled)
      .map((override) => {
        const series = getOverrideSeries(override);
        return {
          source: "override" as const,
          title: override.title ?? series?.title ?? "Special event",
          description: override.description ?? series?.description ?? null,
          occurrenceDate: toIsoDate(override.occurrenceDate),
          flyerUrl: override.assets[0]?.publicUrl ?? series?.assets?.[0]?.publicUrl ?? null,
        };
      });
  }

  const weekday = weekdayKeyFromDate(targetDate);
  return snapshot.eventSeries
    .filter((series) => {
      const recurringDays = parseRecurringDays(series.recurringDays);
      const startOk = !series.startDate || toIsoDate(series.startDate) <= isoDate;
      const endOk = !series.endDate || toIsoDate(series.endDate) >= isoDate;
      return recurringDays.includes(weekday) && startOk && endOk;
    })
    .map((series) => ({
      source: "series" as const,
      title: series.title,
      description: series.description ?? null,
      occurrenceDate: isoDate,
      flyerUrl: series.assets[0]?.publicUrl ?? null,
    }));
}

export async function buildVenueKnowledgeContext(venueId: string, requestedDate?: string | null) {
  const snapshot = await getVenueKnowledgeSnapshot(venueId);
  if (!snapshot) return null;

  const bottleMenu = snapshot.assets.find((asset) => asset.type === "BOTTLE_MENU") ?? null;
  const foodMenu = snapshot.assets.find((asset) => asset.type === "FOOD_MENU") ?? null;
  const hookahMenu = snapshot.assets.find((asset) => asset.type === "HOOKAH_MENU") ?? null;
  const resolvedEvents = await resolveVenueEventsForDate(venueId, requestedDate ?? null);

  return {
    venueId: snapshot.id,
    servesFood: snapshot.servesFood,
    servesHookah: snapshot.servesHookah,
    hasParking: snapshot.hasParking,
    hasValet: snapshot.hasValet,
    dressCodeSummary: snapshot.dressCodeSummary,
    agePolicySummary: snapshot.agePolicySummary,
    bottleMenu,
    foodMenu,
    hookahMenu,
    resolvedEvents,
  };
}

export function formatVenueKnowledgeForAi(input: {
  venueId: string;
  servesFood: boolean;
  servesHookah: boolean;
  hasParking: boolean;
  hasValet: boolean;
  dressCodeSummary: string | null;
  agePolicySummary: string | null;
  bottleMenu: { publicUrl: string } | null;
  foodMenu: { publicUrl: string } | null;
  hookahMenu: { publicUrl: string } | null;
  resolvedEvents: Array<{
    title: string;
    description: string | null;
    occurrenceDate: string;
    flyerUrl: string | null;
  }>;
}) {
  const lines = [
    `Food available: ${input.servesFood ? "Yes" : "No"}`,
    `Hookah available: ${input.servesHookah ? "Yes" : "No"}`,
    `Parking available: ${input.hasParking ? "Yes" : "No"}`,
    `Valet available: ${input.hasValet ? "Yes" : "No"}`,
    `Dress code: ${input.dressCodeSummary ?? "Not provided"}`,
    `Age policy: ${input.agePolicySummary ?? "Not provided"}`,
    `Bottle menu asset: ${input.bottleMenu ? input.bottleMenu.publicUrl : "Not provided"}`,
    `Food menu asset: ${input.foodMenu ? input.foodMenu.publicUrl : "Not provided"}`,
    `Hookah menu asset: ${input.hookahMenu ? input.hookahMenu.publicUrl : "Not provided"}`,
  ];

  if (input.resolvedEvents.length === 0) {
    lines.push("Event context: No matching event configured for the requested date.");
  } else {
    lines.push(
      `Event context:\n${input.resolvedEvents
        .map(
          (event) =>
            `- ${event.title} on ${event.occurrenceDate}. ${event.description ?? "No description."} Flyer: ${event.flyerUrl ?? "Not provided"}`,
        )
        .join("\n")}`,
    );
  }

  return lines.join("\n");
}

export { parseRecurringDays };
