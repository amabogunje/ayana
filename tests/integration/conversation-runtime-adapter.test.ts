import { describe, expect, it } from "vitest";
import { createNoopAgentRunResult } from "@/lib/agent/agent-runner";
import {
  createWebsiteChatConversationSnapshot,
  createWebsiteChatMessageReceivedEvent,
} from "@/lib/conversation/message-normalizer";
import { getDefaultVenueAgentConfig } from "@/lib/venue-agent/venue-agent-config-service";

describe("conversation runtime adapter", () => {
  it("normalizes website chat messages into shared conversation event and snapshot shapes", () => {
    const createdAt = new Date("2026-05-16T12:00:00.000Z");
    const event = createWebsiteChatMessageReceivedEvent({
      venueId: "venue_1",
      inquiryId: "inquiry_1",
      sessionId: "session_1",
      origin: "https://club.example.com",
      occurredAt: createdAt,
      message: {
        id: "message_1",
        authorRole: "guest",
        content: "  Looking   for a table Friday. ",
        createdAt,
      },
    });
    const snapshot = createWebsiteChatConversationSnapshot({
      inquiry: {
        id: "inquiry_1",
        venueId: "venue_1",
        status: "QUALIFYING",
        requestedDateLabel: "Friday",
        partySize: 4,
        spendIntentLabel: "Not provided yet",
        occasion: null,
        phone: null,
        aiConfidence: 0.7,
        nextAction: "Continue qualification.",
        isHumanTakeover: false,
        messages: [
          {
            id: "message_1",
            authorRole: "guest",
            content: "Looking for a table Friday.",
            createdAt,
          },
        ],
      },
    });

    expect(event.kind).toBe("message_received");
    expect(event.channel).toBe("website_chat");
    expect(event.conversationId).toBe("inquiry_1");
    expect(event.message?.direction).toBe("inbound");
    expect(event.message?.content).toBe("Looking for a table Friday.");
    expect(event.metadata?.guestMessageId).toBe("message_1");
    expect(snapshot.channel).toBe("website_chat");
    expect(snapshot.state).toBe("QUALIFYING");
    expect(snapshot.qualification).toMatchObject({
      requestedDateLabel: "Friday",
      partySize: 4,
      spendIntentLabel: null,
    });
  });

  it("keeps unsupported channels blocked until a channel executor exists", () => {
    const config = getDefaultVenueAgentConfig({
      venueId: "venue_1",
      venueName: "Runtime Room",
    });
    const unsupportedChannels = ["sms", "instagram_dm", "whatsapp", "email", "voice", "operator_dashboard"] as const;

    for (const channel of unsupportedChannels) {
      const result = createNoopAgentRunResult({
        venueId: "venue_1",
        config,
        conversation: {
          id: "conversation_1",
          venueId: "venue_1",
          channel,
          state: "NEW",
          qualification: {},
          messages: [],
          isHumanTakeover: false,
        },
        event: {
          kind: "message_received",
          channel,
          venueId: "venue_1",
          conversationId: "conversation_1",
          occurredAt: new Date("2026-05-16T12:00:00.000Z"),
        },
      });

      expect(result.status).toBe("blocked");
      expect(result.diagnostics?.[0]).toContain("not implemented yet");
    }
  });
});
