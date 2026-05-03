import { scryptSync } from "crypto";
import dotenv from "dotenv";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: ".env.local" });
dotenv.config();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const adapter = new PrismaNeon({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

const adminPassword = "demo1234";
const operatorPassword = "demo1234";

function hashPlatformPassword(password) {
  return scryptSync(password, process.env.SESSION_SECRET ?? "tablecapture-admin-secret", 32).toString("hex");
}

function hashOperatorPassword(password) {
  return scryptSync(
    password,
    process.env.OPERATOR_SESSION_SECRET ?? process.env.SESSION_SECRET ?? "tablecapture-operator-secret",
    32,
  ).toString("hex");
}

async function main() {
  await prisma.platformUser.upsert({
    where: { email: "owner@getayana.com" },
    update: {},
    create: {
      email: "owner@getayana.com",
      fullName: "Platform Owner",
      role: "PLATFORM_OWNER",
      passwordHash: hashPlatformPassword(adminPassword),
      isActive: true,
    },
  });

  const venue = await prisma.venue.upsert({
    where: { slug: "bleu-martini" },
    update: {
      status: "ACTIVE",
      websiteChatEnabled: true,
      websiteChatWidgetKey: "bleu-martini-demo",
    },
    create: {
      slug: "bleu-martini",
      name: "Bleu Martini",
      addressLine1: "24 S 2nd St",
      city: "Philadelphia",
      state: "PA",
      postalCode: "19106",
      phoneNumber: "215-555-0198",
      timezone: "America/New_York",
      status: "ACTIVE",
      aiEnabled: true,
      channelsSummary: "Website Chat, SMS, Instagram DM, Phone",
      hoursSummary: "Thu-Sun, 9 PM-2 AM",
      primaryOperatorName: "Ayana Operator",
      primaryOperatorRole: "Venue Owner",
      primaryOperatorEmail: "operator@getayana.com",
      brandTone: "Warm, concise, premium nightlife concierge",
      responseSlaSeconds: 30,
      depositPolicy: "$250 deposit required to hold VIP table reservations.",
      servesFood: true,
      servesHookah: true,
      hasParking: true,
      hasValet: true,
      dressCodeSummary: "Upscale nightlife attire required.",
      agePolicySummary: "21+ with valid ID.",
      websiteChatEnabled: true,
      websiteChatWidgetKey: "bleu-martini-demo",
      websiteChatWelcomeMessage: "Hi, this is Ayana for Bleu Martini. I can help with VIP tables and bottle service.",
      websiteChatPromptPlaceholder: "Ask about tables, pricing, or availability...",
    },
  });

  await prisma.venueUser.upsert({
    where: { email: "operator@getayana.com" },
    update: { venueId: venue.id, isActive: true },
    create: {
      venueId: venue.id,
      email: "operator@getayana.com",
      fullName: "Ayana Operator",
      role: "VENUE_OWNER",
      passwordHash: hashOperatorPassword(operatorPassword),
      isActive: true,
    },
  });

  const tables = [
    ["VIP Booth", "VIP-BOOTH", 100000, 25000, 4, 6, "Comfortable VIP booth for smaller premium groups."],
    ["Dancefloor Prime", "DF-PRIME", 180000, 40000, 6, 8, "High-energy table near the DJ booth."],
    ["Owner's Section", "OWNERS", 300000, 60000, 8, 12, "Premium section for large celebrations and high-spend groups."],
  ];

  const tableOptions = [];
  for (const [name, code, minSpendCents, depositAmountCents, capacityMin, capacityMax, description] of tables) {
    tableOptions.push(
      await prisma.tableOption.upsert({
        where: { venueId_code: { venueId: venue.id, code } },
        update: { active: true },
        create: {
          venueId: venue.id,
          name,
          code,
          minSpendCents,
          depositAmountCents,
          capacityMin,
          capacityMax,
          quantity: 2,
          description,
          active: true,
        },
      }),
    );
  }

  const existingInquiries = await prisma.inquiry.count({ where: { venueId: venue.id } });
  if (existingInquiries === 0) {
    const now = new Date();
    const guests = [
      ["Maya Rivera", "WEBSITE_CHAT", "NEW", "Tonight, 10:30 PM", 5, "$1,000-$1,500", "Birthday table inquiry"],
      ["Chris Johnson", "SMS", "DEPOSIT_SENT", "Friday, 11:00 PM", 8, "$1,800-$2,500", "Deposit sent for dancefloor prime."],
      ["Nia Thompson", "INSTAGRAM_DM", "CONFIRMED", "Saturday, 11:45 PM", 6, "$1,200-$1,800", "Confirmed VIP booth reservation."],
    ];

    for (const [index, guest] of guests.entries()) {
      const [guestName, channel, status, requestedDateLabel, partySize, spendIntentLabel, nextAction] = guest;
      const tableOption = tableOptions[index % tableOptions.length];
      const inquiry = await prisma.inquiry.create({
        data: {
          venueId: venue.id,
          guestName,
          phone: `21555501${index}0`,
          channel,
          status,
          requestedAt: now,
          lastInboundAt: now,
          requestedDateLabel,
          partySize,
          spendIntentLabel,
          spendIntentMinCents: tableOption.minSpendCents,
          spendIntentMaxCents: tableOption.minSpendCents + 50000,
          occasion: index === 0 ? "Birthday" : "VIP night",
          aiConfidence: status === "NEW" ? 0.72 : 0.91,
          nextAction,
          messages: {
            create: {
              authorRole: "guest",
              content: `Can you help me book ${partySize} guests for ${requestedDateLabel}?`,
            },
          },
          quoteOptions: {
            create: {
              tableOptionId: tableOption.id,
              label: `${tableOption.name} for ${partySize}`,
              pitch: tableOption.description,
              sentAt: now,
            },
          },
        },
      });

      if (status !== "NEW") {
        await prisma.reservation.create({
          data: {
            inquiryId: inquiry.id,
            tableOptionId: tableOption.id,
            status: status === "CONFIRMED" ? "CONFIRMED" : "DEPOSIT_PENDING",
            depositAmountCents: tableOption.depositAmountCents,
            depositPaidCents: status === "CONFIRMED" ? tableOption.depositAmountCents : 0,
            confirmationCode: `BM-${String(index + 1).padStart(3, "0")}`,
            arrivalTimeLabel: requestedDateLabel,
          },
        });
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        adminLogin: "owner@getayana.com",
        operatorLogin: "operator@getayana.com",
        password: "demo1234",
        venue: venue.slug,
        widgetKey: venue.websiteChatWidgetKey,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
