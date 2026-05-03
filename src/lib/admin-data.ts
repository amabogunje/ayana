export const adminKpis = [
  {
    label: "Confirmed bookings",
    value: "126",
    detail: "Across all active venues in the current reporting window",
  },
  {
    label: "Deposit conversion",
    value: "34%",
    detail: "Average across live venues with AI currently enabled",
  },
  {
    label: "Estimated booked revenue",
    value: "$86.4K",
    detail: "Based on confirmed table minimums, not realized venue spend",
  },
  {
    label: "Flagged threads",
    value: "9",
    detail: "Escalated or anomalous conversations awaiting review",
  },
];

export const portfolioSummary = [
  { label: "Week 1", confirmed: 38, deposit: 46, revenue: 54 },
  { label: "Week 2", confirmed: 49, deposit: 58, revenue: 62 },
  { label: "Week 3", confirmed: 52, deposit: 61, revenue: 68 },
  { label: "Week 4", confirmed: 61, deposit: 67, revenue: 74 },
];

export const venuePerformance = [
  {
    name: "Luma Saturdays",
    city: "Miami",
    status: "Active",
    statusTone: "success",
    aiState: "Live",
    channels: "SMS, Instagram, WhatsApp",
    confirmed: "41",
    depositConversion: "39%",
    bookedRevenue: "$28.5K",
    lastActivity: "Updated 6 min ago",
    alertCount: "2",
  },
  {
    name: "Solstice Lounge",
    city: "New York",
    status: "Pilot",
    statusTone: "warning",
    aiState: "Live",
    channels: "SMS, Instagram",
    confirmed: "27",
    depositConversion: "31%",
    bookedRevenue: "$17.8K",
    lastActivity: "Updated 11 min ago",
    alertCount: "3",
  },
  {
    name: "Monarch Room",
    city: "Las Vegas",
    status: "Paused",
    statusTone: "neutral",
    aiState: "Paused",
    channels: "SMS, Phone",
    confirmed: "18",
    depositConversion: "28%",
    bookedRevenue: "$12.2K",
    lastActivity: "Updated 28 min ago",
    alertCount: "1",
  },
  {
    name: "Saint Social",
    city: "Los Angeles",
    status: "Draft",
    statusTone: "neutral",
    aiState: "Not live",
    channels: "Setup pending",
    confirmed: "0",
    depositConversion: "-",
    bookedRevenue: "-",
    lastActivity: "Onboarding in progress",
    alertCount: "0",
  },
];

export const flaggedThreads = [
  {
    id: "thread-1",
    flag: "High-value escalation",
    tone: "danger",
    venue: "Luma Saturdays",
    guest: "Chris P.",
    summary:
      "Guest requested adjacent tables, champagne parade coordination, and a custom host arrival flow. AI escalated because the booking exceeds standard table rules.",
    channel: "Phone",
    updatedAt: "2 min ago",
  },
  {
    id: "thread-2",
    flag: "Low confidence pattern",
    tone: "warning",
    venue: "Solstice Lounge",
    guest: "Maya R.",
    summary:
      "Three similar budget-sensitive groups requested mixed standing and seated access. AI confidence dropped after venue policy ambiguity around Friday upsell rules.",
    channel: "SMS",
    updatedAt: "14 min ago",
  },
  {
    id: "thread-3",
    flag: "Payment friction",
    tone: "neutral",
    venue: "Monarch Room",
    guest: "Nia T.",
    summary:
      "Deposit link was opened twice but not completed. System flagged the thread because venue AI is paused and manual follow-up has not started yet.",
    channel: "Instagram",
    updatedAt: "31 min ago",
  },
];

export const alertPatterns = [
  {
    title: "AI confidence drift",
    description: "Repeated low-confidence threads tied to inconsistent venue rule coverage.",
    count: "3 venues",
  },
  {
    title: "Deposit completion friction",
    description: "Guests are clicking payment links but not consistently completing them.",
    count: "7 threads",
  },
  {
    title: "Paused venue backlog risk",
    description: "Paused venues with live demand need manual handling assurance.",
    count: "1 venue",
  },
];

export const analyticsRows = [
  {
    week: "Apr 1 - Apr 7",
    inquiries: "212",
    confirmed: "28",
    depositConversion: "29%",
    bookedRevenue: "$19.1K",
    escalationRate: "8%",
  },
  {
    week: "Apr 8 - Apr 14",
    inquiries: "238",
    confirmed: "31",
    depositConversion: "32%",
    bookedRevenue: "$21.6K",
    escalationRate: "7%",
  },
  {
    week: "Apr 15 - Apr 21",
    inquiries: "264",
    confirmed: "36",
    depositConversion: "34%",
    bookedRevenue: "$23.8K",
    escalationRate: "6%",
  },
  {
    week: "Apr 22 - Apr 28",
    inquiries: "281",
    confirmed: "31",
    depositConversion: "33%",
    bookedRevenue: "$21.9K",
    escalationRate: "7%",
  },
];

export const settingsGroups = [
  {
    eyebrow: "AI policy",
    title: "Global AI controls",
    items: [
      { label: "Qualification flow", value: "Required before quoting" },
      { label: "High-value escalation threshold", value: "$3,000+" },
      { label: "Default follow-up cadence", value: "6 minutes" },
      { label: "Transcript retention", value: "Enabled" },
    ],
  },
  {
    eyebrow: "Platform operations",
    title: "Service controls",
    items: [
      { label: "Venue lifecycle model", value: "Draft / Pilot / Active / Paused / Deactivated" },
      { label: "Admin access inside venues", value: "View only" },
      { label: "Pause AI authority", value: "Platform admin" },
      { label: "Deactivation authority", value: "Platform owner" },
    ],
  },
];
