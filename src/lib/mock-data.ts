import { DashboardData } from "@/lib/dashboard-types";

export const mockDashboardData: DashboardData = {
  kpis: [
    { label: "Inbound inquiries", value: "84", change: "+22% vs last weekend" },
    { label: "Median first response", value: "18 sec", change: "-91% faster than staff only" },
    { label: "Deposit conversion", value: "31%", change: "+11 pts on pilot benchmark" },
    { label: "Captured revenue", value: "$12.8K", change: "From 17 confirmed bookings" },
  ],
  inquiries: [
    {
      id: "INQ-204",
      guestName: "Jalen M.",
      channel: "Instagram",
      status: "Deposit Sent",
      venue: "Luma Saturdays",
      spendIntent: "$1,500-$2,000",
      partySize: 8,
      requestedFor: "Tonight, 11:30 PM",
      lastMessage: "If we do the dancefloor table, can you guarantee birthday signage?",
      nextAction: "Follow up in 6 min if deposit link unopened",
      aiConfidence: 0.92,
    },
    {
      id: "INQ-198",
      guestName: "Maya R.",
      channel: "SMS",
      status: "Qualifying",
      venue: "Solstice Lounge",
      spendIntent: "$800-$1,200",
      partySize: 5,
      requestedFor: "Friday, 10:45 PM",
      lastMessage: "Looking for a girls night table, not too crazy on spend.",
      nextAction: "Ask for arrival time and hookah preference",
      aiConfidence: 0.88,
    },
    {
      id: "INQ-191",
      guestName: "Chris P.",
      channel: "Phone",
      status: "Needs Human",
      venue: "Luma Saturdays",
      spendIntent: "$3,000+",
      partySize: 14,
      requestedFor: "Tonight, 12:15 AM",
      lastMessage: "Need two adjacent tables and custom champagne parade.",
      nextAction: "Route to VIP manager immediately",
      aiConfidence: 0.41,
    },
    {
      id: "INQ-185",
      guestName: "Nia T.",
      channel: "Instagram",
      status: "Confirmed",
      venue: "Solstice Lounge",
      spendIntent: "$1,200-$1,500",
      partySize: 6,
      requestedFor: "Saturday, 11:00 PM",
      lastMessage: "Deposit paid. See you Saturday.",
      nextAction: "Send confirmation and host notes",
      aiConfidence: 0.97,
    },
  ],
  tableOptions: [
    {
      name: "Dancefloor Prime",
      minSpend: "$2,000 minimum",
      capacity: "Up to 8 guests",
      positioning: "Best for birthdays and high-energy groups near the DJ.",
    },
    {
      name: "Main Room Luxe",
      minSpend: "$1,250 minimum",
      capacity: "Up to 6 guests",
      positioning: "Balanced option for bottle service with strong visibility.",
    },
    {
      name: "Lounge Entry",
      minSpend: "$850 minimum",
      capacity: "Up to 5 guests",
      positioning: "Entry-point VIP option designed to close budget-conscious leads.",
    },
  ],
  aiFlow: [
    {
      title: "Capture",
      body: "Webhook ingests inbound SMS, DM, or call transcript and normalizes the lead into a single booking inbox.",
    },
    {
      title: "Qualify",
      body: "AI agent gathers date, party size, spend, occasion, and preferences using venue-specific prompts and guardrails.",
    },
    {
      title: "Quote",
      body: "Rules engine returns approved table options and deposit terms; the AI frames them in a high-conversion sales pitch.",
    },
    {
      title: "Commit",
      body: "Guest receives a payment link, confirmation summary, and automated reminder sequence until the reservation is closed.",
    },
  ],
  conversationMoments: [
    {
      speaker: "Guest",
      content: "Hey, I need a table tonight for 8. What's available near the DJ?",
    },
    {
      speaker: "AI Host",
      content:
        "I can help with that. For 8 guests tonight, our best near-DJ fit is Dancefloor Prime at a $2,000 minimum. If you want, I can also show a slightly lower-spend option with strong floor visibility.",
    },
    {
      speaker: "Guest",
      content: "What's needed to lock it in?",
    },
    {
      speaker: "AI Host",
      content:
        "A $400 deposit secures the table and gets your name on the host list. I can send the payment link now and note that it's for a birthday group.",
    },
  ],
  source: "mock",
};
