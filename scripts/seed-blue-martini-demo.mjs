import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import "dotenv/config";

const adapter = new PrismaBetterSqlite3(
  { url: process.env.DATABASE_URL },
  { timestampFormat: "unixepoch-ms" },
);
const prisma = new PrismaClient({ adapter });

const venueName = "Bleu Martini";
const demoTag = "[demo-dashboard-2026-04-25]";

const guests = [
  {
    name: "Chris Johnson",
    phone: "6105550142",
    channel: "SMS",
    status: "CONFIRMED",
    time: "9:00 PM",
    partySize: 6,
    spend: "$1,200-$1,800",
    occasion: "Birthday",
    depositRequiredCents: 30000,
    depositPaidCents: 30000,
    tableIndex: 0,
    message: "We are all set for 9. Can you make sure the birthday sparkler comes out with the first bottle?",
  },
  {
    name: "Amanda Lee",
    phone: "6105550188",
    channel: "WEBSITE_CHAT",
    status: "CONFIRMED",
    time: "10:30 PM",
    partySize: 4,
    spend: "$800-$1,200",
    occasion: "Girls night",
    depositRequiredCents: 20000,
    depositPaidCents: 20000,
    tableIndex: 1,
    message: "Thanks for confirming. We will arrive around 10:30 and want something close to the DJ.",
  },
  {
    name: "Michael Brown",
    phone: "6105550199",
    channel: "INSTAGRAM_DM",
    status: "CONFIRMED",
    time: "11:00 PM",
    partySize: 8,
    spend: "$1,800-$2,500",
    occasion: "Client night",
    depositRequiredCents: 40000,
    depositPaidCents: 40000,
    tableIndex: 2,
    message: "Please keep the larger table. We may add two more guests if that works.",
  },
  {
    name: "Tasha Williams",
    phone: "6105550117",
    channel: "SMS",
    status: "DEPOSIT_PENDING",
    time: "11:30 PM",
    partySize: 10,
    spend: "$2,000-$3,000",
    occasion: "Group reservation",
    depositRequiredCents: 50000,
    depositPaidCents: 0,
    tableIndex: 3,
    message: "I received the deposit link and will pay this afternoon. Please hold the section.",
  },
  {
    name: "David Kim",
    phone: "6105550165",
    channel: "WEBSITE_CHAT",
    status: "DEPOSIT_PENDING",
    time: "12:00 AM",
    partySize: 5,
    spend: "$900-$1,400",
    occasion: "Friends visiting",
    depositRequiredCents: 25000,
    depositPaidCents: 10000,
    tableIndex: 1,
    message: "Can you resend the remaining deposit link? My card only processed part of it.",
  },
  {
    name: "Sarah Thompson",
    phone: "6105550105",
    channel: "SMS",
    status: "PENDING",
    time: "8:30 PM",
    partySize: 3,
    spend: "$500-$800",
    occasion: "Date night",
    depositRequiredCents: 15000,
    depositPaidCents: 0,
    tableIndex: 0,
    message: "Do you have availability for a table for 3 tonight?",
  },
  {
    name: "Deji Mensah",
    phone: "6105550133",
    channel: "INSTAGRAM_DM",
    status: "PENDING",
    time: "9:45 PM",
    partySize: 7,
    spend: "$1,300-$2,000",
    occasion: "After party",
    depositRequiredCents: 35000,
    depositPaidCents: 0,
    tableIndex: 2,
    message: "I voted your phone number as 6101234567. I will now prepare your reservation details.",
    needsHuman: true,
  },
  {
    name: "Priya Patel",
    phone: "6105550174",
    channel: "WEBSITE_CHAT",
    status: "DEPOSIT_PENDING",
    time: "10:00 PM",
    partySize: 6,
    spend: "$1,200-$1,800",
    occasion: "Bachelorette",
    depositRequiredCents: 40000,
    depositPaidCents: 0,
    tableIndex: 3,
    message: "Can the host confirm whether we can bring a small cake?",
    needsHuman: true,
  },
];

