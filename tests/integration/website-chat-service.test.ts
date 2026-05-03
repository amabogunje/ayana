import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  buildWebsiteChatSnippet,
  getWebsiteChatWidgetConfig,
  isWebsiteChatListedInChannels,
  startWebsiteChatSession,
} from "@/lib/website-chat-service";
import { createVenue, resetDatabase } from "../helpers/db";

describe("website chat service", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("detects website chat in channel summaries", () => {
    expect(isWebsiteChatListedInChannels("SMS, Website Chat")).toBe(true);
    expect(isWebsiteChatListedInChannels("SMS, Instagram DM")).toBe(false);
  });

  it("builds a widget snippet from app URL and widget key", () => {
    expect(buildWebsiteChatSnippet({ appUrl: "https://app.example.com/", widgetKey: "wc_123" })).toBe(
      '<script async src="https://app.example.com/api/widget.js" data-widget-key="wc_123"></script>',
    );
  });

  it("returns widget config for enabled active venues", async () => {
    const venue = await createVenue({
      name: "Luna Room",
      websiteChatAllowedOrigins: "https://club.example.com",
      websiteChatWelcomeMessage: "Welcome in.",
    });

    const config = await getWebsiteChatWidgetConfig(venue.websiteChatWidgetKey!, "https://club.example.com/");

    expect(config.venueId).toBe(venue.id);
    expect(config.venueName).toBe("Luna Room");
    expect(config.welcomeMessage).toBe("Welcome in.");
  });

  it("blocks disallowed widget origins", async () => {
    const venue = await createVenue({
      websiteChatAllowedOrigins: "https://club.example.com",
    });

    await expect(getWebsiteChatWidgetConfig(venue.websiteChatWidgetKey!, "https://evil.example.com")).rejects.toThrow(
      "Website chat is not allowed from this origin.",
    );
  });

  it("starts a session with inquiry, messages, session record, and activity log", async () => {
    const venue = await createVenue({
      websiteChatAllowedOrigins: "https://club.example.com",
    });

    const result = await startWebsiteChatSession({
      widgetKey: venue.websiteChatWidgetKey!,
      origin: "https://club.example.com/",
      guestName: "Morgan Lee",
      phone: "555-0100",
      requestedDateLabel: "Saturday",
      partySize: 5,
      spendIntentLabel: "$2000",
      message: "Looking for a table Saturday.",
    });

    const session = await prisma.websiteChatSession.findUnique({
      where: { sessionToken: result.sessionToken },
      include: { inquiry: { include: { messages: true } } },
    });
    const activityCount = await prisma.activityLog.count({
      where: { action: "website_chat.session_started" },
    });

    expect(session?.guestDisplayName).toBe("Morgan Lee");
    expect(session?.origin).toBe("https://club.example.com");
    expect(session?.inquiry.partySize).toBe(5);
    expect(session?.inquiry.messages).toHaveLength(2);
    expect(activityCount).toBe(1);
  });
});
