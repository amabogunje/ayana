export const venueTimezones = [
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Phoenix", label: "Arizona Time" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "Pacific/Honolulu", label: "Hawaii Time" },
] as const;

export const venueChannels = [
  { value: "WEBSITE_CHAT", label: "Website Chat", enabled: true },
  { value: "SMS", label: "SMS", enabled: true },
  { value: "INSTAGRAM_DM", label: "Instagram", enabled: true },
  { value: "WHATSAPP", label: "WhatsApp", enabled: false },
  { value: "PHONE", label: "Phone", enabled: false },
] as const;

export const brandToneOptions = [
  {
    value: "Modern, premium, confident nightlife host",
    label: "Premium nightlife",
  },
  {
    value: "Refined, concise, hospitality-first",
    label: "Refined hospitality",
  },
  {
    value: "High-energy, celebratory, fast-moving",
    label: "High-energy club",
  },
  {
    value: "Upscale, polished, lounge-forward",
    label: "Upscale lounge",
  },
] as const;

export const operatingDays = [
  { key: "monday", label: "Mon" },
  { key: "tuesday", label: "Tue" },
  { key: "wednesday", label: "Wed" },
  { key: "thursday", label: "Thu" },
  { key: "friday", label: "Fri" },
  { key: "saturday", label: "Sat" },
  { key: "sunday", label: "Sun" },
] as const;