async function main() {
  const venue = await prisma.venue.findFirst({
    where: {
      OR: [{ name: venueName }, { name: "Blue Martini" }, { slug: "bleu-martini" }, { slug: "blue-martini" }],
    },
    include: {
      tableOptions: {
        where: { active: true },
        orderBy: [{ minSpendCents: "asc" }, { name: "asc" }],
      },
      venueUsers: {
        where: { isActive: true },
        orderBy: { fullName: "asc" },
      },
    },
  });

  if (!venue) {
    throw new Error(`Could not find ${venueName}.`);
  }

  if (venue.tableOptions.length === 0) {
    throw new Error(`${venue.name} needs at least one active table option before seeding reservations.`);
  }

  await prisma.alert.deleteMany({
    where: {
      venueId: venue.id,
      fingerprint: { startsWith: demoTag },
    },
  });

  const existingDemoInquiries = await prisma.inquiry.findMany({
    where: {
      venueId: venue.id,
      nextAction: { startsWith: demoTag },
    },
    select: { id: true },
  });

  if (existingDemoInquiries.length) {
    await prisma.inquiry.deleteMany({
      where: {
        id: { in: existingDemoInquiries.map((inquiry) => inquiry.id) },
      },
    });
  }

  await prisma.eventOccurrenceOverride.deleteMany({
    where: {
      venueId: venue.id,
      occurrenceDate: {
        in: [
          new Date("2026-04-25T00:00:00.000Z"),
          new Date("2026-05-02T00:00:00.000Z"),
          new Date("2026-05-09T00:00:00.000Z"),
        ],
      },
    },
  });

  const owner = venue.venueUsers[0] ?? null;
  const requestedAt = new Date("2026-04-25T18:00:00.000Z");

  for (const [index, guest] of guests.entries()) {
    const tableOption = venue.tableOptions[guest.tableIndex % venue.tableOptions.length];
    const inquiryStatus =
      guest.status === "CONFIRMED"
        ? "CONFIRMED"
        : guest.status === "DEPOSIT_PENDING"
          ? "DEPOSIT_SENT"
          : guest.needsHuman
            ? "NEEDS_HUMAN"
            : "QUALIFYING";

    const inquiry = await prisma.inquiry.create({
      data: {
        venueId: venue.id,
        assignedVenueUserId: owner?.id ?? null,
        guestName: guest.name,
        phone: guest.phone,
        channel: guest.channel,
        status: inquiryStatus,
        requestedAt,
        lastInboundAt: new Date(requestedAt.getTime() + index * 15 * 60 * 1000),
        requestedDateLabel: `Saturday, April 25, 2026 at ${guest.time}`,
        partySize: guest.partySize,
        spendIntentLabel: guest.spend,
        occasion: guest.occasion,
        aiConfidence: guest.needsHuman ? 0.54 : 0.86,
        nextAction: `${demoTag} ${guest.needsHuman ? "Operator review needed." : "Demo reservation seeded."}`,
        isHumanTakeover: Boolean(guest.needsHuman),
        messages: {
          create: [
            {
              authorRole: "guest",
              content: guest.message,
              createdAt: new Date(requestedAt.getTime() + index * 15 * 60 * 1000),
            },
            {
              authorRole: "ai",
              content:
                guest.status === "CONFIRMED"
                  ? "Your reservation is confirmed. The host team will have your table ready."
                  : "I can help hold that table while we collect the required deposit.",
              createdAt: new Date(requestedAt.getTime() + (index * 15 + 2) * 60 * 1000),
            },
          ],
        },
        quoteOptions: {
          create: {
            tableOptionId: tableOption.id,
            label: `${tableOption.name} for ${guest.partySize}`,
            pitch: `Best fit for ${guest.occasion.toLowerCase()} with ${guest.partySize} guests.`,
            sentAt: new Date(requestedAt.getTime() + (index * 15 + 4) * 60 * 1000),
          },
        },
      },
    });

    if (guest.status !== "PENDING") {
      await prisma.reservation.create({
        data: {
          inquiryId: inquiry.id,
          tableOptionId: tableOption.id,
          status: guest.status,
          depositAmountCents: guest.depositRequiredCents,
          depositPaidCents: guest.depositPaidCents,
          confirmationCode: `BM-${String(index + 1).padStart(3, "0")}-APR25`,
          arrivalTimeLabel: guest.time,
          notes: `${demoTag} Seeded dashboard reservation for April 25, 2026.`,
          updatedAt: new Date("2026-04-25T20:00:00.000Z"),
        },
      });
    }
  }

  const eventDates = [
    { date: "2026-04-25", title: "Ladies Night", description: "Saturday feature night with bottle specials." },
    { date: "2026-05-02", title: "DJ Bliss Live", description: "Guest DJ and late-night VIP push." },
    { date: "2026-05-09", title: "Summer Vibes", description: "Weekend event preview for table inquiries." },
  ];

  for (const event of eventDates) {
    await prisma.eventOccurrenceOverride.create({
      data: {
        venueId: venue.id,
        occurrenceDate: new Date(`${event.date}T00:00:00.000Z`),
        title: event.title,
        description: event.description,
      },
    });
  }

  await prisma.alert.createMany({
    data: [
      {
        venueId: venue.id,
        fingerprint: `${demoTag}:pending-deposits`,
        type: "DEPOSIT_PENDING",
        severity: "WARNING",
        title: "3 reservations have pending deposits",
        description: "Total outstanding amount is ready for follow-up.",
      },
      {
        venueId: venue.id,
        fingerprint: `${demoTag}:high-inquiry-volume`,
        type: "INQUIRY_VOLUME",
        severity: "INFO",
        title: "High inquiry volume",
        description: "7 new inquiries landed in the last two hours.",
      },
      {
        venueId: venue.id,
        fingerprint: `${demoTag}:table-maintenance`,
        type: "TABLE_MAINTENANCE",
        severity: "INFO",
        title: "Table 12 maintenance",
        description: "Table will be unavailable on May 27.",
      },
    ],
  });

  console.log(
    JSON.stringify(
      {
        venue: venue.name,
        inquiriesCreated: guests.length,
        reservationsCreated: guests.filter((guest) => guest.status !== "PENDING").length,
        eventsCreated: eventDates.length,
        alertsCreated: 3,
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
